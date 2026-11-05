/**
 * Page-level touch hardening for the kiosk: no browser pinch-zoom, no double-tap zoom,
 * no scroll bounce, no long-press context menu. CSS (`touch-action`, `overscroll-behavior`)
 * does most of the work; these listeners cover what CSS cannot.
 */
export function installKioskGuards(): () => void {
  const prevent = (e: Event) => e.preventDefault();
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) e.preventDefault(); // trackpad pinch / ctrl+wheel page zoom
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length > 1 && !(e.target instanceof HTMLCanvasElement)) e.preventDefault();
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
  };
  const opts: AddEventListenerOptions = { passive: false };
  document.addEventListener('gesturestart', prevent, opts);
  document.addEventListener('gesturechange', prevent, opts);
  document.addEventListener('contextmenu', prevent, opts);
  document.addEventListener('wheel', onWheel, opts);
  document.addEventListener('touchmove', onTouchMove, opts);
  document.addEventListener('keydown', onKey, opts);
  return () => {
    document.removeEventListener('gesturestart', prevent);
    document.removeEventListener('gesturechange', prevent);
    document.removeEventListener('contextmenu', prevent);
    document.removeEventListener('wheel', onWheel);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('keydown', onKey);
  };
}

export type Theme = 'light' | 'dark';

/**
 * Kiosk default theme: build-time env `VITE_KIOSK_THEME=dark|light` (per kiosk deployment),
 * overridable per URL with `?theme=dark|light` (useful for testing a device). Default: light.
 * The customer's toggle is stored per device on top of this, and a session reset returns here.
 */
export function kioskDefaultTheme(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
  env: string | undefined = import.meta.env.VITE_KIOSK_THEME as string | undefined,
): Theme {
  const fromUrl = new URLSearchParams(search).get('theme');
  const value = fromUrl ?? env;
  return value === 'dark' ? 'dark' : 'light';
}
