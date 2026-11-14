import { createHash, timingSafeEqual } from 'node:crypto';
import type { RateLimiter } from './rateLimit';

/**
 * D-13: POST /api/staff-pin {pin} — the consultant PIN is checked here, never in the kiosk
 * bundle (anyone could read it there). The PIN lives only in the Vercel env var STAFF_PIN.
 * Attempts are rate limited per client IP. Staff mode only unlocks kiosk-side tools (demo price,
 * unconfirmed settings); it grants no server rights, so no session token is issued.
 */
export const PIN_RE = /^\d{4,8}$/;

export interface StaffPinDeps {
  /** STAFF_PIN; undefined / invalid = not configured */
  pin: string | undefined;
  limiter: RateLimiter;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const digest = (s: string) => createHash('sha256').update(s).digest();

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip'))?.trim() || 'unknown';
}

export async function handleStaffPin(req: Request, deps: StaffPinDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: { code: 'method_not_allowed' } });
  if (!deps.pin || !PIN_RE.test(deps.pin)) return json(503, { error: { code: 'not_configured' } });
  if (!deps.limiter.take(clientIp(req))) return json(429, { error: { code: 'rate_limited' } });
  let pin: string;
  try {
    const body = (await req.json()) as { pin?: unknown };
    pin = typeof body.pin === 'string' ? body.pin : '';
  } catch {
    return json(400, { error: { code: 'invalid_request' } });
  }
  // compare digests: equal length, constant time
  const ok = PIN_RE.test(pin) && timingSafeEqual(digest(pin), digest(deps.pin));
  return ok ? json(200, { ok: true }) : json(401, { error: { code: 'wrong_pin' } });
}
