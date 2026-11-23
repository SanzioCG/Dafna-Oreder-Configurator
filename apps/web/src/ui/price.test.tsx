import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PriceResult } from '@dafna/engine';
import { uz } from '../i18n/uz';
import { priceVisible } from './PriceTag';
import type { SceneProps } from '../viewer/Scene';

vi.mock('../viewer/Scene', () => ({
  MM: 0.001,
  Scene: ({ view }: SceneProps) => <div data-testid="viewer-stub" data-width={view.widthMm} />,
}));

const { App } = await import('../App');

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

const tab = (label: string) =>
  within(screen.getByRole('navigation')).getByRole('button', { name: new RegExp(label) });
/** the price the tag runs to (the shown number animates towards it) */
const priceNumber = () => Number(screen.getByTestId('price').dataset.total);

describe('D-9 price and mechanisms', () => {
  it('D-18: customers see the DEMO price, marked; VITE_HIDE_DEMO_PRICE=1 hides it', () => {
    const demo = { demo: true } as PriceResult;
    // showDemo = false: a deployment built with VITE_HIDE_DEMO_PRICE=1
    expect(priceVisible('customer', demo, false)).toBe(false);
    expect(priceVisible('customer', { demo: false } as PriceResult, false)).toBe(true);
    expect(priceVisible('staff', demo, false)).toBe(true);
    expect(priceVisible('customer', demo, true)).toBe(true);
    render(<App />); // no VITE_HIDE_DEMO_PRICE: the demo price is shown
    fireEvent.click(document.querySelector('[data-product="wardrobe"]') as HTMLElement); // D-24
    fireEvent.click(screen.getByRole('button', { name: uz['start.scratch'] }));
    expect(screen.getByTestId('price').textContent).toContain(uz['price.demo']);
  });

  it('"Mexanizmlar" is its own step: Keyingi from the fill lands on it, then review', () => {
    window.history.replaceState(null, '', '/?mode=staff');
    render(<App />);
    fireEvent.click(tab(uz['step.interior']));
    expect(screen.queryByTestId('hardware')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(uz['nav.next']) }));
    expect(screen.getByTestId('hardware')).toBeTruthy();
    expect(
      within(screen.getByRole('navigation'))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(expect.arrayContaining([expect.stringContaining(uz['step.hardware'])]));
  });

  it('D-27: door mount as two picture cards with a plain hint; tapping one selects it', () => {
    window.history.replaceState(null, '', '/?mode=staff');
    render(<App />);
    fireEvent.click(tab(uz['step.interior']));
    const cards = within(screen.getByTestId('door-mount')).getAllByRole('radio');
    expect(cards.map((c) => c.dataset.mount)).toEqual(['overlay', 'inset']);
    expect(cards.every((c) => c.querySelector('svg.mount-icon'))).toBe(true);
    const inset = cards[1] as HTMLElement;
    expect(inset.getAttribute('aria-checked')).toBe('true');
    expect(inset.textContent).toContain(uz['c.hint.doorMount.inset']);
    fireEvent.click(cards[0] as HTMLElement);
    expect(
      within(screen.getByTestId('door-mount'))
        .getAllByRole('radio')[0]!
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('staff see the demo price, marked; Hettich costs more than Strax; breakdown', () => {
    window.history.replaceState(null, '', '/?mode=staff');
    render(<App />);
    const tag = screen.getByTestId('price');
    expect(tag.textContent).toContain(uz['price.demo']);
    const strax = priceNumber();
    expect(strax).toBeGreaterThan(0);
    fireEvent.click(tab(uz['step.hardware']));
    // the default wardrobe has doors but no drawers: only the hinge choice is offered
    expect(screen.queryByTestId('hw-open-slideBrand')).toBeNull();
    // D-23: the chosen hinge opens the large menu, models grouped by brand
    fireEvent.click(screen.getByTestId('hw-open-hingeBrand'));
    const sheet = screen.getByRole('dialog', { name: uz['hw.pick.hingeBrand'] });
    expect(
      within(sheet)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Strax', 'Hettich']);
    // D-10b: every model carries a picture of its mechanism
    expect(within(sheet).getByTestId('mech-photo-hinge-strax')).toBeTruthy();
    expect(within(sheet).getByTestId('mech-photo-hinge-hettich')).toBeTruthy();
    // a brand chip filters the list
    fireEvent.click(within(sheet).getByRole('button', { name: /Hettich/ }));
    expect(within(sheet).getAllByRole('radio')).toHaveLength(1);
    fireEvent.click(within(sheet).getByRole('radio', { name: /Hettich/ }));
    expect(screen.queryByTestId('hw-sheet')).toBeNull();
    expect(priceNumber()).toBeGreaterThan(strax);
    // D-10: the 3D legend names the chosen hinge and counts them like the bill of materials
    const legend = screen.getByTestId('mech-legend').textContent ?? '';
    expect(legend).toContain('Hettich Sensys');
    expect(legend).toMatch(/\d+ ta/);
    expect(screen.getByTestId('demo-hingeBrand')).toBeTruthy();
    expect(screen.getByTestId('mech-photo-hinge-hettich')).toBeTruthy(); // the chosen one
    fireEvent.click(screen.getByRole('button', { name: uz['staff.settings'] }));
    expect(screen.getByTestId('price-breakdown').textContent).toContain('hinge_hettich_sensys');
  });
});
