import { RateLimiter } from './rateLimit';
import { GoogleSheetsStore, parseServiceAccount } from './sheets';
import type { SubmitDeps } from './submit';
import { TelegramNotifier } from './telegram';

/**
 * Required Vercel environment variables (secrets live ONLY there, never in the repo or client):
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SHEET_ID
 * Cron: CRON_SECRET (Vercel sends it as "Authorization: Bearer …" to the cron endpoint).
 * Optional, non-production only: TELEGRAM_FORCE_FAIL=1 (simulates a Telegram outage).
 */
export const REQUIRED_ENV = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_SHEET_ID',
] as const;

type Env = Record<string, string | undefined>;

export function missingEnv(env: Env): string[] {
  const missing: string[] = REQUIRED_ENV.filter((k) => !env[k]);
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON && !parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON)) {
    missing.push('GOOGLE_SERVICE_ACCOUNT_JSON (invalid JSON)');
  }
  return missing;
}

export function storeFromEnv(env: Env): GoogleSheetsStore {
  const account = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!account || !env.GOOGLE_SHEET_ID) throw new Error('google sheets env missing');
  return new GoogleSheetsStore({ sheetId: env.GOOGLE_SHEET_ID, account });
}

export function notifierFromEnv(env: Env): TelegramNotifier {
  return new TelegramNotifier({
    token: env.TELEGRAM_BOT_TOKEN ?? '',
    chatId: env.TELEGRAM_CHAT_ID ?? '',
    forceFail: env.TELEGRAM_FORCE_FAIL === '1' && env.VERCEL_ENV !== 'production',
  });
}

/** Rate limits: per client IP (a shop's kiosks may share one) and per kiosk id. */
export const IP_LIMIT = { limit: 20, windowMs: 10 * 60 * 1000 };
export const KIOSK_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };

export function submitDepsFromEnv(env: Env): SubmitDeps {
  return {
    store: storeFromEnv(env),
    notifier: notifierFromEnv(env),
    now: () => new Date(),
    ipLimiter: new RateLimiter(IP_LIMIT.limit, IP_LIMIT.windowMs),
    kioskLimiter: new RateLimiter(KIOSK_LIMIT.limit, KIOSK_LIMIT.windowMs),
    engineVersion: env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
    log: (event, detail) => console.error(JSON.stringify({ event, ...detail })),
  };
}
