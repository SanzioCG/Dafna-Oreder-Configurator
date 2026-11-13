import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uz } from '../i18n/uz';
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
const priceNumber = () =>
  Number(
    (screen.getByTestId('price').querySelector('strong')?.textContent ?? '').replace(/\D/g, ''),
  );

describe('D-9 price and mechanisms', () => {
  it('customers never see a DEMO price', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: uz['start.scratch'] }));
    expect(screen.queryByTestId('price')).toBeNull();
  });

  it('staff see the demo price, marked; Hettich costs more than Strax; breakdown', () => {
    window.history.replaceState(null, '', '/?mode=staff');
    render(<App />);
    const tag = screen.getByTestId('price');
    expect(tag.textContent).toContain(uz['price.demo']);
    const strax = priceNumber();
    expect(strax).toBeGreaterThan(0);
    fireEvent.click(tab(uz['step.interior']));
    const hinges = screen.getByRole('radiogroup', { name: uz['param.hingeBrand'] });
    // the default wardrobe has doors but no drawers: only the hinge choice is offered
    expect(screen.queryByRole('radiogroup', { name: uz['param.slideBrand'] })).toBeNull();
    fireEvent.click(within(hinges).getByRole('radio', { name: /Hettich/ }));
    expect(priceNumber()).toBeGreaterThan(strax);
    fireEvent.click(screen.getByRole('button', { name: uz['staff.settings'] }));
    expect(screen.getByTestId('price-breakdown').textContent).toContain('hinge_hettich_sensys');
  });
});
