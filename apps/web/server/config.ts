import { linkSecretFrom } from './assemblyLink';
import { giblabForLead } from './giblab';
import { buildOrderPdf, orderPdfInput } from './orderPdf';
import { CachedCatalog, GoogleSheetsCatalogStore } from './catalog';
import { GoogleSheetsPriceStore } from './priceSheet';
import { CachedPrices, tashkentMinute } from './prices';
import {
  assignees,
  CachedStaff,
  GoogleSheetsStaffStore,
  resendMailer,
  sessionSecretFrom,
  workingUser,
  type AuthDeps,
} from './staffAuth';
import { RateLimiter } from './rateLimit';
import { GoogleSheetsStore, parseServiceAccount } from './sheets';
import type { SubmitDeps } from './submit';
import { TelegramNotifier } from './telegram';

/**
 * Required Vercel environment variables (secrets live ONLY there, never in the repo or client):
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SHEET_ID
 * Cron: CRON_SECRET (Vercel sends it as "Authorization: Bearer …" to the cron endpoint).
 * Optional, non-production only: TELEGRAM_FORCE_FAIL=1 (simulates a Telegram outage).
 * D-38: ADMIN_PASSWORD (the built-in "admin" staff account; other staff are added by the admin
 * on /manager, tab "Xodimlar"). The price list lives in the same Google Sheet (tab "Narxlar").
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

/** D-12: the assembly-link key, derived from the service-account key (no extra env var). */
export function linkSecretFromEnv(env: Env): string {
  const account = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!account) throw new Error('google service account missing');
  return linkSecretFrom(account.private_key);
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
    orderPdf: async (lead) => {
      const input = orderPdfInput(lead);
      return input ? buildOrderPdf(input) : null;
    },
    giblab: async (lead) => giblabForLead(lead),
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
    linkSecret: linkSecretFromEnv(env),
    log: (event, detail) => console.error(JSON.stringify({ event, ...detail })),
  };
}

/** D-19: the price list store (same spreadsheet as the leads, tab "Narxlar"). */
export function priceStoreFromEnv(env: Env): GoogleSheetsPriceStore {
  const account = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!account || !env.GOOGLE_SHEET_ID) throw new Error('google sheets env missing');
  return new GoogleSheetsPriceStore({ sheetId: env.GOOGLE_SHEET_ID, account });
}

export function pricesFromEnv(env: Env): { store: GoogleSheetsPriceStore; prices: CachedPrices } {
  const store = priceStoreFromEnv(env);
  return { store, prices: new CachedPrices(store) };
}

/** D-20: the catalog extension (tab "Katalog"); one cache per warm instance. */
let catalogSingleton: { store: GoogleSheetsCatalogStore; catalog: CachedCatalog } | null = null;
export function catalogFromEnv(env: Env): {
  store: GoogleSheetsCatalogStore;
  catalog: CachedCatalog;
} {
  if (catalogSingleton) return catalogSingleton;
  const account = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!account || !env.GOOGLE_SHEET_ID) throw new Error('google sheets env missing');
  const store = new GoogleSheetsCatalogStore({ sheetId: env.GOOGLE_SHEET_ID, account });
  catalogSingleton = { store, catalog: new CachedCatalog(store) };
  return catalogSingleton;
}

/**
 * D-20: applies the catalog extension before an entry generates anything (a product with a
 * material / hardware added on the manager page). A failed read is logged, never fatal: built-in
 * materials keep working.
 */
export async function applyCatalogFromEnv(env: Env): Promise<void> {
  try {
    await catalogFromEnv(env).catalog.get();
  } catch (e) {
    console.error(JSON.stringify({ event: 'catalog_load_failed', message: (e as Error).message }));
  }
}

/** D-38: staff sign-in (tab "Xodimlar", ADMIN_PASSWORD); one per warm instance */
let authSingleton: AuthDeps | null = null;
export function authFromEnv(env: Env): AuthDeps {
  if (authSingleton) return authSingleton;
  const account = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!account || !env.GOOGLE_SHEET_ID) throw new Error('google sheets env missing');
  authSingleton = {
    secret: sessionSecretFrom(account.private_key),
    adminPassword: env.ADMIN_PASSWORD || undefined,
    staff: new CachedStaff(new GoogleSheetsStaffStore({ sheetId: env.GOOGLE_SHEET_ID, account })),
    // 10 sign-in attempts per IP per 10 minutes (per warm instance)
    limiter: new RateLimiter(10, 10 * 60 * 1000),
    now: Date.now,
    secure: true,
    stamp: () => tashkentMinute(new Date()),
    // D-39: "Parolni unutdim" e-mails (RESEND_API_KEY + MAIL_FROM); unset = ask the admin
    mailer:
      env.RESEND_API_KEY && env.MAIL_FROM
        ? resendMailer(env.RESEND_API_KEY, env.MAIL_FROM)
        : undefined,
    siteUrl: env.SITE_URL || undefined,
    log: (event, detail) => console.error(JSON.stringify({ event, ...detail })),
  };
  return authSingleton;
}

/**
 * D-38: the signed-in staff member of a request (null without a valid session; D-39: or while
 * the password is still the admin's temporary one)
 */
export const authOfEnv = (env: Env) => (req: Request) => workingUser(req, authFromEnv(env));

/** D-54: who an application can be given to (the "Xodimlar" tab, cached like the sign-in) */
export const peopleOfEnv = (env: Env) => async () => assignees(await authFromEnv(env).staff.get());
