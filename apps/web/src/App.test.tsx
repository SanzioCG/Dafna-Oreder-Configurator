import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ru } from './i18n/ru';
import { uz } from './i18n/uz';
import type { ViewGeometry } from './state/useConfigurator';

// WebGL is not available in jsdom: replace the 3D viewer with a stub that exposes the
// engine result it receives.
vi.mock('./viewer/Viewer', () => ({
  Viewer: ({ view }: { view: ViewGeometry }) => (
    <div
      data-testid="viewer-stub"
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

function typeInto(label: string, value: string) {
  const input = screen.getByRole('textbox', { name: label });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe('App (customer mode)', () => {
  it('renders in Uzbek with size and color steps active, later steps disabled', () => {
    render(<App />);
    expect(screen.getByText(uz['app.title'])).toBeTruthy();
    expect(screen.getByRole('button', { name: /O'lcham/ }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: /Rang/ }).hasAttribute('disabled')).toBe(false);
    for (const key of ['step.interior', 'step.doors', 'step.review'] as const) {
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
  const openColorStep = () => fireEvent.click(screen.getByRole('button', { name: /Rang/ }));
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

describe('App (staff mode)', () => {
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
