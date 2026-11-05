import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kioskDefaultTheme } from '../kiosk';
import {
  LOGO_URL,
  THEME_STORAGE_KEY,
  ThemeProvider,
  readStoredTheme,
  useTheme,
} from './ThemeProvider';

function Probe() {
  const { theme, toggleTheme, resetTheme, logoUrl } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <img data-testid="logo" src={logoUrl} alt="" />
      <button type="button" onClick={toggleTheme}>
        toggle
      </button>
      <button type="button" onClick={resetTheme}>
        reset
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  delete document.documentElement.dataset.theme;
});

describe('kiosk default theme', () => {
  it('env decides, URL overrides, anything else is light', () => {
    expect(kioskDefaultTheme('', undefined)).toBe('light');
    expect(kioskDefaultTheme('', 'dark')).toBe('dark');
    expect(kioskDefaultTheme('?theme=light', 'dark')).toBe('light');
    expect(kioskDefaultTheme('?theme=dark', undefined)).toBe('dark');
    expect(kioskDefaultTheme('?theme=neon', 'blue')).toBe('light');
  });
});

describe('ThemeProvider', () => {
  it('applies the theme to <html data-theme>, swaps the logo and persists the toggle', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByTestId('logo').getAttribute('src')).toBe(LOGO_URL.light);
    act(() => screen.getByText('toggle').click());
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByTestId('logo').getAttribute('src')).toBe(LOGO_URL.dark);
    expect(LOGO_URL.dark).toContain('dafna-logo-white.svg');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('restores the stored device choice; session reset returns to the kiosk default', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    window.history.replaceState(null, '', '/?theme=light');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    act(() => screen.getByText('reset').click());
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('tolerates storage failures (read and write throw)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(readStoredTheme()).toBeNull();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('light');
    act(() => screen.getByText('toggle').click());
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
