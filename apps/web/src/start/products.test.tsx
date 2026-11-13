import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uz } from '../i18n/uz';
import type { SceneProps } from '../viewer/Scene';

// WebGL is not available in jsdom: a stub scene that exposes the generated parts.
vi.mock('../viewer/Scene', () => ({
  MM: 0.001,
  Scene: ({ view }: SceneProps) => (
    <div
      data-testid="viewer-stub"
      data-width={view.widthMm}
      data-height={view.heightMm}
      data-roles={[...new Set(view.result.panels.map((p) => p.role))].sort().join(',')}
    />
  ),
}));

const { App } = await import('../App');

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const stub = () => screen.getByTestId('viewer-stub');
const tab = (label: string) =>
  within(screen.getByRole('navigation')).getByRole('button', { name: new RegExp(label) });
const pickProduct = (id: string) =>
  fireEvent.click(document.querySelector(`[data-product="${id}"]`) as HTMLElement);
const pickModel = (nameKey: keyof typeof uz) =>
  fireEvent.click(screen.getByRole('button', { name: `${uz[nameKey]}: ${uz['start.choose']}` }));
const option = (key: string) =>
  document.querySelector(`[data-option="${key}"]`) as HTMLButtonElement;

describe('D-8 start screen: Shkaf / Ofis tumbasi / Stol', () => {
  it('three products; each shows its own ready-made models', () => {
    render(<App />);
    expect([...document.querySelectorAll('[data-product]')].map((b) => b.textContent)).toEqual([
      uz['product.wardrobe'],
      uz['product.pedestal'],
      uz['product.desk'],
    ]);
    expect(document.querySelectorAll('.model-card')).toHaveLength(4);
    pickProduct('pedestal');
    expect(screen.getByRole('heading', { name: uz['start.title.pedestal'] })).toBeTruthy();
    expect(document.querySelectorAll('.model-card')).toHaveLength(3);
    pickProduct('desk');
    expect(document.querySelectorAll('.model-card')).toHaveLength(3);
  });
});

describe('D-8 office pedestal', () => {
  it('model -> steps Joy / Rang / Tortmalar; drawers, castors; A4 file drawer needs 45 sm', () => {
    render(<App />);
    pickProduct('pedestal');
    pickModel('model.pedDrawers');
    expect(tab(uz['step.interior.pedestal'])).toBeTruthy();
    expect(stub().dataset.width).toBe('400');
    expect(stub().dataset.roles).toContain('drawer_front');
    expect(stub().dataset.roles).toContain('frame'); // castors
    // standard widths only
    const width = screen.getByRole('radiogroup', { name: uz['param.width'] });
    expect(
      within(width)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['40 sm', '45 sm']);
    fireEvent.click(tab(uz['step.interior.pedestal']));
    expect(option('drawers2_file').disabled).toBe(true);
    expect(option('drawers2_file').textContent).toContain(uz['creason.FILE_DRAWER_TOO_SMALL']);
    fireEvent.click(tab(uz['step.size']));
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: uz['param.width'] })).getByRole('radio', {
        name: '45 sm',
      }),
    );
    fireEvent.click(tab(uz['step.interior.pedestal']));
    expect(option('drawers2_file').disabled).toBe(false);
    fireEvent.click(option('door_shelf'));
    expect(stub().dataset.roles).toContain('door');
  });

  it('"G\'ildirakli" toggle: castors <-> plinth', () => {
    render(<App />);
    pickProduct('pedestal');
    pickModel('model.pedDrawers');
    const toggle = screen.getByRole('switch', { name: uz['c.castors'] });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(stub().dataset.roles).toContain('plinth');
    expect(stub().dataset.roles).not.toContain('frame');
  });
});

describe('D-8 desk', () => {
  it('legs decide the colour step: metal -> frame colour, LDSP -> leg decor', () => {
    render(<App />);
    pickProduct('desk');
    pickModel('model.deskMetal');
    expect(stub().dataset.height).toBe('740');
    expect(stub().dataset.roles).toContain('frame');
    fireEvent.click(tab(uz['step.color']));
    expect(screen.getByRole('radiogroup', { name: uz['param.topMaterial'] })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: uz['param.frameColor'] })).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: uz['param.legMaterial'] })).toBeNull();
    fireEvent.click(tab(uz['step.interior.desk']));
    fireEvent.click(option('ldsp'));
    expect(stub().dataset.roles).toContain('leg');
    fireEvent.click(tab(uz['step.color']));
    expect(screen.getByRole('radiogroup', { name: uz['param.legMaterial'] })).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: uz['param.frameColor'] })).toBeNull();
  });

  it('presentation line: work top and legs, not "Korpus / Eshik"', () => {
    render(<App />);
    pickProduct('desk');
    pickModel('model.deskLdsp');
    fireEvent.click(tab(uz['step.review']));
    expect(screen.getByTestId('present-summary-line').textContent).toBe(
      '120 × 74 × 70 sm · Stoleshnitsa: Белый 22 мм · Oyoq: Белый шагрень',
    );
  });
});
