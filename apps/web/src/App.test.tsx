import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ru } from './i18n/ru';
import { uz } from './i18n/uz';
import { CUSTOMER_BANNED_WORDS } from './ui/plainText';
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
      data-sections={view.result.sections.map((s) => s.innerWidthMm).join(',')}
      data-width={view.widthMm}
      data-height={view.heightMm}
      data-depth={view.depthMm}
      data-plinth={view.result.panels.some((p) => p.role === 'plinth') ? 'yes' : 'no'}
      data-door-count={view.result.panels.filter((p) => p.role === 'door').length}
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

const { App } = await import('./App');

function setUrl(search: string) {
  window.history.replaceState(null, '', `/${search}`);
}

afterEach(() => {
  cleanup();
  setUrl('');
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

const stub = () => screen.getByTestId('viewer-stub');
const tab = (label: string) =>
  within(screen.getByRole('navigation')).getByRole('button', { name: new RegExp(label) });
const toggle = (name: string) => screen.getByRole('switch', { name });
const flow = () => document.querySelector('.app')?.getAttribute('data-flow');

/** Renders the app; customers land on the start screen (step 0) — continue from scratch. */
function renderApp() {
  const r = render(<App />);
  const scratch = screen.queryByRole('button', { name: uz['start.scratch'] });
  if (scratch) fireEvent.click(scratch);
  return r;
}

function typeInto(label: string, value: string) {
  const el = screen.getByRole('textbox', { name: label });
  fireEvent.focus(el);
  fireEvent.change(el, { target: { value } });
  fireEvent.blur(el);
}

const input = (label: string) => screen.getByRole('textbox', { name: label }) as HTMLInputElement;
const plus = (label: string) =>
  screen.getByRole('button', { name: `${label}: ${uz['control.increase']}` });
const minus = (label: string) =>
  screen.getByRole('button', { name: `${label}: ${uz['control.decrease']}` });
const chipsGroup = () => screen.getByRole('radiogroup', { name: uz['c.widthChips'] });

// ---------------------------------------------------------------------------------------------

describe('shell', () => {
  it("Uzbek, four step pills (Joy, Rang, Ichki, Ko'rib chiqish), all enabled", () => {
    renderApp();
    expect(screen.getByText(uz['app.title'])).toBeTruthy();
    const pills = within(screen.getByRole('navigation')).getAllByRole('button');
    expect(pills.map((p) => p.textContent?.replace(/^\d/, ''))).toEqual([
      uz['step.size'],
      uz['step.color'],
      uz['step.interior'],
      uz['step.review'],
    ]);
    for (const p of pills) expect(p.hasAttribute('disabled')).toBe(false);
  });

  it('switches to Russian', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: ru['lang.ru'] }));
    expect(screen.getByRole('heading', { name: ru['step.size.title'] })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: ru['param.width'] })).toBeTruthy();
  });
});

describe('start screen (step 0, customers)', () => {
  it('4 models with thumbnails, widths in sm, and "Noldan boshlash"', () => {
    render(<App />);
    expect(screen.getByTestId('start-screen')).toBeTruthy();
    expect(screen.getAllByTestId('model-thumb').length).toBe(4);
    const widths = [...document.querySelectorAll('.model-width')].map((e) => e.textContent);
    expect(widths).toEqual(['100 sm', '150 sm', '200 sm', '240 sm']);
    for (const key of ['model.compact', 'model.classic', 'model.wide', 'model.large'] as const) {
      expect(
        screen.getByRole('button', { name: `${uz[key]}: ${uz['start.choose']}` }),
      ).toBeTruthy();
    }
  });

  it('picking a model loads its params and goes to step 1', () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole('button', { name: `${uz['model.wide']}: ${uz['start.choose']}` }),
    );
    expect(screen.queryByTestId('start-screen')).toBeNull();
    expect(tab(uz['step.size']).getAttribute('aria-current')).toBe('step');
    expect(stub().dataset.width).toBe('2000');
    expect(input(uz['param.width']).value).toBe('200');
  });

  it('staff start directly on step 1', () => {
    setUrl('?mode=staff');
    render(<App />);
    expect(screen.queryByTestId('start-screen')).toBeNull();
    expect(tab(uz['step.size']).getAttribute('aria-current')).toBe('step');
  });
});

describe('step 1 "Joy"', () => {
  it('width stepper in whole sm, 10 mm per step; slider and input share one state', () => {
    renderApp();
    expect(input(uz['param.width']).value).toBe('136');
    fireEvent.click(plus(uz['param.width']));
    expect(input(uz['param.width']).value).toBe('137');
    expect(stub().dataset.width).toBe('1370');
    fireEvent.click(minus(uz['param.width']));
    fireEvent.click(minus(uz['param.width']));
    expect(stub().dataset.width).toBe('1350');
    const slider = screen.getByRole('slider', { name: uz['param.width'] });
    expect(slider.getAttribute('aria-valuenow')).toBe('135');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(stub().dataset.width).toBe('1360');
    expect(screen.getByTestId('scale-width').textContent).toBe('60 sm240 sm');
  });

  it('quick chips 100 / 120 / 150 / 180 / 200 / 240 sm set the width', () => {
    renderApp();
    expect(
      within(chipsGroup())
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['100 sm', '120 sm', '150 sm', '180 sm', '200 sm', '240 sm']);
    fireEvent.click(within(chipsGroup()).getByRole('radio', { name: '200 sm' }));
    expect(stub().dataset.width).toBe('2000');
    expect(
      within(chipsGroup()).getByRole('radio', { name: '200 sm' }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('typed values outside the range are corrected on blur, with the reason in sm', () => {
    renderApp();
    typeInto(uz['param.width'], '999');
    expect(input(uz['param.width']).value).toBe('240');
    expect(stub().dataset.width).toBe('2400');
    expect(screen.getByTestId('range-width').textContent).toBe(
      "Kenglik 60–240 sm oralig'ida bo'lishi kerak. 999 qabul qilinmadi, 240 sm qo'yildi.",
    );
  });

  it('"Batafsil" reveals height and depth steppers (sm)', () => {
    renderApp();
    expect(screen.queryByRole('textbox', { name: uz['param.height'] })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: uz['c.details'] }));
    expect(input(uz['param.height']).value).toBe('190');
    expect(input(uz['param.depth']).value).toBe('60');
    fireEvent.click(plus(uz['param.height']));
    expect(stub().dataset.height).toBe('1910');
  });

  it('"Pastki yopiq taglik" = base plinth, ON by default', () => {
    renderApp();
    expect(toggle(uz['c.base']).getAttribute('aria-checked')).toBe('true');
    expect(stub().dataset.plinth).toBe('yes');
    fireEvent.click(toggle(uz['c.base']));
    expect(stub().dataset.plinth).toBe('no');
  });

  it('section count is not shown to customers and stays auto', () => {
    renderApp();
    expect(screen.queryByRole('radiogroup', { name: uz['param.sections'] })).toBeNull();
    fireEvent.click(within(chipsGroup()).getByRole('radio', { name: '240 sm' }));
    expect(stub().dataset.sections?.split(',').length).toBe(3); // auto from width
  });
});

describe('step 2 "Rang"', () => {
  const corpus = () => screen.getByRole('radiogroup', { name: uz['param.corpusMaterial'] });
  const doorGroup = () => screen.queryByRole('radiogroup', { name: uz['param.doorMaterial'] });

  it('5 customer decors (no 18 mm, no thickness); the corpus decor applies immediately', () => {
    renderApp();
    fireEvent.click(tab(uz['step.color']));
    expect(corpus().querySelectorAll('.swatch').length).toBe(5);
    expect(corpus().querySelector('[data-material="ldsp_white_18"]')).toBeNull();
    expect(corpus().textContent).not.toMatch(/\d+ mm/);
    fireEvent.click(corpus().querySelector('[data-material="ldsp_anthracite_16"]') as HTMLElement);
    expect(stub().dataset.corpus).toBe('ldsp_anthracite_16');
    expect(stub().dataset.doors).toBe('ldsp_anthracite_16');
  });

  it('"Eshiklar boshqa rangda" OFF hides door swatches (doors follow the corpus); ON shows them', () => {
    renderApp();
    fireEvent.click(tab(uz['step.color']));
    expect(toggle(uz['c.doorsOther']).getAttribute('aria-checked')).toBe('false');
    expect(doorGroup()).toBeNull();
    fireEvent.click(toggle(uz['c.doorsOther']));
    const group = doorGroup() as HTMLElement;
    expect(
      group.querySelector('[data-material="ldsp_white_16"]')?.getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(group.querySelector('[data-material="ldsp_oak_light_16"]') as HTMLElement);
    expect(stub().dataset.doors).toBe('ldsp_oak_light_16');
    expect(stub().dataset.corpus).toBe('ldsp_white_16');
    fireEvent.click(toggle(uz['c.doorsOther']));
    expect(doorGroup()).toBeNull();
    expect(stub().dataset.doors).toBe('ldsp_white_16');
  });
});

describe('step 3 "Ichki"', () => {
  const options = () => document.querySelector('.option-list') as HTMLElement;
  const option = (preset: string) =>
    options().querySelector(`[data-preset="${preset}"]`) as HTMLButtonElement;

  it('"Eshikli shkaf" maps to doors auto / none; doors open automatically on this step', () => {
    renderApp();
    fireEvent.click(tab(uz['step.interior']));
    expect(stub().dataset.doorsOpen).toBe('true');
    expect(toggle(uz['c.withDoors']).getAttribute('aria-checked')).toBe('true');
    expect(Number(stub().dataset.doorCount)).toBeGreaterThan(0);
    fireEvent.click(toggle(uz['c.withDoors']));
    expect(stub().dataset.doorCount).toBe('0');
    fireEvent.click(toggle(uz['c.withDoors']));
    expect(Number(stub().dataset.doorCount)).toBeGreaterThan(0);
  });

  it('plain-language options map to the engine presets', () => {
    renderApp();
    fireEvent.click(tab(uz['step.interior']));
    const expected: [string, string][] = [
      ['auto', uz['c.opt.auto']],
      ['rail', uz['c.opt.rail']],
      ['shelves', uz['c.opt.shelves']],
      ['rail_shelf', uz['c.opt.rail_shelf']],
      ['drawers_shelves', uz['c.opt.drawers_shelves']],
      ['rail_drawers', uz['c.opt.rail_drawers']],
      ['empty', uz['c.opt.empty']],
    ];
    expect(
      [...options().querySelectorAll('[data-preset]')].map((b) => b.getAttribute('data-preset')),
    ).toEqual(expected.map((e) => e[0]));
    for (const [preset, title] of expected) {
      expect(option(preset).querySelector('.option-title')?.textContent).toContain(title);
    }
    expect(option('rail').textContent).toContain(uz['c.hint.rail']);
    expect(option('auto').textContent).toContain(uz['c.recommended']);
    fireEvent.click(option('rail'));
    expect(stub().dataset.presets?.split(',')[0]).toBe('rail');
    fireEvent.click(option('drawers_shelves'));
    expect(stub().dataset.presets?.split(',')[0]).toBe('drawers_shelves');
  });

  it('part pills and 3D taps select the part; "Barcha qismlarga qo\'llash"', () => {
    renderApp();
    fireEvent.click(tab(uz['step.interior']));
    const parts = screen.getByRole('radiogroup', { name: uz['c.part'] });
    expect(
      within(parts)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['1', '2']);
    fireEvent.click(screen.getByTestId('section-hit-1'));
    expect(within(parts).getAllByRole('radio')[1]?.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(option('shelves'));
    expect(stub().dataset.presets).toBe('rail_shelf,shelves');
    fireEvent.click(screen.getByRole('button', { name: uz['c.applyAll'] }));
    expect(stub().dataset.presets).toBe('shelves,shelves');
  });

  it('disabled options show a plain-language reason (no codes)', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: uz['c.details'] }));
    typeInto(uz['param.depth'], '52'); // 52 sm: no room for a hanging rail
    fireEvent.click(tab(uz['step.interior']));
    expect(option('rail').disabled).toBe(true);
    expect(option('rail').textContent).toContain(uz['creason.RAIL_DEPTH_SHORT']);
    expect(option('rail').textContent).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    expect(option('shelves').disabled).toBe(false);
  });

  it('a choice made invalid later is reset with a plain-language toast', () => {
    renderApp();
    fireEvent.click(tab(uz['step.interior']));
    fireEvent.click(option('rail'));
    fireEvent.click(tab(uz['step.size']));
    fireEvent.click(screen.getByRole('button', { name: uz['c.details'] }));
    typeInto(uz['param.depth'], '52');
    const toast = screen.getByTestId('reset-toast').textContent ?? '';
    expect(toast).toContain(uz['c.opt.rail']);
    expect(toast).toContain(uz['c.opt.auto']);
    expect(toast).toContain(uz['creason.RAIL_DEPTH_SHORT']);
    for (const w of CUSTOMER_BANNED_WORDS) expect(toast.toLowerCase()).not.toContain(w);
  });
});

describe('customer words', () => {
  it.each(['size', 'color', 'interior'])('step "%s" has no codes or engineering words', (step) => {
    renderApp();
    fireEvent.click(tab(uz[`step.${step}` as 'step.size']));
    const text = (document.querySelector('.panel')?.textContent ?? '').toLowerCase();
    for (const w of CUSTOMER_BANNED_WORDS) expect(text, w).not.toContain(w);
    expect(text).not.toMatch(/[a-z]+_[a-z_]+/); // no option / issue codes
  });

  it('Russian step 3 is translated', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: ru['lang.ru'] }));
    fireEvent.click(tab(ru['step.interior']));
    expect(document.querySelector('.option-list')?.textContent).toContain(ru['c.opt.rail']);
    expect(screen.getByRole('switch', { name: ru['c.withDoors'] })).toBeTruthy();
  });
});

describe('units', () => {
  it('customer overlay in whole sm, staff in mm', () => {
    renderApp();
    expect(document.querySelector('[data-dim="width"]')?.textContent).toBe('136 sm');
    expect(screen.getByTestId('summary').textContent).toContain('136 × 190 × 60 sm');
    fireEvent.click(tab(uz['step.interior']));
    expect(document.querySelector('[data-dim="section-0"]')?.textContent).toBe('66 sm');
    cleanup();
    setUrl('?mode=staff');
    render(<App />);
    expect(document.querySelector('[data-dim="width"]')?.textContent).toBe('1360 mm');
    expect(screen.getByTestId('summary').textContent).toContain('1360 × 1900 × 600 mm');
  });
});

describe('smart camera', () => {
  const camera = () => (stub().dataset.camera ?? '').split('#')[0];

  it('part pill / 3D tap frame the part; preset change keeps the focus', () => {
    renderApp();
    fireEvent.click(tab(uz['step.interior']));
    const parts = screen.getByRole('radiogroup', { name: uz['c.part'] });
    fireEvent.click(within(parts).getAllByRole('radio')[1] as HTMLElement);
    expect(camera()).toBe('selection:section-1');
    const before = stub().dataset.camera;
    fireEvent.click(document.querySelector('[data-preset="shelves"]') as HTMLElement);
    expect(stub().dataset.camera).toBe(before);
    fireEvent.click(screen.getByTestId('section-hit-0'));
    expect(camera()).toBe('selection:section-0');
    fireEvent.click(tab(uz['step.color']));
    expect(camera()).toBe('model');
  });
});

describe('global customer actions', () => {
  it('"Tayyor — ko\'rib chiqish" and "Konsultant chaqirish" on steps 1–3', () => {
    renderApp();
    for (const key of ['step.size', 'step.color', 'step.interior'] as const) {
      fireEvent.click(tab(uz[key]));
      expect(screen.getByRole('button', { name: uz['nav.readyReview'] })).toBeTruthy();
      expect(screen.getByRole('button', { name: uz['consultant.call'] })).toBeTruthy();
    }
  });

  it('consultant: honest modal (1408), event fired, configuration kept', () => {
    const events: Event[] = [];
    const on = (e: Event) => events.push(e);
    window.addEventListener('dafna:consultant-request', on);
    try {
      renderApp();
      fireEvent.click(plus(uz['param.width']));
      fireEvent.click(screen.getByRole('button', { name: uz['consultant.call'] }));
      expect(events).toHaveLength(1);
      const dialog = screen.getByRole('dialog', { name: uz['consultant.call'] });
      expect(dialog.textContent).toContain('1408');
      fireEvent.click(within(dialog).getByRole('button', { name: uz['consultant.close'] }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(stub().dataset.width).toBe('1370');
    } finally {
      window.removeEventListener('dafna:consultant-request', on);
    }
  });

  it('staff: no consultant button', () => {
    setUrl('?mode=staff');
    render(<App />);
    expect(screen.queryByRole('button', { name: uz['consultant.call'] })).toBeNull();
  });
});

describe('theme', () => {
  it('customer: Dark by default, no theme toggle', () => {
    renderApp();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.queryByRole('button', { name: uz['theme.dark'] })).toBeNull();
  });

  it('staff switch keeps the configuration; logo swaps', () => {
    setUrl('?mode=staff');
    render(<App />);
    const logo = () => screen.getByAltText(uz['app.brand']).getAttribute('src') ?? '';
    // the step card's stepper (staff engineering controls repeat it further down)
    fireEvent.click(
      screen.getAllByRole('button', {
        name: uz['param.width'] + ': ' + uz['control.increase'],
      })[0] as HTMLElement,
    );
    expect(logo()).toMatch(/dafna-logo-white\.svg$/);
    fireEvent.click(screen.getByRole('button', { name: uz['theme.dark'] }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(logo()).toMatch(/dafna-logo\.svg$/);
    expect(stub().dataset.width).toBe('1370');
  });
});

describe('staff engineering controls', () => {
  it('staff see section count, back panel and plinth sizes on step 1; can set sections', () => {
    setUrl('?mode=staff');
    render(<App />);
    const sections = screen.getByRole('radiogroup', { name: uz['param.sections'] });
    expect(screen.getByRole('radiogroup', { name: uz['param.backPanel'] })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: uz['param.plinthHeight'] })).toBeTruthy();
    fireEvent.click(within(sections).getByRole('radio', { name: /^3/ }));
    expect(stub().dataset.sections?.split(',').length).toBe(3);
  });

  it('staff see door presets and per-section overrides on step 3; issues + order draft', () => {
    setUrl('?mode=staff');
    render(<App />);
    fireEvent.click(tab(uz['step.interior']));
    expect(screen.getByRole('radiogroup', { name: uz['param.doors'] })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: "1-bo'lim eshigi" })).toBeTruthy();
    expect(screen.getByTestId('interior-details')).toBeTruthy();
    expect(screen.getByRole('button', { name: uz['staff.download'] })).toBeTruthy();
  });

  it('staff: out-of-range values are not corrected (engine error is shown)', () => {
    setUrl('?mode=staff');
    render(<App />);
    const width = () =>
      screen.getAllByRole('textbox', { name: uz['param.width'] })[0] as HTMLInputElement;
    fireEvent.focus(width());
    fireEvent.change(width(), { target: { value: '100' } });
    fireEvent.blur(width());
    expect(width().value).toBe('100');
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

describe('presentation and flow', () => {
  const skip = () => screen.queryByRole('button', { name: uz['present.skip'] });

  it('configurator -> presentation -> ready_to_confirm -> contact; panel hidden', () => {
    renderApp();
    fireEvent.click(tab(uz['step.review']));
    expect(flow()).toBe('presentation');
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(stub().dataset.reveal).toBe('full');
    fireEvent.click(skip() as HTMLElement);
    expect(flow()).toBe('ready_to_confirm');
    fireEvent.click(screen.getByRole('button', { name: uz['present.confirm'] }));
    expect(flow()).toBe('contact');
    expect(screen.getByRole('dialog', { name: uz['contact.title'] }).textContent).toContain(
      uz['step.comingSoon'],
    );
  });

  it('"Tayyor" jumps to the presentation; edit returns to step 3 with nothing lost', () => {
    renderApp();
    fireEvent.click(plus(uz['param.width']));
    fireEvent.click(screen.getByRole('button', { name: uz['nav.readyReview'] }));
    expect(flow()).toBe('presentation');
    fireEvent.click(skip() as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: uz['present.edit'] }));
    expect(flow()).toBe('configurator');
    expect(tab(uz['step.interior']).getAttribute('aria-current')).toBe('step');
    expect(stub().dataset.width).toBe('1370');
  });

  it('same configuration again: no animation; after an edit: short version', () => {
    renderApp();
    fireEvent.click(tab(uz['step.review']));
    fireEvent.click(skip() as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: uz['present.edit'] }));
    fireEvent.click(tab(uz['step.review']));
    expect(stub().dataset.reveal).toBe('none');
    fireEvent.click(screen.getByRole('button', { name: uz['present.edit'] }));
    fireEvent.click(tab(uz['step.size']));
    fireEvent.click(plus(uz['param.width']));
    fireEvent.click(tab(uz['step.review']));
    expect(stub().dataset.reveal).toBe('short');
  });

  it('prefers-reduced-motion: final state directly', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    try {
      renderApp();
      fireEvent.click(tab(uz['step.review']));
      expect(stub().dataset.reveal).toBe('instant');
      expect(skip()).toBeNull();
      expect(flow()).toBe('ready_to_confirm');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('reset toast timing', () => {
  it('disappears after 3 s', () => {
    vi.useFakeTimers();
    try {
      renderApp();
      fireEvent.click(tab(uz['step.interior']));
      fireEvent.click(document.querySelector('[data-preset="rail"]') as HTMLElement);
      fireEvent.click(tab(uz['step.size']));
      fireEvent.click(screen.getByRole('button', { name: uz['c.details'] }));
      typeInto(uz['param.depth'], '52');
      expect(screen.getByTestId('reset-toast')).toBeTruthy();
      act(() => vi.advanceTimersByTime(3000));
      expect(screen.queryByTestId('reset-toast')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
