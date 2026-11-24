import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uz } from './i18n/uz';
import { DAFNA_CONTACT, KIOSK_KEY, isKioskDevice } from './site';
import { clearBoards, offerBuiltInBoards } from './testBoards';

// the 3D scene is not under test here
vi.mock('./viewer/Scene', () => ({
  MM: 0.001,
  Scene: () => <div data-testid="viewer-stub" />,
}));

const { App } = await import('./App');

beforeEach(offerBuiltInBoards);
afterEach(() => {
  clearBoards();
  cleanup();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

const startWardrobe = () => {
  fireEvent.click(document.querySelector('[data-product="wardrobe"]') as HTMLElement);
  fireEvent.click(screen.getByRole('button', { name: uz['start.scratch'] }));
};

describe('D-43 the website (konfigurator.dafna.uz) vs a shop kiosk', () => {
  it('a kiosk is opened once with ?kiosk=1 and remembered; ?kiosk=0 forgets it', () => {
    expect(isKioskDevice('')).toBe(false);
    expect(isKioskDevice('?kiosk=1')).toBe(true);
    expect(window.localStorage.getItem(KIOSK_KEY)).toBe('1');
    expect(isKioskDevice('')).toBe(true);
    expect(isKioskDevice('?kiosk=0')).toBe(false);
  });

  it('the website: its own header with "Bog\'lanish", light by default, no consultant call', () => {
    render(<App />);
    expect(document.querySelector('.app')?.className).toContain('site');
    expect(screen.getByTestId('site-header')).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.queryByTestId('consultant-button')).toBeNull();
    // the product screen has no 3D view
    expect(document.querySelector('.app')?.getAttribute('data-start')).toBe('products');
    fireEvent.click(screen.getByTestId('site-contact'));
    const card = screen.getByTestId('site-contact-card');
    expect(card.textContent).toContain(DAFNA_CONTACT.phone);
    expect(card.querySelector('a')?.getAttribute('href')).toBe(DAFNA_CONTACT.tel);
  });

  it('the website: the phone step line and "Tayyor — ko\'rib chiqish"', () => {
    render(<App />);
    startWardrobe();
    expect(screen.getByTestId('step-progress').textContent).toContain(`1 / 5 · ${uz['step.size']}`);
    expect(screen.getByTestId('step-progress').textContent).toContain(uz['step.color']);
    expect(screen.getByTestId('to-review').textContent).toBe(uz['nav.readyReview']);
  });

  it('a kiosk keeps its own header and the consultant call', () => {
    window.localStorage.setItem(KIOSK_KEY, '1');
    render(<App />);
    expect(document.querySelector('.app')?.className).toContain('kiosk');
    expect(screen.queryByTestId('site-header')).toBeNull();
    expect(screen.getByTestId('consultant-button')).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
