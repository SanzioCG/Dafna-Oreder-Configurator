import { useRef, useState } from 'react';
import { signIn, signOut } from '../auth/staffSession';

/**
 * D-13 / D-38: staff mode behind a staff sign-in. A long press on the logo asks for the login and
 * password (customers never see an entry); the server checks them (/api/auth) and sets an
 * HttpOnly session cookie, so /api/quote returns the price breakdown to staff. `?mode=staff` also
 * asks; a dev build skips it. Leaving staff mode signs out (a kiosk is a shared device).
 */
export const STAFF_REQUEST_EVENT = 'dafna:staff-request';
export const STAFF_EXIT_EVENT = 'dafna:staff-exit';
/** hold the logo this long to ask for the PIN */
export const LONG_PRESS_MS = 3000;

export type StaffSignIn =
  { ok: true } | { ok: false; code: 'wrong_login' | 'rate_limited' | 'must_change' | 'network' };

export async function signInStaff(
  login: string,
  password: string,
  fetchImpl?: typeof fetch,
): Promise<StaffSignIn> {
  const r = await signIn(login, password, fetchImpl);
  // D-39: a temporary password is changed on the manager page first
  if (r.ok && r.value.mustChange) {
    void signOut(fetchImpl);
    return { ok: false, code: 'must_change' };
  }
  if (r.ok) return { ok: true };
  if (r.code === 'wrong_login' || r.code === 'rate_limited') return { ok: false, code: r.code };
  return { ok: false, code: 'network' };
}

export const requestStaff = () => window.dispatchEvent(new Event(STAFF_REQUEST_EVENT));
export const exitStaff = () => {
  void signOut();
  window.dispatchEvent(new Event(STAFF_EXIT_EVENT));
};

/** Pointer handlers firing `onLongPress` after `ms` of holding (released early = nothing). */
export function useLongPress(onLongPress: () => void, ms = LONG_PRESS_MS) {
  const timer = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  return {
    /** true while the press is held (the logo fades as feedback) */
    holding,
    handlers: {
      onPointerDown: (e: { preventDefault: () => void }) => {
        e.preventDefault(); // no text selection / image drag on a mouse or touchpad
        cancel();
        setHolding(true);
        timer.current = window.setTimeout(() => {
          timer.current = null;
          setHolding(false);
          onLongPress();
        }, ms);
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
    },
  };
}
