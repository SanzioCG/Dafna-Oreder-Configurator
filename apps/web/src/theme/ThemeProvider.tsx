import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { kioskDefaultTheme, type Theme } from '../kiosk';

export type { Theme } from '../kiosk';

/** localStorage key of the per-device theme choice. */
export const THEME_STORAGE_KEY = 'dafna.theme';

/** Storage may be unavailable (private mode, kiosk lockdown, quota): never throw. */
export function readStoredTheme(): Theme | null {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: Theme | null): void {
  try {
    if (theme) window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    else window.localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    /* storage unavailable: the choice just isn't persisted */
  }
}

/** Served from apps/web/public/brand (Vite copies public/ as-is; BASE_URL keeps it base-safe). */
export const LOGO_URL: Record<Theme, string> = {
  light: `${import.meta.env.BASE_URL}brand/dafna-logo.svg`,
  dark: `${import.meta.env.BASE_URL}brand/dafna-logo-white.svg`,
};

interface ThemeValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** session reset (D-3b idle timeout): forget the device choice, back to the kiosk default */
  resetTheme: () => void;
  logoUrl: string;
}

/**
 * Applied synchronously (not only in an effect): the 3D scene reads themed colours with
 * getComputedStyle during its render, which runs before the provider's effects.
 */
function applyTheme(theme: Theme): Theme {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
  return theme;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Light (default) / dark theme via `<html data-theme>`; every colour comes from the tokens files.
 * Initial theme = stored device choice, else the kiosk default (see kioskDefaultTheme).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    applyTheme(readStoredTheme() ?? kioskDefaultTheme()),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    writeStoredTheme(next);
    setThemeState(applyTheme(next));
  }, []);
  const toggleTheme = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [theme, setTheme],
  );
  const resetTheme = useCallback(() => {
    writeStoredTheme(null);
    setThemeState(applyTheme(kioskDefaultTheme()));
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({ theme, setTheme, toggleTheme, resetTheme, logoUrl: LOGO_URL[theme] }),
    [theme, setTheme, toggleTheme, resetTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
