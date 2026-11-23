import { useRef, useState } from 'react';

/**
 * D-13: staff mode behind a PIN. A long press on the logo asks for the PIN (customers never see
 * an entry); the PIN is checked by POST /api/staff-pin (env STAFF_PIN, never in this bundle).
 * `?mode=staff` also asks for it; a dev build skips the PIN.
 */
export const STAFF_REQUEST_EVENT = 'dafna:staff-request';
export const STAFF_EXIT_EVENT = 'dafna:staff-exit';
export const STAFF_PIN_URL = '/api/staff-pin';
/** hold the logo this long to ask for the PIN */
export const LONG_PRESS_MS = 3000;
/** wrong PINs in a row before the pad locks for LOCK_MS (the server limits attempts too) */
export const MAX_TRIES = 5;
export const LOCK_MS = 60_000;

export type PinOutcome =
  { ok: true } | { ok: false; code: 'wrong_pin' | 'rate_limited' | 'not_configured' | 'network' };

/**
 * D-19: the consultant PIN, kept in memory only (never storage) after the server accepted it,
 * so /api/quote returns the price breakdown to staff. Cleared when staff mode ends.
 */
let staffPinMemory: string | null = null;
export const currentStaffPin = () => staffPinMemory;
export const forgetStaffPin = () => {
  staffPinMemory = null;
};

export async function verifyStaffPin(
  pin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PinOutcome> {
  try {
    const res = await fetchImpl(STAFF_PIN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      staffPinMemory = pin;
      return { ok: true };
    }
    const data = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    const code = data?.error?.code;
    if (code === 'rate_limited' || code === 'not_configured') return { ok: false, code };
    if (res.status === 401) return { ok: false, code: 'wrong_pin' };
    return { ok: false, code: 'network' };
  } catch {
    return { ok: false, code: 'network' };
  }
}

export const requestStaff = () => window.dispatchEvent(new Event(STAFF_REQUEST_EVENT));
export const exitStaff = () => {
  forgetStaffPin();
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
