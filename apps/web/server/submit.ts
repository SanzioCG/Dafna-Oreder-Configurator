import {
  ORDER_SCHEMA_VERSION,
  PRODUCT_TEMPLATES,
  generate,
  resolveParams,
  type Template,
} from '@dafna/engine';
import {
  MAX_ORDER_ITEMS,
  MAX_QUANTITY,
  type SubmitErrorCode,
  type SubmitRequest,
} from '../src/lead/api';
import { cleanContact, validateContact, type ContactInput } from '../src/lead/contact';
import { phoneE164 } from '../src/lead/phone';
import { summarizeResult } from '../src/lead/summary';
import { isCustomerBlocking } from '../src/state/blocking';
import { assemblyPath } from './assemblyLink';
import { makeApplicationId, tashkentTimestamp } from './ids';
import type { RateLimiter } from './rateLimit';
import type { LeadRecord, LeadStore, Notifier } from './types';

/** Whole request body (JSON incl. the base64 renders). Vercel's own limit is 4.5 MB. */
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
  /** D-12: HMAC key of the assembly-instructions link (absent = no link in the answer) */
  linkSecret?: string;
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

/** "Kulrang tosh (EGGER U727 ST9)"; Dafna boards without a supplier code stay as they are */
const withCode = (name: string, code: string | null) => (code ? `${name} (${code})` : name);

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

interface OrderItem {
  template: Template;
  params: unknown;
  quantity: number;
  render?: Uint8Array;
}

/**
 * The products of the request: `items` (D-25, several products in one order) or the single
 * product / params / renderPng of older kiosks (D-8: no product = wardrobe). Invalid fields are
 * collected in `bad` ("items.1.params", or "params" for the single form).
 */
function readItems(b: Record<string, unknown>, bad: string[]): OrderItem[] {
  const multi = b.items !== undefined;
  const raw: unknown[] = multi
    ? Array.isArray(b.items)
      ? b.items
      : []
    : [{ product: b.product ?? 'wardrobe', params: b.params, renderPng: b.renderPng }];
  if (raw.length === 0 || raw.length > MAX_ORDER_ITEMS) bad.push('items');
  const out: OrderItem[] = [];
  raw.slice(0, MAX_ORDER_ITEMS).forEach((r, i) => {
    const field = (name: string) => (multi ? `items.${i}.${name}` : name);
    const it = isObject(r) ? r : {};
    const template = PRODUCT_TEMPLATES[typeof it.product === 'string' ? it.product : ''];
    if (!template) bad.push(field('product'));
    if (!isObject(it.params) || JSON.stringify(it.params).length > MAX_PARAMS_CHARS) {
      bad.push(field('params'));
    }
    const quantity = it.quantity === undefined ? 1 : it.quantity;
    const qtyOk =
      typeof quantity === 'number' &&
      Number.isInteger(quantity) &&
      quantity >= 1 &&
      quantity <= MAX_QUANTITY;
    if (!qtyOk) bad.push(field('quantity'));
    const render = decodeRender(it.renderPng);
    if (render === null) bad.push(field('renderPng'));
    if (template && qtyOk) {
      out.push({
        template,
        params: it.params,
        quantity: quantity as number,
        ...(render ? { render } : {}),
      });
    }
  });
  return out;
}

/**
 * POST /api/submit. Order of work: cheap checks -> engine re-validation -> idempotency lookup ->
 * persist the leads (the source of truth) -> notify Telegram. A notification failure never fails
 * the request: the row is marked "failed" and the cron retries it.
 * D-25: an order may hold several products (one contact). Each product is its own application
 * (sheet row, ID, order sheet, GibLab file, assembly link), linked by the order ID = the first
 * product's ID and "2/3" in the row and the Telegram message.
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
  const items = readItems(b, bad);
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

  // the engine is the authority: never trust the kiosk's own validation (every product)
  const checked = items.map(({ template: tpl, params }) => {
    const resolved = resolveParams(tpl, params);
    const result = generate(tpl, params);
    const blocking = [...resolved.issues, ...result.issues].filter(
      (i) => isCustomerBlocking(i) || i.code === 'UNKNOWN_PARAM',
    );
    // D-7: a kiosk application uses the standard sizes only (staff build custom sizes elsewhere)
    const nonStandard = tpl.parameters.filter(
      (d) => d.customerValues && !d.customerValues.includes(Number(resolved.params[d.key])),
    );
    const codes = [
      ...blocking.map((i) => i.code),
      ...(nonStandard.length > 0 ? ['NON_STANDARD_SIZE'] : []),
    ];
    return { resolved, result, codes };
  });
  if (checked.some((c) => c.codes.length > 0 || !c.result.dimensions)) {
    return fail(422, 'invalid_configuration', {
      issues: [...new Set(checked.flatMap((c) => c.codes))],
    });
  }

  // one idempotency key per product: the request's key, then key~2, key~3, …
  const key = b.idempotencyKey as string;
  const itemKey = (i: number) => (i === 0 ? key : `${key}~${i + 1}`);
  const ok = (ids: string[]) => {
    const secret = deps.linkSecret;
    const paths = secret ? ids.map((id) => assemblyPath(id, secret)) : [];
    return json(200, {
      id: ids[0],
      status: 'submitted',
      ...(paths[0] ? { assemblyPath: paths[0] } : {}),
      ...(ids.length > 1 ? { ids, ...(paths.length > 0 ? { assemblyPaths: paths } : {}) } : {}),
    });
  };
  // a resend (same key) finds the products stored before and only stores the missing ones
  const known: (string | null)[] = [];
  try {
    for (let i = 0; i < items.length; i++) {
      known.push((await deps.store.findByKey(itemKey(i)))?.id ?? null);
    }
  } catch (e) {
    log('store_lookup_failed', { message: (e as Error).message });
    return fail(503, 'storage_failed');
  }
  if (known.every((id) => id !== null)) return ok(known as string[]);

  const now = deps.now();
  const multi = items.length > 1;
  const ids: (string | null)[] = [...known];
  const saved: { lead: LeadRecord; ref: number; render?: Uint8Array }[] = [];
  let storeFailed = false;
  try {
    let orderId = known[0] ?? '';
    for (let i = 0; i < items.length; i++) {
      if (known[i] !== null) continue;
      const { template: tpl, quantity, render } = items[i]!;
      const { resolved, result } = checked[i]!;
      const summary = summarizeResult(resolved.params, result, 'uz', tpl);
      let id = makeApplicationId(itemKey(i), now);
      for (let salt = 1; (await deps.store.hasId(id)) && salt <= 5; salt++) {
        id = makeApplicationId(itemKey(i), now, salt);
      }
      if (i === 0) orderId = id;
      const lead: LeadRecord = {
        id,
        createdAt: tashkentTimestamp(now),
        status: 'Yangi',
        firstName: contact.firstName,
        lastName: contact.lastName ?? '',
        phone: phoneE164(contact.phone),
        sizeMm: summary.sizeMm,
        // manager / production need the supplier code next to the decor name
        corpus: withCode(summary.corpus, summary.corpusCode),
        door: summary.door ? withCode(summary.door, summary.doorCode) : '—',
        sections: summary.sections,
        doors: summary.doors,
        kiosk: kioskId,
        lang: b.lang as string,
        telegram: 'pending',
        managerNote: '',
        manager: '',
        assignee: '',
        paramsJson: JSON.stringify(resolved.params),
        schemaVersion: ORDER_SCHEMA_VERSION,
        templateVersion: tpl.templateVersion,
        engineVersion: deps.engineVersion,
        idempotencyKey: itemKey(i),
        telegramAttempts: 0,
        product: summary.productName,
        templateId: tpl.templateId,
        orderId: multi ? orderId : '',
        orderItem: multi ? `${i + 1}/${items.length}` : '',
        quantity,
      };
      const stored = await deps.store.append(lead);
      ids[i] = id;
      saved.push({ lead, ref: stored.ref, ...(render ? { render } : {}) });
    }
  } catch (e) {
    log('store_append_failed', { message: (e as Error).message });
    storeFailed = true;
  }
  if (saved.length === 0) return fail(503, 'storage_failed');

  for (const { lead, ref, render } of saved) {
    let delivered = false;
    try {
      await deps.notifier.notify(lead, render);
      delivered = true;
    } catch (e) {
      log('telegram_failed', { id: lead.id, message: (e as Error).message });
    }
    // a failed bookkeeping write leaves the row "pending": the cron then retries it later
    await deps.store
      .updateTelegram(ref, delivered ? 'sent' : 'failed', 1)
      .catch((err: Error) => log('store_update_failed', { id: lead.id, message: err.message }));
  }
  // some products stored, some not: the kiosk's retry (same key) stores only the missing ones
  if (storeFailed) return fail(503, 'storage_failed');
  return ok(ids as string[]);
}
