import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kioskDefaultTheme, themeUrlOverrideAllowed } from '../kiosk';
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
  it('Dark by default; env decides, URL overrides; white/light select White', () => {
    expect(kioskDefaultTheme('', undefined)).toBe('dark');
    expect(kioskDefaultTheme('', 'white')).toBe('light');
    expect(kioskDefaultTheme('', 'light')).toBe('light');
    expect(kioskDefaultTheme('?theme=dark', 'white')).toBe('dark');
    expect(kioskDefaultTheme('?theme=white', undefined)).toBe('light');
    expect(kioskDefaultTheme('?theme=neon', 'blue')).toBe('dark');
  });
});

describe('ThemeProvider', () => {
  it('applies the theme to <html data-theme>, swaps the logo and persists the toggle', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByTestId('logo').getAttribute('src')).toBe(LOGO_URL.dark);
    expect(LOGO_URL.dark).toContain('dafna-logo-white.svg');
    act(() => screen.getByText('toggle').click());
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByTestId('logo').getAttribute('src')).toBe(LOGO_URL.light);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('restores the stored device choice; session reset returns to the kiosk default', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    window.history.replaceState(null, '', '/?theme=dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('light');
    act(() => screen.getByText('reset').click());
    expect(screen.getByTestId('theme').textContent).toBe('dark');
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
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    act(() => screen.getByText('toggle').click());
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('?theme URL override (D-4: staff / dev only)', () => {
  it('customer production build ignores ?theme; staff or dev may override', () => {
    expect(kioskDefaultTheme('?theme=light', undefined, false)).toBe('dark');
    expect(kioskDefaultTheme('?theme=light', 'white', false)).toBe('light'); // env still applies
    expect(kioskDefaultTheme('?theme=light', undefined, true)).toBe('light');
    expect(themeUrlOverrideAllowed('?theme=light', false)).toBe(false);
    expect(themeUrlOverrideAllowed('?mode=staff&theme=light', false)).toBe(true);
    expect(themeUrlOverrideAllowed('', true)).toBe(true);
  });
});
