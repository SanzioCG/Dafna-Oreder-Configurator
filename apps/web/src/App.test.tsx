import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ru } from './i18n/ru';
import { uz } from './i18n/uz';
import type { SceneProps } from './viewer/Scene';

// WebGL is not available in jsdom: replace only the 3D scene with a stub that exposes what it
// receives. The viewer shell (buttons, dimension labels, banners) is the real one.
vi.mock('./viewer/Scene', () => ({
  MM: 0.001,
  Scene: ({
    view,
    doorsOpen,
    interactive,
    sectionBoxes,
    selectedSection,
    onSectionTap,
    cameraCommand,
    reveal,
    cameraLocked,
  }: SceneProps) => (
    <div
      data-testid="viewer-stub"
      data-reveal={reveal ? reveal.kind : ''}
      data-camera-locked={String(Boolean(cameraLocked))}
      data-camera={
        cameraCommand
          ? `${cameraCommand.kind}${cameraCommand.kind === 'selection' ? ':' + cameraCommand.id : ''}#${cameraCommand.seq}`
          : ''
      }
      data-doors-open={String(doorsOpen)}
      data-interactive={String(interactive)}
      data-selected-section={String(selectedSection)}
      data-presets={view.result.sections.map((s) => s.preset).join(',')}
      data-rails={view.result.rails.length}
      data-panels={view.result.panels.filter((p) => !INTERIOR_ROLES.has(p.role)).length}
      data-interior-panels={view.result.panels.filter((p) => INTERIOR_ROLES.has(p.role)).length}
      data-sections={view.result.sections.map((s) => s.innerWidthMm).join(',')}
      data-back={view.result.panels.find((p) => p.id === 'back')?.lengthMm}
      data-corpus={view.result.panels.find((p) => p.id === 'side-left')?.material}
      data-doors={[
        ...new Set(view.result.panels.filter((p) => p.role === 'door').map((p) => p.material)),
      ].join(',')}
    >
      {interactive &&
        sectionBoxes.map((b) => (
          <button
            key={b.index}
            type="button"
            data-testid={`section-hit-${b.index}`}
            onClick={() => onSectionTap(b.index)}
          />
        ))}
    </div>
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
  it('renders in Uzbek with all five steps active (review = presentation)', () => {
    render(<App />);
    expect(screen.getByText(uz['app.title'])).toBeTruthy();
    expect(screen.getByRole('button', { name: /O'lcham/ }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: /Rang/ }).hasAttribute('disabled')).toBe(false);
    expect(tab(uz['step.doors']).hasAttribute('disabled')).toBe(false);
    expect(tab(uz['step.interior']).hasAttribute('disabled')).toBe(false);
    expect(tab(uz['step.review']).hasAttribute('disabled')).toBe(false);
    const stub = screen.getByTestId('viewer-stub');
    // D-1c: 1360 mm -> 2 sections with double doors (shared partition allowed)
    expect(stub.dataset.panels).toBe('12'); // 8 carcass + 4 door leaves
    expect(stub.dataset.sections).toBe('656,656');
  });

  it('changing width regenerates the engine result', () => {
    render(<App />);
    typeInto(uz['param.width'], '2000');
    const stub = screen.getByTestId('viewer-stub');
    expect(stub.dataset.sections).toBe('646,645,645');
    expect(stub.dataset.back).toBe('2000');
    expect(screen.getByTestId('summary').textContent).toContain('2000 × 1900 × 600');
  });

  it('2400 mm with doors is valid (no hold, no toast)', () => {
    render(<App />);
    typeInto(uz['param.width'], '2400');
    const stub = screen.getByTestId('viewer-stub');
    expect(stub.dataset.back).toBe('2400');
    expect(stub.dataset.sections).toBe('779,779,778');
    expect(screen.queryByTestId('reset-toast')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hard-clamps out-of-range input and hides staff-only parameters', () => {
    render(<App />);
    typeInto(uz['param.width'], '9999'); // clamped to 2400
    expect(screen.getByTestId('viewer-stub').dataset.back).toBe('2400');
    expect(screen.queryByRole('textbox', { name: uz['param.plinthRecess'] })).toBeNull();
    expect(screen.queryByText(uz['staff.download'])).toBeNull();
    expect(screen.queryByText(uz['staff.badge'])).toBeNull();
  });

  it('stepper buttons change the value by the template step', () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole('button', { name: `${uz['param.height']}: ${uz['control.increase']}` }),
    );
    expect(screen.getByTestId('summary').textContent).toContain('1360 × 1910 × 600');
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

  it('"same as corpus" hides the door swatches; off shows them, on syncs the door again', () => {
    render(<App />);
    openColorStep();
    const doorGroup = () => screen.queryByRole('radiogroup', { name: uz['param.doorMaterial'] });
    const toggle = () => screen.getByRole('switch', { name: uz['color.sameAsCorpus'] });
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(doorGroup()).toBeNull(); // door follows the corpus: no independent choice shown
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    // swatches appear with the corpus decor selected (nothing changed visually yet)
    expect(swatch(doorSwatches(), 'ldsp_white_16').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(swatch(doorSwatches(), 'ldsp_oak_light_16'));
    const stub = screen.getByTestId('viewer-stub');
    expect(stub.dataset.corpus).toBe('ldsp_white_16');
    expect(stub.dataset.doors).toBe('ldsp_oak_light_16');
    fireEvent.click(toggle());
    expect(stub.dataset.doors).toBe('ldsp_white_16');
    expect(doorGroup()).toBeNull();
    // the corpus choice keeps driving the doors while "same" is on
    fireEvent.click(swatch(corpus(), 'ldsp_beige_16'));
    expect(stub.dataset.doors).toBe('ldsp_beige_16');
  });

  it('staff mode also offers the 18 mm board, and it changes the geometry', () => {
    setUrl('?mode=staff');
    render(<App />);
    openColorStep();
    fireEvent.click(swatch(corpus(), 'ldsp_white_18'));
    expect(screen.getByTestId('viewer-stub').dataset.sections).toBe('653,653');
  });
});

describe('App doors', () => {
  const sectionLabels = () => document.querySelectorAll('[data-dim^="section-"]').length;

  it('door toggle opens/closes doors; section widths only on the doors step while open', () => {
    render(<App />);
    const stub = screen.getByTestId('viewer-stub');
    const button = screen.getByRole('button', { name: uz['viewer.doorsOpen'] });
    expect(stub.dataset.doorsOpen).toBe('false');
    expect(sectionLabels()).toBe(0);
    // millimetres in both modes, from the engine's overall dimensions
    expect(document.querySelector('[data-dim="width"]')?.textContent).toBe('1360 mm');
    expect(document.querySelector('[data-dim="height"]')?.textContent).toBe('1900 mm');
    expect(document.querySelector('[data-dim="depth"]')?.textContent).toBe('600 mm');
    // size step: section widths stay hidden even with open doors
    fireEvent.click(button);
    expect(sectionLabels()).toBe(0);
    fireEvent.click(button);

    fireEvent.click(tab(uz['step.doors']));
    expect(sectionLabels()).toBe(0);
    fireEvent.click(button);
    expect(stub.dataset.doorsOpen).toBe('true');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toBe(uz['viewer.doorsClose']);
    expect(sectionLabels()).toBe(2);
    expect(document.querySelector('[data-dim="section-0"]')?.textContent).toBe('656 mm');

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

describe('dimension overlay units', () => {
  it('staff sees millimetres', () => {
    setUrl('?mode=staff');
    render(<App />);
    expect(document.querySelector('[data-dim="width"]')?.textContent).toBe('1360 mm');
    expect(document.querySelector('[data-dim="depth"]')?.textContent).toBe('600 mm');
  });

  it('interior step shows section widths (doors auto-open); one SVG overlay', () => {
    render(<App />);
    fireEvent.click(tab(uz['step.interior']));
    expect(document.querySelectorAll('[data-dim^="section-"]').length).toBe(2);
    expect(document.querySelectorAll('[data-testid="dim-overlay"]').length).toBe(1);
  });
});

describe('App (staff mode)', () => {
  it('shows the depth breakdown and per-section door overrides', () => {
    setUrl('?mode=staff');
    render(<App />);
    expect(screen.getByTestId('hint-depth').textContent).toBe(
      'Orqa 3 + korpus 579 + tirqish 2 + eshik 16 = 600 mm',
    );
    fireEvent.click(tab(uz['step.doors']));
    expect(screen.getByRole('radiogroup', { name: "1-bo'lim eshigi" })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: "2-bo'lim eshigi" })).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: "3-bo'lim eshigi" })).toBeNull();
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
    // explicit 2 sections (auto would switch to 3 sections for all-single doors)
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: uz['param.sections'] })).getByRole('radio', {
        name: '2',
      }),
    );
    fireEvent.click(tab(uz['step.doors']));
    const preset = screen.getByRole('radiogroup', { name: uz['param.doors'] });
    // all single doors on 656 mm sections: 677 mm leaves -> DOOR_TOO_WIDE x2 (staff may pick it)
    fireEvent.click(within(preset).getByRole('radio', { name: uz['option.doors.all_single'] }));
    expect(screen.getByRole('alert').textContent).toContain(uz['viewer.invalid']);
    expect(screen.getAllByText('DOOR_TOO_WIDE').length).toBe(2);
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
  it.each(['', '?mode=staff'])('Dark default: dafna-logo-white.svg (url "%s")', (search) => {
    setUrl(search);
    render(<App />);
    const logo = within(screen.getByRole('banner')).getByRole('img', { name: 'Dafna' });
    expect(logo.getAttribute('src')).toBe('/brand/dafna-logo-white.svg');
  });

  it('White theme (kiosk config): dafna-logo.svg', () => {
    setUrl('?theme=white');
    render(<App />);
    const logo = within(screen.getByRole('banner')).getByRole('img', { name: 'Dafna' });
    expect(logo.getAttribute('src')).toBe('/brand/dafna-logo.svg');
    delete document.documentElement.dataset.theme;
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
  it('"same as corpus" on: door swatches are hidden, the toggle carries the state', () => {
    render(<App />);
    fireEvent.click(tab(uz['step.color']));
    expect(screen.queryByRole('radiogroup', { name: uz['param.doorMaterial'] })).toBeNull();
    expect(
      screen.getByRole('switch', { name: uz['color.sameAsCorpus'] }).getAttribute('aria-checked'),
    ).toBe('true');
    const corpus = screen.getByRole('radiogroup', { name: uz['param.corpusMaterial'] });
    expect(within(corpus).getAllByRole('radio', { checked: true }).length).toBe(1);
  });

  it('flat groups: numeric controls share one group, no pastel / tone card classes', () => {
    render(<App />);
    expect(document.querySelector('.card[data-card="width"]')).toBeTruthy();
    expect(document.querySelector('.card[data-card="sections"]')).toBeTruthy();
    expect(document.querySelectorAll('.card[data-card="height"]').length).toBe(0); // grouped
    expect(document.querySelectorAll('.card-pastel, .card-neutral').length).toBe(0);
  });
});

describe('Customer blocks SHELF_SPAN options (any step)', () => {
  const sections = () => screen.getByRole('radiogroup', { name: uz['param.sections'] });
  const opt = (n: string) =>
    within(sections())
      .getAllByRole('radio')
      .find((r) => r.querySelector('.segment-label')?.textContent === n) as HTMLElement;

  it('customer at 1360: "1" disabled (SHELF_SPAN), 2-4 enabled (shared partitions are fine)', () => {
    render(<App />);
    expect(opt('1').hasAttribute('disabled')).toBe(true);
    expect(opt('1').textContent).toContain(uz['reason.SHELF_SPAN']);
    for (const n of ['2', '3', '4']) expect(opt(n).hasAttribute('disabled')).toBe(false);
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
    expect(screen.getByTestId('viewer-stub').dataset.sections).toBe('656,656');
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

describe('Interior step (D-1b)', () => {
  const stub = () => screen.getByTestId('viewer-stub');
  const sectionTabs = () => screen.getByRole('radiogroup', { name: uz['interior.sections'] });
  const presets = (n: number) =>
    screen.getByRole('radiogroup', { name: uz['param.interior'].replace('{n}', String(n)) });
  const card = (n: number, preset: string) => {
    const el = presets(n).querySelector(`[data-preset="${preset}"]`);
    if (!el) throw new Error(`card ${preset} missing`);
    return el as HTMLElement;
  };
  const openInterior = () => fireEvent.click(tab(uz['step.interior']));

  it('section tabs + preset cards; picking a preset updates the engine result', () => {
    render(<App />);
    openInterior();
    expect(within(sectionTabs()).getAllByRole('radio').length).toBe(2);
    expect(card(1, 'auto').getAttribute('aria-checked')).toBe('true');
    // default depth 600 + double doors: auto resolves to rail + shelf
    expect(card(1, 'auto').textContent).toContain(uz['option.interior.rail_shelf']);
    expect(stub().dataset.presets).toBe('rail_shelf,rail_shelf');
    fireEvent.click(card(1, 'drawers_shelves'));
    expect(card(1, 'drawers_shelves').getAttribute('aria-checked')).toBe('true');
    expect(card(1, 'drawers_shelves').className).toContain('active');
    expect(stub().dataset.presets).toBe('drawers_shelves,rail_shelf');
  });

  it('"apply to all" copies the selected section preset to every section', () => {
    render(<App />);
    openInterior();
    fireEvent.click(card(1, 'empty'));
    fireEvent.click(screen.getByRole('button', { name: uz['interior.applyAll'] }));
    expect(stub().dataset.presets).toBe('empty,empty');
    expect(
      screen.getByRole('button', { name: uz['interior.applyAll'] }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('tapping a section in 3D selects it (mock Scene)', () => {
    render(<App />);
    openInterior();
    expect(stub().dataset.interactive).toBe('true');
    expect(stub().dataset.selectedSection).toBe('0');
    fireEvent.click(screen.getByTestId('section-hit-1'));
    expect(stub().dataset.selectedSection).toBe('1');
    const second = within(sectionTabs()).getAllByRole('radio')[1] as HTMLElement;
    expect(second.getAttribute('aria-checked')).toBe('true');
    expect(presets(2)).toBeTruthy();
  });

  it('customer: rail presets are enabled at the default size (depth 600)', () => {
    render(<App />);
    openInterior();
    for (const p of ['rail', 'rail_shelf', 'rail_drawers']) {
      expect(card(1, p).hasAttribute('disabled'), p).toBe(false);
    }
  });

  it('customer: rail presets are disabled with a reason when the carcass is too shallow', () => {
    render(<App />);
    typeInto(uz['param.depth'], '516'); // carcass 495 < 530
    openInterior();
    for (const p of ['rail', 'rail_shelf', 'rail_drawers']) {
      expect(card(1, p).hasAttribute('disabled'), p).toBe(true);
      expect(card(1, p).textContent).toContain(uz['reason.RAIL_DEPTH_SHORT']);
    }
    expect(card(1, 'drawers_shelves').hasAttribute('disabled')).toBe(false);
    cleanup();
    // staff: selectable, and the warning is shown
    setUrl('?mode=staff');
    render(<App />);
    typeInto(uz['param.depth'], '516');
    openInterior();
    expect(card(1, 'rail').hasAttribute('disabled')).toBe(false);
    fireEvent.click(card(1, 'rail'));
    expect(screen.getByText('RAIL_DEPTH_SHORT')).toBeTruthy();
    expect(screen.getByTestId('interior-details').textContent).toContain('rail (chosen)');
  });

  it('customer: a preset made invalid by a size change is reset to auto, with a toast', () => {
    render(<App />);
    typeInto(uz['param.depth'], '600'); // carcass 579: rail allowed
    openInterior();
    fireEvent.click(card(1, 'rail_shelf'));
    // section 2 is auto: double doors + deep enough -> rail_shelf as well
    expect(stub().dataset.presets).toBe('rail_shelf,rail_shelf');
    expect(Number(stub().dataset.rails)).toBe(2);
    fireEvent.click(tab(uz['step.size']));
    typeInto(uz['param.depth'], '516'); // carcass 495 < 530 -> RAIL_DEPTH_SHORT
    expect(stub().dataset.presets).toBe('shelves,shelves');
    expect(screen.getByRole('status').textContent).toContain(
      `«${uz['option.interior.rail_shelf']}» → «${uz['option.interior.auto']}». Sabab: ${uz['reason.RAIL_DEPTH_SHORT']}.`,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('doors open automatically on the step and the previous state comes back after it', () => {
    render(<App />);
    expect(stub().dataset.doorsOpen).toBe('false');
    openInterior();
    expect(stub().dataset.doorsOpen).toBe('true');
    fireEvent.click(tab(uz['step.size']));
    expect(stub().dataset.doorsOpen).toBe('false');
    // if the customer had opened them before, they stay open afterwards
    fireEvent.click(screen.getByRole('button', { name: uz['viewer.doorsOpen'] }));
    openInterior();
    fireEvent.click(tab(uz['step.color']));
    expect(stub().dataset.doorsOpen).toBe('true');
    expect(stub().dataset.interactive).toBe('false');
  });
});

describe('theme: kiosk default, staff-only switch', () => {
  afterEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('customer: Dark by default and no theme toggle', () => {
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.queryByRole('button', { name: uz['theme.dark'] })).toBeNull();
  });

  it('staff switch: White <-> Dark, logo swaps, the configuration is kept', () => {
    setUrl('?mode=staff');
    render(<App />);
    const logo = () => screen.getByAltText(uz['app.brand']).getAttribute('src') ?? '';
    typeInto(uz['param.width'], '2000');
    fireEvent.click(tab(uz['step.color']));
    expect(logo()).toMatch(/dafna-logo-white\.svg$/);
    const toggle = screen.getByRole('button', { name: uz['theme.dark'] });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(logo()).toMatch(/dafna-logo\.svg$/);
    // nothing reset: same step, same width
    expect(tab(uz['step.color']).getAttribute('aria-current')).toBe('step');
    expect(screen.getByTestId('summary').textContent).toContain('2000');
  });
});

describe('smart camera triggers (explicit selections only)', () => {
  const stub = () => screen.getByTestId('viewer-stub');
  const camera = () => (stub().dataset.camera ?? '').split('#')[0];

  it('no camera command on load; entering the interior step does not move the camera', () => {
    render(<App />);
    expect(stub().dataset.camera).toBe('');
    fireEvent.click(tab(uz['step.interior']));
    expect(stub().dataset.camera).toBe('');
  });

  it('section tab and 3D tap frame that section; the same section again re-frames it', () => {
    render(<App />);
    fireEvent.click(tab(uz['step.interior']));
    const tabs = screen.getByRole('radiogroup', { name: uz['interior.sections'] });
    fireEvent.click(within(tabs).getAllByRole('radio')[1] as HTMLElement);
    expect(camera()).toBe('selection:section-1');
    const seq = stub().dataset.camera;
    fireEvent.click(screen.getByTestId('section-hit-0'));
    expect(camera()).toBe('selection:section-0');
    fireEvent.click(screen.getByTestId('section-hit-0'));
    expect(stub().dataset.camera).not.toBe(seq);
  });

  it('doors step: tapping a section frames its door(s); size/colour steps use the full model', () => {
    render(<App />);
    fireEvent.click(tab(uz['step.doors']));
    expect(stub().dataset.interactive).toBe('true');
    fireEvent.click(screen.getByTestId('section-hit-1'));
    expect(camera()).toBe('selection:door-1');
    fireEvent.click(tab(uz['step.color']));
    expect(camera()).toBe('model');
    fireEvent.click(tab(uz['step.size']));
    expect(camera()).toBe('model');
  });

  it('changing a parameter never issues a camera command', () => {
    render(<App />);
    typeInto(uz['param.width'], '2000');
    expect(stub().dataset.camera).toBe('');
  });
});

describe('presentation mode and reveal', () => {
  const stub = () => screen.getByTestId('viewer-stub');
  const skip = () => screen.queryByRole('button', { name: uz['present.skip'] });
  const toReview = () => fireEvent.click(tab(uz['step.review']));

  it('hides the sheet and step navigation; plays the full reveal with a skip button', () => {
    render(<App />);
    toReview();
    expect(screen.queryByRole('navigation')).toBeNull(); // sheet hidden
    expect(document.querySelector('.app')?.classList.contains('presenting')).toBe(true);
    expect(stub().dataset.reveal).toBe('full');
    expect(stub().dataset.cameraLocked).toBe('true');
    expect(skip()).not.toBeNull();
    // the confirm area only after the doors have closed
    expect(screen.queryByRole('button', { name: uz['present.edit'] })).toBeNull();
    // logo top-left in presentation
    expect(document.querySelector('.present-logo')).not.toBeNull();
  });

  it('skip ends in the stable state: title, manual orbit, edit button', () => {
    render(<App />);
    toReview();
    fireEvent.click(skip() as HTMLElement);
    expect(skip()).toBeNull();
    expect(screen.getByTestId('present-title').textContent).toContain(uz['present.title']);
    expect(screen.getByTestId('present-title').textContent).toContain(uz['present.subtitle']);
    expect(stub().dataset.cameraLocked).toBe('false');
    expect(screen.getByRole('button', { name: uz['present.edit'] })).toBeTruthy();
  });

  it('edit returns to the configurator; same configuration again: no animation', () => {
    render(<App />);
    toReview();
    fireEvent.click(skip() as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: uz['present.edit'] }));
    expect(screen.getByRole('navigation')).toBeTruthy();
    expect(stub().dataset.reveal).toBe('');
    toReview();
    expect(stub().dataset.reveal).toBe('none');
    expect(skip()).toBeNull();
    expect(screen.getByTestId('present-title')).toBeTruthy();
  });

  it('after an edit the short version plays', () => {
    render(<App />);
    toReview();
    fireEvent.click(skip() as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: uz['present.edit'] }));
    fireEvent.click(tab(uz['step.size']));
    typeInto(uz['param.width'], '2000');
    toReview();
    expect(stub().dataset.reveal).toBe('short');
    expect(skip()).not.toBeNull();
  });

  it('prefers-reduced-motion: final state directly (no skip, title shown)', () => {
    const mm = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('matchMedia', mm);
    try {
      render(<App />);
      toReview();
      expect(stub().dataset.reveal).toBe('instant');
      expect(skip()).toBeNull();
      expect(screen.getByTestId('present-title')).toBeTruthy();
      expect(mm).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('summary card, confirm entry point and flow', () => {
  const flow = () => document.querySelector('.app')?.getAttribute('data-flow');
  const toStable = () => {
    fireEvent.click(tab(uz['step.review']));
    // unchanged configuration: no reveal, already stable
    const skip = screen.queryByRole('button', { name: uz['present.skip'] });
    if (skip) fireEvent.click(skip);
  };
  const row = (key: string) =>
    screen.getByTestId('summary-card').querySelector(`[data-row="${key}"]`) as HTMLElement;

  it('flow: configurator -> presentation -> ready_to_confirm (doors closed) -> contact', () => {
    render(<App />);
    expect(flow()).toBe('configurator');
    fireEvent.click(tab(uz['step.review']));
    expect(flow()).toBe('presentation');
    expect(screen.queryByTestId('summary-card')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: uz['present.skip'] }));
    expect(flow()).toBe('ready_to_confirm');
    fireEvent.click(screen.getByRole('button', { name: uz['present.confirm'] }));
    expect(flow()).toBe('contact');
  });

  it('summary values: size in mm, colours, sections + presets, doors', () => {
    render(<App />);
    toStable();
    expect(row('size').querySelector('dd')?.textContent).toBe('1360 × 1900 × 600 mm');
    expect(row('corpus').querySelector('dd')?.textContent).toBe(uz['decor.white']);
    expect(row('doorColor').querySelector('dd')?.textContent).toBe(uz['decor.white']);
    expect(row('sections').querySelector('dd')?.textContent).toBe(
      `2 ta: ${uz['option.interior.rail_shelf']}, ${uz['option.interior.rail_shelf']}`,
    );
    expect(row('doors').querySelector('dd')?.textContent).toBe(
      `${uz['option.doorSection.double']} × 2`,
    );
  });

  it('staff summary in millimetres', () => {
    setUrl('?mode=staff');
    render(<App />);
    toStable();
    expect(row('size').querySelector('dd')?.textContent).toBe('1360 × 1900 × 600 mm');
  });

  it('"o\'zgartirish" returns to that step with the selection intact', () => {
    render(<App />);
    // pick section 2 on the interior step first
    fireEvent.click(tab(uz['step.interior']));
    const tabs = () => screen.getByRole('radiogroup', { name: uz['interior.sections'] });
    fireEvent.click(within(tabs()).getAllByRole('radio')[1] as HTMLElement);
    toStable();
    fireEvent.click(within(row('sections')).getByRole('button'));
    expect(flow()).toBe('configurator');
    expect(tab(uz['step.interior']).getAttribute('aria-current')).toBe('step');
    expect(within(tabs()).getAllByRole('radio')[1]?.getAttribute('aria-checked')).toBe('true');

    const steps: [string, string][] = [
      ['size', 'step.size'],
      ['corpus', 'step.color'],
      ['doors', 'step.doors'],
    ];
    for (const [key, stepKey] of steps) {
      toStable();
      fireEvent.click(within(row(key)).getByRole('button'));
      expect(tab(uz[stepKey as 'step.size']).getAttribute('aria-current')).toBe('step');
    }
  });

  it('edit keeps every parameter (nothing lost)', () => {
    render(<App />);
    typeInto(uz['param.width'], '2000');
    toStable();
    fireEvent.click(screen.getByRole('button', { name: uz['present.edit'] }));
    expect(screen.getByTestId('summary').textContent).toContain('2000 × 1900 × 600');
    expect(tab(uz['step.doors']).getAttribute('aria-current')).toBe('step');
  });

  it('contact placeholder: customer sees "Tez orada", Orqaga returns; no fake order data', () => {
    render(<App />);
    toStable();
    fireEvent.click(screen.getByRole('button', { name: uz['present.confirm'] }));
    const dialog = screen.getByRole('dialog', { name: uz['contact.title'] });
    expect(dialog.textContent).toContain(uz['step.comingSoon']);
    expect(screen.queryByTestId('contact-todo')).toBeNull();
    expect(dialog.textContent).not.toMatch(/\d{3,}/); // no invented order number
    fireEvent.click(within(dialog).getByRole('button', { name: uz['nav.back'] }));
    expect(flow()).toBe('ready_to_confirm');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('contact placeholder: staff sees the TODO marker', () => {
    setUrl('?mode=staff');
    render(<App />);
    toStable();
    fireEvent.click(screen.getByRole('button', { name: uz['present.confirm'] }));
    expect(screen.getByTestId('contact-todo').textContent).toContain('TODO (D-3b)');
  });
});

describe('V2 steps: DimensionControl, customer visibility, global actions', () => {
  const input = (label: string) => screen.getByRole('textbox', { name: label }) as HTMLInputElement;
  const slider = (label: string) => screen.getByRole('slider', { name: label });

  it('slider, input and ± share one state', () => {
    render(<App />);
    fireEvent.keyDown(slider(uz['param.width']), { key: 'ArrowRight' });
    const afterSlider = input(uz['param.width']).value;
    expect(Number(afterSlider)).toBeGreaterThan(1360);
    expect(slider(uz['param.width']).getAttribute('aria-valuenow')).toBe(afterSlider);
    typeInto(uz['param.width'], '1500');
    expect(slider(uz['param.width']).getAttribute('aria-valuenow')).toBe('1500');
    fireEvent.click(
      screen.getByRole('button', { name: `${uz['param.width']}: ${uz['control.decrease']}` }),
    );
    expect(Number(input(uz['param.width']).value)).toBeLessThan(1500);
    expect(slider(uz['param.width']).getAttribute('aria-valuenow')).toBe(
      input(uz['param.width']).value,
    );
  });

  it('± clamp to min/max (button disabled at the limit); min/max labels in mm', () => {
    render(<App />);
    typeInto(uz['param.width'], '2400');
    const plus = screen.getByRole('button', {
      name: `${uz['param.width']}: ${uz['control.increase']}`,
    });
    expect(plus.hasAttribute('disabled')).toBe(true);
    expect(input(uz['param.width']).value).toBe('2400');
    expect(screen.getByTestId('scale-width').textContent).toBe('600 mm2400 mm');
  });

  it('invalid typed values are corrected on blur (customer), with the reason shown', () => {
    render(<App />);
    typeInto(uz['param.width'], '100');
    expect(input(uz['param.width']).value).toBe('600');
    expect(screen.getByTestId('range-width').textContent).toBe(
      "Kenglik 600–2400 mm oralig'ida bo'lishi kerak. 100 qabul qilinmadi, 600 mm qo'yildi.",
    );
    typeInto(uz['param.height'], '99999');
    expect(input(uz['param.height']).value).toBe('2600');
    expect(screen.getByTestId('range-height').textContent).toContain('2600 mm');
    // a valid change (± / slider) clears the explanation
    fireEvent.click(
      screen.getByRole('button', { name: `${uz['param.width']}: ${uz['control.increase']}` }),
    );
    expect(screen.queryByTestId('range-width')).toBeNull();
  });

  it('valid typed values show no range message; staff gets no correction (engine error)', () => {
    render(<App />);
    typeInto(uz['param.width'], '1500');
    expect(screen.queryByTestId('range-width')).toBeNull();
    cleanup();
    setUrl('?mode=staff');
    render(<App />);
    typeInto(uz['param.width'], '100');
    expect(input(uz['param.width']).value).toBe('100');
    expect(screen.queryByTestId('range-width')).toBeNull();
  });

  it('the range message disappears after 5 s', () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      typeInto(uz['param.width'], '9999');
      expect(screen.getByTestId('range-width')).toBeTruthy();
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.queryByTestId('range-width')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('customer: no 18 mm material, no thickness, no back panel; staff sees them', () => {
    render(<App />);
    expect(screen.queryByRole('radiogroup', { name: uz['param.backPanel'] })).toBeNull();
    fireEvent.click(tab(uz['step.color']));
    const corpus = screen.getByRole('radiogroup', { name: uz['param.corpusMaterial'] });
    expect(corpus.querySelector('[data-material="ldsp_white_18"]')).toBeNull();
    expect(corpus.textContent).not.toMatch(/\d+ mm/);
    cleanup();
    setUrl('?mode=staff');
    render(<App />);
    expect(screen.getByRole('radiogroup', { name: uz['param.backPanel'] })).toBeTruthy();
    fireEvent.click(tab(uz['step.color']));
    const staffCorpus = screen.getByRole('radiogroup', { name: uz['param.corpusMaterial'] });
    expect(staffCorpus.querySelector('[data-material="ldsp_white_18"]')).not.toBeNull();
  });

  it('disabled options show a human reason, never an error code', () => {
    render(<App />);
    const disabled = Array.from(document.querySelectorAll('button:disabled')).filter((b) =>
      b.querySelector('.segment-reason'),
    );
    expect(disabled.length).toBeGreaterThan(0);
    for (const b of disabled) {
      expect(b.textContent).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
      expect(b.querySelector('.segment-reason')?.textContent?.length).toBeGreaterThan(3);
    }
  });

  it('"Tayyor — ko\'rib chiqish" and "Konsultant chaqirish" on customer steps 1–4', () => {
    render(<App />);
    for (const key of ['step.size', 'step.color', 'step.interior', 'step.doors'] as const) {
      fireEvent.click(tab(uz[key]));
      expect(screen.getByRole('button', { name: uz['nav.readyReview'] })).toBeTruthy();
      expect(screen.getByRole('button', { name: uz['consultant.call'] })).toBeTruthy();
    }
  });

  it('"Tayyor" jumps straight to the presentation with the current values', () => {
    render(<App />);
    typeInto(uz['param.width'], '2000');
    fireEvent.click(screen.getByRole('button', { name: uz['nav.readyReview'] }));
    expect(document.querySelector('.app')?.getAttribute('data-flow')).toBe('presentation');
    // consultant stays reachable in the presentation
    expect(screen.getByRole('button', { name: uz['consultant.call'] })).toBeTruthy();
  });

  it('"Konsultant chaqirish" fires the hook event and never changes the configuration', () => {
    const events: Event[] = [];
    const on = (e: Event) => events.push(e);
    window.addEventListener('dafna:consultant-request', on);
    try {
      render(<App />);
      typeInto(uz['param.width'], '2000');
      fireEvent.click(screen.getByRole('button', { name: uz['consultant.call'] }));
      expect(events).toHaveLength(1);
      const detail = (events[0] as CustomEvent).detail as { where: string; revision: string };
      expect(detail.where).toBe('size');
      expect(JSON.parse(detail.revision).width).toBe(2000);
      expect(input(uz['param.width']).value).toBe('2000');
      expect(screen.queryByRole('status')).toBeNull(); // no fake "sent" confirmation
    } finally {
      window.removeEventListener('dafna:consultant-request', on);
    }
  });

  it('consultant: honest modal (nearby employee or call 1408), closes, configuration kept', () => {
    render(<App />);
    typeInto(uz['param.width'], '2000');
    fireEvent.click(screen.getByRole('button', { name: uz['consultant.call'] }));
    const dialog = screen.getByRole('dialog', { name: uz['consultant.call'] });
    expect(dialog.textContent).toContain(
      "Yaqin atrofdagi Dafna xodimiga murojaat qiling yoki qo'ng'iroq qiling: 1408",
    );
    fireEvent.click(within(dialog).getByRole('button', { name: uz['consultant.close'] }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Escape also closes it
    fireEvent.click(screen.getByRole('button', { name: uz['consultant.call'] }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(input(uz['param.width']).value).toBe('2000');
  });

  it('consultant modal in Russian and in the presentation', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: ru['lang.ru'] }));
    fireEvent.click(tab(ru['step.review']));
    fireEvent.click(screen.getByRole('button', { name: ru['consultant.call'] }));
    expect(screen.getByRole('dialog').textContent).toContain(
      'Обратитесь к ближайшему сотруднику Dafna или позвоните: 1408',
    );
    expect(document.querySelector('.app')?.getAttribute('data-flow')).toBe('presentation');
  });

  it('staff: no consultant button', () => {
    setUrl('?mode=staff');
    render(<App />);
    expect(screen.queryByRole('button', { name: uz['consultant.call'] })).toBeNull();
  });
});

describe('smart camera: preset change keeps the focus', () => {
  it('changing the selected section preset issues no new camera command', () => {
    render(<App />);
    fireEvent.click(tab(uz['step.interior']));
    const tabs = screen.getByRole('radiogroup', { name: uz['interior.sections'] });
    fireEvent.click(within(tabs).getAllByRole('radio')[1] as HTMLElement);
    const stub = screen.getByTestId('viewer-stub');
    const before = stub.dataset.camera;
    expect(before?.startsWith('selection:section-1')).toBe(true);
    const presets = document.querySelector('.preset-grid') as HTMLElement;
    fireEvent.click(presets.querySelector('[data-preset="shelves"]') as HTMLElement);
    expect(stub.dataset.presets?.split(',')[1]).toBe('shelves');
    expect(stub.dataset.camera).toBe(before);
  });
});
