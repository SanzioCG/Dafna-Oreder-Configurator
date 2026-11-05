import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
      data-panels={view.result.panels.length}
      data-sections={view.result.sections.map((s) => s.innerWidthMm).join(',')}
      data-back={view.result.panels.find((p) => p.id === 'back')?.lengthMm}
      data-corpus={view.result.panels.find((p) => p.id === 'side-left')?.material}
      data-doors={[
        ...new Set(view.result.panels.filter((p) => p.role === 'door').map((p) => p.material)),
      ].join(',')}
    />
  ),
}));

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
    expect(stub.dataset.panels).toBe('12'); // 8 carcass + 4 door leaves
    expect(stub.dataset.sections).toBe('656,656');
  });

  it('changing width regenerates the engine result', () => {
    render(<App />);
    typeInto(uz['param.width'], '2400');
    const stub = screen.getByTestId('viewer-stub');
    expect(stub.dataset.sections).toBe('779,779,778');
    expect(stub.dataset.back).toBe('2400');
    expect(screen.getByTestId('summary').textContent).toContain('2400 × 1900 × 516');
  });

  it('hard-clamps out-of-range input and hides staff-only parameters', () => {
    render(<App />);
    typeInto(uz['param.width'], '9999');
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
    expect(screen.getByTestId('viewer-stub').dataset.sections).toBe('653,653');
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
    expect(sectionLabels()).toBe(2);

    fireEvent.click(button);
    expect(stub.dataset.doorsOpen).toBe('false');
    expect(sectionLabels()).toBe(0);
  });

  it('doors step: "no doors" removes the leaves and the toggle, sections become visible', () => {
    render(<App />);
    fireEvent.click(tab(uz['step.doors']));
    const preset = screen.getByRole('radiogroup', { name: uz['param.doors'] });
    fireEvent.click(within(preset).getByRole('radio', { name: uz['option.doors.none'] }));
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
    fireEvent.click(tab(uz['step.doors']));
    const preset = screen.getByRole('radiogroup', { name: uz['param.doors'] });
    fireEvent.click(within(preset).getByRole('radio', { name: uz['option.doors.all_single'] }));
    expect(screen.getByRole('alert').textContent).toContain(uz['viewer.invalid']);
    expect(screen.getAllByText('DOOR_TOO_WIDE').length).toBe(2);
    fireEvent.click(within(preset).getByRole('radio', { name: uz['option.doors.auto'] }));
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

  it('customer: "all single" is disabled with a reason on 656 mm sections', () => {
    render(<App />);
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
    typeInto(uz['param.width'], '1248'); // 2 sections of 600 mm -> single doors allowed
    fireEvent.click(tab(uz['step.doors']));
    fireEvent.click(option(uz['option.doors.all_single']));
    expect(option(uz['option.doors.all_single']).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(tab(uz['step.size']));
    typeInto(uz['param.width'], '1360'); // 656 mm sections -> all_single would be DOOR_TOO_WIDE
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

  it('customer: "1" section is disabled with a reason at width 1360; 2-4 stay enabled', () => {
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
