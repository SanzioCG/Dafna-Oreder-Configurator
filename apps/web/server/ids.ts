import { createHash } from 'node:crypto';

/** No 0/O, 1/I: unambiguous when read aloud over the phone. */
export const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ID_RE = /^DFN-\d{6}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/;

/** Asia/Tashkent is UTC+5 all year (no daylight saving time). */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

function tashkent(now: Date): Date {
  return new Date(now.getTime() + TASHKENT_OFFSET_MS);
}
const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-05 14:03:12" (Asia/Tashkent). */
export function tashkentTimestamp(now: Date): string {
  const t = tashkent(now);
  return (
    `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ` +
    `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`
  );
}

/** Parses tashkentTimestamp() back to a Date (NaN date if malformed). */
export function parseTashkentTimestamp(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (!m) return new Date(NaN);
  const [, y, mo, d, h, mi, se] = m.map(Number) as number[];
  return new Date(Date.UTC(y!, mo! - 1, d!, h!, mi!, se!) - TASHKENT_OFFSET_MS);
}

/**
 * Application ID "DFN-YYMMDD-XXXX": date in Asia/Tashkent + 4 characters derived from the
 * client's random idempotency key (UUID), so it is random-looking, never sequential, and a
 * retry of the same request maps to the same ID. `salt` > 0 re-derives after a collision.
 */
export function makeApplicationId(idempotencyKey: string, now: Date, salt = 0): string {
  const t = tashkent(now);
  const date = `${pad(t.getUTCFullYear() % 100)}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`;
  const hash = createHash('sha256').update(`${idempotencyKey}:${salt}`).digest();
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += ID_ALPHABET[hash[i]! % ID_ALPHABET.length];
  return `DFN-${date}-${suffix}`;
}
