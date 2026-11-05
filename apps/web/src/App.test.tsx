import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ru } from './i18n/ru';
import { uz } from './i18n/uz';
import type { SceneProps } from './viewer/Scene';

// WebGL is not available in jsdom: replace only the 3D scene with a stub that exposes what it
// receives. The viewer shell (buttons, dimension labels, banners) is the real one.
vi.mock('./viewer/Scene', () => ({
  MM: 0.001,
  Scene: ({ view, doorsOpen }: SceneProps) => (
    <div
      data-testid="viewer-stub"
      data-doors-open={String(doorsOpen)}
      data-panels={view.result.panels.filter((p) => !INTERIOR_ROLES.has(p.role)).length}
      data-interior-panels={view.result.panels.filter((p) => INTERIOR_ROLES.has(p.role)).length}
      data-sections={view.result.sections.map((s) => s.innerWidthMm).join(',')}
      data-back={view.result.panels.find((p) => p.id === 'back')?.lengthMm}
      data-corpus={view.result.panels.find((p) => p.id === 'side-left')?.material}
      data-doors={[
        ...new Set(view.result.panels.filter((p) => p.role === 'door').map((p) => p.material)),
      ].join(',')}
    />
  ),
}));

const INTERIOR_ROLES = new Set([
  'shelf',
  'drawer_front',
  'drawer_side',
  'drawer_back',
  'drawer_bottom',
]);
const { App } = await import('./App');

function setUrl(search: string) {
  window.history.replaceState(null, '', `/${search}`);
}

afterEach(() => {
  cleanup();
  setUrl('');
});

const tab = (label: string) =>
  within(screen.getByRole('navigation')).getByRole('button', { name: new RegExp(label) });

function typeInto(label: string, value: string) {
  const input = screen.getByRole('textbox', { name: label });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe('App (customer mode)', () => {
  it('renders in Uzbek with size, color and doors steps active, others disabled', () => {
    render(<App />);
    expect(screen.getByText(uz['app.title'])).toBeTruthy();
    expect(screen.getByRole('button', { name: /O'lcham/ }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: /Rang/ }).hasAttribute('disabled')).toBe(false);
    expect(tab(uz['step.doors']).hasAttribute('disabled')).toBe(false);
    for (const key of ['step.interior', 'step.review'] as const) {
      expect(
        screen.getByRole('button', { name: new RegExp(uz[key]) }).hasAttribute('disabled'),
      ).toBe(true);
    }
    const stub = screen.getByTestId('viewer-stub');
    // D-1b door rules: 1360 mm -> 3 sections with single doors (2 would need adjacent doubles)
    expect(stub.dataset.panels).toBe('12'); // 9 carcass + 3 door leaves
    expect(stub.dataset.sections).toBe('432,432,432');
  });

  it('changing width regenerates the engine result', () => {
    render(<App />);
    typeInto(uz['param.width'], '2000');
    const stub = screen.getByTestId('viewer-stub');
    expect(stub.dataset.sections).toBe('480,480,480,480');
    expect(stub.dataset.back).toBe('2000');
    expect(screen.getByTestId('summary').textContent).toContain('2000 × 1900 × 516');
  });

  it('a width with no valid door layout is held at the nearest valid one, with a toast', () => {
    render(<App />);
    typeInto(uz['param.width'], '2400'); // 4 x 580: both end sections would need doubles
    const stub = screen.getByTestId('viewer-stub');
    expect(stub.dataset.back).toBe('2399');
    expect(stub.dataset.sections).toBe('580,580,580,579');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(
      `${uz['param.width']}: «2400» → «2399». Sabab: ${uz['reason.HINGE_CONFLICT']}.`,
    );
  });

  it('hard-clamps out-of-range input and hides staff-only parameters', () => {
    render(<App />);
    typeInto(uz['param.width'], '9999'); // clamped to 2400, then held at 2399 (door layout)
    expect(screen.getByTestId('viewer-stub').dataset.back).toBe('2399');
    expect(screen.queryByRole('textbox', { name: uz['param.plinthRecess'] })).toBeNull();
    expect(screen.queryByText(uz['staff.download'])).toBeNull();
    expect(screen.queryByText(uz['staff.badge'])).toBeNull();
  });

  it('stepper buttons change the value by the template step', () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole('button', { name: `${uz['param.height']}: ${uz['control.increase']}` }),
    );
    expect(screen.getByTestId('summary').textContent).toContain('1360 × 1910 × 516');
  });

  it('switches language to Russian', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: uz['lang.ru'] }));
    expect(screen.getByText(ru['app.title'])).toBeTruthy();
    expect(screen.getByRole('textbox', { name: ru['param.width'] })).toBeTruthy();
  });
});

describe('App color step', () => {
  const openColorStep = () => fireEvent.click(tab(uz['step.color']));
  const corpus = () => screen.getByRole('radiogroup', { name: uz['param.corpusMaterial'] });
  const doorSwatches = () => screen.getByRole('radiogroup', { name: uz['param.doorMaterial'] });
  const swatch = (group: HTMLElement, id: string) => {
    const el = group.querySelector(`[data-material="${id}"]`);
    if (!el) throw new Error(`swatch ${id} missing`);
    return el;
  };

  it('corpus decor applies to carcass and (same as corpus) doors', () => {
    render(<App />);
    openColorStep();
    // customer sees the 5 placeholder decors, not the staff-only 18 mm board
    expect(corpus().querySelectorAll('.swatch').length).toBe(5);
    fireEvent.click(swatch(corpus(), 'ldsp_anthracite_16'));
    const stub = screen.getByTestId('viewer-stub');
    expect(stub.dataset.corpus).toBe('ldsp_anthracite_16');
    expect(stub.dataset.doors).toBe('ldsp_anthracite_16');
    expect(swatch(corpus(), 'ldsp_anthracite_16').getAttribute('aria-checked')).toBe('true');
    expect(
      screen.getByRole('switch', { name: uz['color.sameAsCorpus'] }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('a door swatch turns "same as corpus" off; the toggle turns it back on', () => {
    render(<App />);
    openColorStep();
    fireEvent.click(swatch(doorSwatches(), 'ldsp_oak_light_16'));
    const stub = screen.getByTestId('viewer-stub');
    expect(stub.dataset.corpus).toBe('ldsp_white_16');
    expect(stub.dataset.doors).toBe('ldsp_oak_light_16');
    const toggle = screen.getByRole('switch', { name: uz['color.sameAsCorpus'] });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(stub.dataset.doors).toBe('ldsp_white_16');
  });

  it('staff mode also offers the 18 mm board, and it changes the geometry', () => {
    setUrl('?mode=staff');
    render(<App />);
    openColorStep();
    fireEvent.click(swatch(corpus(), 'ldsp_white_18'));
    expect(screen.getByTestId('viewer-stub').dataset.sections).toBe('430,429,429');
  });
});

describe('App doors', () => {
  const sectionLabels = () => document.querySelectorAll('[data-dim^="section-"]').length;

  it('door toggle opens/closes doors; section widths only show while open', () => {
    render(<App />);
    const stub = screen.getByTestId('viewer-stub');
    const button = screen.getByRole('button', { name: uz['viewer.doorsOpen'] });
    expect(stub.dataset.doorsOpen).toBe('false');
    expect(sectionLabels()).toBe(0);
    expect(document.querySelector('[data-dim="width"]')?.textContent).toBe('1360 mm');

    fireEvent.click(button);
    expect(stub.dataset.doorsOpen).toBe('true');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toBe(uz['viewer.doorsClose']);
    expect(sectionLabels()).toBe(3);

    fireEvent.click(button);
    expect(stub.dataset.doorsOpen).toBe('false');
    expect(sectionLabels()).toBe(0);
  });

  it('doors step: "no doors" removes the leaves and the toggle, sections become visible', () => {
    render(<App />);
    fireEvent.click(tab(uz['step.doors']));
    const preset = screen.getByRole('radiogroup', { name: uz['param.doors'] });
    fireEvent.click(within(preset).getByRole('radio', { name: uz['option.doors.none'] }));
    // without doors, auto goes back to the shelf-span rule only: 2 sections
    expect(screen.getByTestId('viewer-stub').dataset.panels).toBe('8');
    expect(screen.queryByRole('button', { name: uz['viewer.doorsOpen'] })).toBeNull();
    expect(sectionLabels()).toBe(2);
    // per-section overrides are staff-only
    expect(screen.queryByRole('radiogroup', { name: "1-bo'lim eshigi" })).toBeNull();
  });
});

describe('App (staff mode)', () => {
  it('shows the depth breakdown and per-section door overrides', () => {
    setUrl('?mode=staff');
    render(<App />);
    expect(screen.getByTestId('hint-depth').textContent).toBe(
      'Orqa 3 + korpus 495 + tirqish 2 + eshik 16 = 516 mm',
    );
    fireEvent.click(tab(uz['step.doors']));
    expect(screen.getByRole('radiogroup', { name: "1-bo'lim eshigi" })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: "2-bo'lim eshigi" })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: "3-bo'lim eshigi" })).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: "4-bo'lim eshigi" })).toBeNull();
    const s1 = screen.getByRole('radiogroup', { name: "1-bo'lim eshigi" });
    expect(
      within(s1)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Umumiy', "Yo'q", 'Chap ilmoq', "O'ng ilmoq", 'Ikki tabaqali']);
  });

  it('shows the stale-model banner while params are invalid', () => {
    setUrl('?mode=staff');
    render(<App />);
    expect(screen.queryByRole('alert')).toBeNull();
    // staff may pick 2 sections at 1360: two adjacent double doors -> HINGE_CONFLICT
    const sections = screen.getByRole('radiogroup', { name: uz['param.sections'] });
    fireEvent.click(within(sections).getByRole('radio', { name: '2' }));
    expect(screen.getByRole('alert').textContent).toContain(uz['viewer.invalid']);
    expect(screen.getAllByText('HINGE_CONFLICT').length).toBe(1);
    fireEvent.click(tab(uz['step.doors']));
    const preset = screen.getByRole('radiogroup', { name: uz['param.doors'] });
    fireEvent.click(within(preset).getByRole('radio', { name: uz['option.doors.all_single'] }));
    expect(screen.getAllByText('DOOR_TOO_WIDE').length).toBe(2); // 677 mm leaves
    fireEvent.click(within(preset).getByRole('radio', { name: uz['option.doors.none'] }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows all params, unconfirmed markers, issues and the download button', () => {
    setUrl('?mode=staff');
    render(<App />);
    expect(screen.getByText(uz['mode.staff'])).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: uz['param.backPanel'] })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: uz['param.plinthRecess'] })).toBeTruthy();
    expect(screen.getAllByText(uz['staff.badge']).length).toBeGreaterThan(0);
    expect(screen.getByText(uz['staff.download'])).toBeTruthy();
    expect(screen.getByText(uz['staff.noIssues'])).toBeTruthy();
  });

  it('shows SHELF_SPAN warning and out-of-range errors from the engine', () => {
    setUrl('?mode=staff');
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: '1' }));
    expect(screen.getByText('SHELF_SPAN')).toBeTruthy();
    typeInto(uz['param.width'], '3000');
    expect(screen.getByText('OUT_OF_RANGE')).toBeTruthy();
    // viewer keeps the last valid model
    expect(screen.getByTestId('viewer-stub').dataset.panels).toBe('9'); // 1 section, double door
  });
});

describe('Brand logo in the header', () => {
  it.each(['', '?mode=staff'])('shows dafna-logo.svg (url "%s")', (search) => {
    setUrl(search);
    render(<App />);
    const logo = within(screen.getByRole('banner')).getByRole('img', { name: 'Dafna' });
    expect(logo.getAttribute('src')).toBe('/brand/dafna-logo.svg');
  });
});

describe('Option availability (customer disables error-producing door options)', () => {
  const doorsPreset = () => screen.getByRole('radiogroup', { name: uz['param.doors'] });
  const option = (name: string) =>
    within(doorsPreset()).getByRole('radio', { name: new RegExp(name) });

  it('customer: "all single" is disabled with a reason when a leaf would exceed 600 mm', () => {
    render(<App />);
    typeInto(uz['param.width'], '1207'); // 2 sections 580/579: section 1 single leaf = 601
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: uz['param.sections'] })).getByRole('radio', {
        name: '2',
      }),
    ); // explicit 2 sections (auto would just pick 3)
    fireEvent.click(tab(uz['step.doors']));
    const allSingle = option(uz['option.doors.all_single']);
    expect(allSingle.hasAttribute('disabled')).toBe(true);
    expect(allSingle.textContent).toContain(uz['reason.DOOR_TOO_WIDE']);
    expect(option(uz['option.doors.auto']).hasAttribute('disabled')).toBe(false);
    expect(option(uz['option.doors.none']).hasAttribute('disabled')).toBe(false);
  });

  it('staff: the same option stays selectable', () => {
    setUrl('?mode=staff');
    render(<App />);
    fireEvent.click(tab(uz['step.doors']));
    expect(option(uz['option.doors.all_single']).hasAttribute('disabled')).toBe(false);
  });

  it('customer: widening the wardrobe resets an option that became invalid (no stale model)', () => {
    render(<App />);
    typeInto(uz['param.width'], '1206'); // 2 sections, leaves exactly 600 -> single doors allowed
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: uz['param.sections'] })).getByRole('radio', {
        name: '2',
      }),
    ); // explicit 2 sections (auto would just pick 3)
    fireEvent.click(tab(uz['step.doors']));
    fireEvent.click(option(uz['option.doors.all_single']));
    expect(option(uz['option.doors.all_single']).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(tab(uz['step.size']));
    typeInto(uz['param.width'], '1207'); // leaf 601 -> all_single would be DOOR_TOO_WIDE
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(tab(uz['step.doors']));
    expect(option(uz['option.doors.auto']).getAttribute('aria-checked')).toBe('true');
  });
});

describe('Selection state contract', () => {
  it('"same as corpus" on: no door swatch is shown as selected', () => {
    render(<App />);
    fireEvent.click(tab(uz['step.color']));
    const doors = screen.getByRole('radiogroup', { name: uz['param.doorMaterial'] });
    expect(within(doors).queryAllByRole('radio', { checked: true })).toEqual([]);
    const corpus = screen.getByRole('radiogroup', { name: uz['param.corpusMaterial'] });
    expect(within(corpus).getAllByRole('radio', { checked: true }).length).toBe(1);
  });

  it('option groups sit in pastel cards, numeric controls in a neutral card', () => {
    render(<App />);
    expect(document.querySelector('.card-neutral[data-card="width"]')).toBeTruthy();
    expect(document.querySelector('.card-pastel[data-card="sections"]')).toBeTruthy();
    expect(document.querySelectorAll('.card[data-card="height"]').length).toBe(0); // grouped
  });
});

describe('Customer blocks SHELF_SPAN options (any step)', () => {
  const sections = () => screen.getByRole('radiogroup', { name: uz['param.sections'] });
  const opt = (n: string) =>
    within(sections())
      .getAllByRole('radio')
      .find((r) => r.querySelector('.segment-label')?.textContent === n) as HTMLElement;

  it('customer at 1360: "1" disabled (SHELF_SPAN), "2" disabled (HINGE_CONFLICT), 3-4 enabled', () => {
    render(<App />);
    expect(opt('1').hasAttribute('disabled')).toBe(true);
    expect(opt('1').textContent).toContain(uz['reason.SHELF_SPAN']);
    expect(opt('2').hasAttribute('disabled')).toBe(true);
    expect(opt('2').textContent).toContain(uz['reason.HINGE_CONFLICT']);
    for (const n of ['3', '4']) expect(opt(n).hasAttribute('disabled')).toBe(false);
  });

  it('staff: "1" stays selectable and shows the SHELF_SPAN warning', () => {
    setUrl('?mode=staff');
    render(<App />);
    expect(opt('1').hasAttribute('disabled')).toBe(false);
    fireEvent.click(opt('1'));
    expect(screen.getByText('SHELF_SPAN')).toBeTruthy();
  });

  it('customer: widening resets sections=1 to auto instead of producing SHELF_SPAN', () => {
    render(<App />);
    typeInto(uz['param.width'], '900'); // 1 section: 868 mm inner -> allowed
    fireEvent.click(opt('1'));
    expect(opt('1').getAttribute('aria-checked')).toBe('true');
    typeInto(uz['param.width'], '1360');
    expect(opt(uz['option.sections.auto']).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('viewer-stub').dataset.sections).toBe('432,432,432');
  });
});

describe('Auto-reset toast (customer choice is never changed silently)', () => {
  const sections = () => screen.getByRole('radiogroup', { name: uz['param.sections'] });
  const opt = (n: string) =>
    within(sections())
      .getAllByRole('radio')
      .find((r) => r.querySelector('.segment-label')?.textContent === n) as HTMLElement;
  const resetToOne = () => {
    typeInto(uz['param.width'], '900');
    fireEvent.click(opt('1'));
    expect(screen.queryByTestId('reset-toast')).toBeNull(); // own choice: no toast
    typeInto(uz['param.width'], '1360');
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows what changed and why, inside the sheet, in Uzbek', () => {
    render(<App />);
    resetToOne();
    const toast = screen.getByRole('status');
    expect(toast.closest('.panel')).toBeTruthy(); // inside the configurator sheet
    expect(toast.textContent).toContain(
      `${uz['param.sections']}: «1» → «${uz['option.sections.auto']}». Sabab: ${uz['reason.SHELF_SPAN']}.`,
    );
  });

  it('is dismissible', () => {
    render(<App />);
    resetToOne();
    fireEvent.click(screen.getByRole('button', { name: uz['toast.dismiss'] }));
    expect(screen.queryByTestId('reset-toast')).toBeNull();
  });

  it('disappears after 3 s', () => {
    vi.useFakeTimers();
    render(<App />);
    resetToOne();
    expect(screen.getByTestId('reset-toast')).toBeTruthy();
    act(() => vi.advanceTimersByTime(2900));
    expect(screen.getByTestId('reset-toast')).toBeTruthy();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByTestId('reset-toast')).toBeNull();
  });

  it('is translated to Russian', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: uz['lang.ru'] }));
    typeInto(ru['param.width'], '900');
    const ruSections = screen.getByRole('radiogroup', { name: ru['param.sections'] });
    const one = within(ruSections)
      .getAllByRole('radio')
      .find((r) => r.querySelector('.segment-label')?.textContent === '1') as HTMLElement;
    fireEvent.click(one);
    typeInto(ru['param.width'], '1360');
    expect(screen.getByRole('status').textContent).toContain(
      `${ru['param.sections']}: «1» → «${ru['option.sections.auto']}». Причина: ${ru['reason.SHELF_SPAN']}.`,
    );
  });

  it('door preset reset is announced too; staff mode never auto-resets', () => {
    render(<App />);
    typeInto(uz['param.width'], '1206');
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: uz['param.sections'] })).getByRole('radio', {
        name: '2',
      }),
    ); // explicit 2 sections (auto would just pick 3)
    fireEvent.click(tab(uz['step.doors']));
    const preset = screen.getByRole('radiogroup', { name: uz['param.doors'] });
    fireEvent.click(
      within(preset).getByRole('radio', { name: new RegExp(uz['option.doors.all_single']) }),
    );
    fireEvent.click(tab(uz['step.size']));
    typeInto(uz['param.width'], '1207');
    expect(screen.getByRole('status').textContent).toContain(uz['reason.DOOR_TOO_WIDE']);
    cleanup();

    setUrl('?mode=staff');
    render(<App />);
    typeInto(uz['param.width'], '900');
    fireEvent.click(within(sections()).getByRole('radio', { name: '1' }));
    typeInto(uz['param.width'], '1360');
    expect(screen.queryByTestId('reset-toast')).toBeNull();
    expect(screen.getByText('SHELF_SPAN')).toBeTruthy();
  });
});
