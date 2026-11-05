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

/** The `?theme=` URL override is for staff and development only (D-4). */
export function themeUrlOverrideAllowed(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
  dev: boolean = import.meta.env.DEV,
): boolean {
  return dev || new URLSearchParams(search).get('mode') === 'staff';
}

/**
 * Kiosk default theme: build-time env `VITE_KIOSK_THEME=dark|white` (per kiosk deployment).
 * `?theme=dark|light|white` overrides it only in staff mode or a dev build. Default: DARK.
 * Staff can switch it on the device (stored per device); customers have no theme toggle.
 */
export function kioskDefaultTheme(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
  env: string | undefined = import.meta.env.VITE_KIOSK_THEME as string | undefined,
  allowUrl: boolean = themeUrlOverrideAllowed(search),
): Theme {
  const fromUrl = allowUrl ? new URLSearchParams(search).get('theme') : null;
  const value = fromUrl ?? env;
  // V2: Dark is the default kiosk theme; 'white' / 'light' select the White theme
  return value === 'white' || value === 'light' ? 'light' : 'dark';
}

/** Event fired by "Konsultant chaqirish" (D-2a will deliver it to staff). */
export const CONSULTANT_EVENT = 'dafna:consultant-request';

export interface ConsultantRequest {
  /** wizard step / flow state the customer is on */
  where: string;
  /** configuration revision (serialized params) — so staff can open the same configuration */
  revision: string;
  at: string;
}

/**
 * Consultant call hook: dispatches a window event; nothing is sent anywhere yet (no backend).
 * Returns the request so callers / tests can inspect it.
 */
export function requestConsultant(where: string, revision: string): ConsultantRequest {
  const detail: ConsultantRequest = { where, revision, at: new Date().toISOString() };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CONSULTANT_EVENT, { detail }));
  }
  return detail;
}

/**
 * Kiosk / branch id sent with every application ("Filial/Kiosk" column): `?kiosk=` in the
 * kiosk's start URL, else the build-time VITE_KIOSK_ID, else empty. Sanitised to the API format.
 */
export function kioskId(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
  env: string | undefined = import.meta.env.VITE_KIOSK_ID as string | undefined,
): string {
  const raw = new URLSearchParams(search).get('kiosk') ?? env ?? '';
  return raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}
