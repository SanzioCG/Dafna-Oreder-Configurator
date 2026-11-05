import { ORDER_SCHEMA_VERSION, generate, resolveParams, wardrobeTemplate } from '@dafna/engine';
import type { SubmitErrorCode, SubmitRequest } from '../src/lead/api';
import { cleanContact, validateContact, type ContactInput } from '../src/lead/contact';
import { phoneE164 } from '../src/lead/phone';
import { summarizeResult } from '../src/lead/summary';
import { isCustomerBlocking } from '../src/state/blocking';
import { makeApplicationId, tashkentTimestamp } from './ids';
import type { RateLimiter } from './rateLimit';
import type { LeadRecord, LeadStore, Notifier } from './types';

/** Whole request body (JSON incl. the base64 render). Vercel's own limit is 4.5 MB. */
export const MAX_BODY_CHARS = 3_000_000;
/** Decoded render PNG. */
export const MAX_RENDER_BYTES = 2_000_000;
/** Compact params JSON (a few hundred characters in practice). */
export const MAX_PARAMS_CHARS = 4_000;

const KEY_RE = /^[A-Za-z0-9-]{16,64}$/;
const KIOSK_RE = /^[A-Za-z0-9_-]{1,40}$/;
const PNG_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

export interface SubmitDeps {
  store: LeadStore;
  notifier: Notifier;
  now: () => Date;
  ipLimiter: RateLimiter;
  kioskLimiter: RateLimiter;
  /** VERCEL_GIT_COMMIT_SHA (or "dev") */
  engineVersion: string;
  /** error codes only — never contact data or secrets */
  log?: (event: string, detail?: Record<string, unknown>) => void;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const fail = (
  status: number,
  code: SubmitErrorCode,
  extra: { fields?: string[]; issues?: string[] } = {},
) => json(status, { error: { code, ...extra } });

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip'))?.trim() || 'unknown';
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Decodes and checks the optional render; undefined = absent, null = invalid. */
function decodeRender(value: unknown): Uint8Array | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !value.startsWith(PNG_PREFIX)) return null;
  const bytes = Buffer.from(value.slice(PNG_PREFIX.length), 'base64');
  if (bytes.length === 0 || bytes.length > MAX_RENDER_BYTES) return null;
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return null;
  return new Uint8Array(bytes);
}

/**
 * POST /api/submit. Order of work: cheap checks -> engine re-validation -> idempotency lookup ->
 * persist the lead (the source of truth) -> notify Telegram. A notification failure never fails
 * the request: the row is marked "failed" and the cron retries it.
 */
export async function handleSubmit(req: Request, deps: SubmitDeps): Promise<Response> {
  const log = deps.log ?? (() => {});
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');
  if (!deps.ipLimiter.take(clientIp(req))) return fail(429, 'rate_limited');

  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_CHARS) return fail(413, 'payload_too_large');
  const text = await req.text();
  if (text.length > MAX_BODY_CHARS) return fail(413, 'payload_too_large');

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, 'invalid_json');
  }
  if (!isObject(body)) return fail(400, 'invalid_request');
  const b = body as Partial<SubmitRequest> & Record<string, unknown>;

  // honeypot: humans never see the field
  if (b.website !== undefined && b.website !== '') return fail(400, 'rejected');

  const bad: string[] = [];
  if (typeof b.idempotencyKey !== 'string' || !KEY_RE.test(b.idempotencyKey)) {
    bad.push('idempotencyKey');
  }
  if (b.lang !== 'uz' && b.lang !== 'ru') bad.push('lang');
  if (b.kioskId !== undefined && (typeof b.kioskId !== 'string' || !KIOSK_RE.test(b.kioskId))) {
    bad.push('kioskId');
  }
  if (!isObject(b.contact)) bad.push('contact');
  if (!isObject(b.params) || JSON.stringify(b.params).length > MAX_PARAMS_CHARS) {
    bad.push('params');
  }
  const render = decodeRender(b.renderPng);
  if (render === null) bad.push('renderPng');
  if (bad.length > 0) return fail(400, 'invalid_request', { fields: bad });

  const kioskId = b.kioskId ?? '';
  if (kioskId && !deps.kioskLimiter.take(kioskId)) return fail(429, 'rate_limited');

  const rawContact = b.contact as unknown as Record<string, unknown>;
  const contactIn: ContactInput = {
    firstName: typeof rawContact.firstName === 'string' ? rawContact.firstName : '',
    lastName: typeof rawContact.lastName === 'string' ? rawContact.lastName : '',
    phone: typeof rawContact.phone === 'string' ? rawContact.phone : '',
    consent: rawContact.consent === true,
  };
  const contactErrors = validateContact(contactIn);
  if (Object.keys(contactErrors).length > 0) {
    return fail(422, 'invalid_contact', { fields: Object.keys(contactErrors) });
  }
  const contact = cleanContact(contactIn);

  // the engine is the authority: never trust the kiosk's own validation
  const resolved = resolveParams(wardrobeTemplate, b.params);
  const result = generate(wardrobeTemplate, b.params);
  const blocking = [...resolved.issues, ...result.issues].filter(
    (i) => isCustomerBlocking(i) || i.code === 'UNKNOWN_PARAM',
  );
  if (blocking.length > 0 || !result.dimensions) {
    return fail(422, 'invalid_configuration', {
      issues: [...new Set(blocking.map((i) => i.code))],
    });
  }

  const key = b.idempotencyKey as string;
  let existing;
  try {
    existing = await deps.store.findByKey(key);
  } catch (e) {
    log('store_lookup_failed', { message: (e as Error).message });
    return fail(503, 'storage_failed');
  }
  if (existing) return json(200, { id: existing.id, status: 'submitted' });

  const now = deps.now();
  const summary = summarizeResult(resolved.params, result, 'uz');
  let lead: LeadRecord;
  let stored;
  try {
    let id = makeApplicationId(key, now);
    for (let salt = 1; (await deps.store.hasId(id)) && salt <= 5; salt++) {
      id = makeApplicationId(key, now, salt);
    }
    lead = {
      id,
      createdAt: tashkentTimestamp(now),
      status: 'Yangi',
      firstName: contact.firstName,
      lastName: contact.lastName ?? '',
      phone: phoneE164(contact.phone),
      sizeMm: summary.sizeMm,
      corpus: summary.corpus,
      door: summary.door ?? '—',
      sections: summary.sections,
      doors: summary.doors,
      kiosk: kioskId,
      lang: b.lang as string,
      telegram: 'pending',
      managerNote: '',
      paramsJson: JSON.stringify(resolved.params),
      schemaVersion: ORDER_SCHEMA_VERSION,
      templateVersion: wardrobeTemplate.templateVersion,
      engineVersion: deps.engineVersion,
      idempotencyKey: key,
      telegramAttempts: 0,
    };
    stored = await deps.store.append(lead);
  } catch (e) {
    log('store_append_failed', { message: (e as Error).message });
    return fail(503, 'storage_failed');
  }

  let delivered = false;
  try {
    await deps.notifier.notify(lead, render ?? undefined);
    delivered = true;
  } catch (e) {
    log('telegram_failed', { id: lead.id, message: (e as Error).message });
  }
  // a failed bookkeeping write leaves the row "pending": the cron then retries it later
  await deps.store
    .updateTelegram(stored.ref, delivered ? 'sent' : 'failed', 1)
    .catch((err: Error) => log('store_update_failed', { id: lead.id, message: err.message }));
  return json(200, { id: lead.id, status: 'submitted' });
}
