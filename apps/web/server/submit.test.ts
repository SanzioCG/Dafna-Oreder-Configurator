// @vitest-environment node
import { defaultParams, wardrobeTemplate } from '@dafna/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SubmitRequest } from '../src/lead/api';
import { HEADERS, leadToRow, rowToLead } from './columns';
import { ID_RE, makeApplicationId, parseTashkentTimestamp, tashkentTimestamp } from './ids';
import { FakeNotifier, MemoryLeadStore } from './memory';
import { RateLimiter } from './rateLimit';
import { retryNotifications } from './retry';
import { handleSubmit, type SubmitDeps } from './submit';
import { MAX_TELEGRAM_ATTEMPTS } from './types';

/** 1×1 transparent PNG */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const NOW = new Date('2026-11-05T09:03:12Z'); // 14:03:12 in Tashkent

function body(over: Partial<SubmitRequest> = {}): SubmitRequest {
  return {
    idempotencyKey: '7f0c2a4e-1b2d-4c3e-9f8a-0123456789ab',
    params: defaultParams(wardrobeTemplate),
    contact: { firstName: 'Aziz', lastName: "G'ulomov", phone: '901234567', consent: true },
    lang: 'uz',
    kioskId: 'chilonzor-1',
    ...over,
  };
}

const post = (b: unknown, headers: Record<string, string> = {}) =>
  new Request('https://kiosk.test/api/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1', ...headers },
    body: typeof b === 'string' ? b : JSON.stringify(b),
  });

let store: MemoryLeadStore;
let notifier: FakeNotifier;
let deps: SubmitDeps;

beforeEach(() => {
  store = new MemoryLeadStore();
  notifier = new FakeNotifier();
  deps = {
    store,
    notifier,
    now: () => NOW,
    ipLimiter: new RateLimiter(100, 60_000),
    kioskLimiter: new RateLimiter(100, 60_000),
    engineVersion: 'abc1234',
  };
});

/** loose view of the API JSON for assertions */
type ApiJson = {
  id: string;
  status: string;
  error: { code: string; fields: string[]; issues: string[] };
};

async function send(b: unknown, d: SubmitDeps = deps) {
  const res = await handleSubmit(post(b), d);
  return { status: res.status, json: (await res.json()) as ApiJson };
}

describe('application ID', () => {
  it('DFN-YYMMDD-XXXX, Tashkent date, unambiguous alphabet, stable per key', () => {
    const id = makeApplicationId('key-1234567890abcdef', NOW);
    expect(id).toMatch(ID_RE);
    expect(id.startsWith('DFN-261105-')).toBe(true);
    expect(id.slice(-4)).not.toMatch(/[01IO]/);
    expect(makeApplicationId('key-1234567890abcdef', NOW)).toBe(id);
    expect(makeApplicationId('key-1234567890abcdeX', NOW)).not.toBe(id);
    expect(makeApplicationId('key-1234567890abcdef', NOW, 1)).not.toBe(id);
  });

  it('not sequential: 200 keys give 200 distinct, unordered suffixes', () => {
    const ids = Array.from({ length: 200 }, (_, i) =>
      makeApplicationId(`k-${i}-0123456789abcdef`, NOW),
    );
    expect(new Set(ids).size).toBeGreaterThan(195);
    expect([...ids].sort()).not.toEqual(ids);
  });

  it('date rolls over at Tashkent midnight (UTC+5)', () => {
    expect(makeApplicationId('k-0123456789abcdef', new Date('2026-11-05T18:59:59Z'))).toContain(
      '-261105-',
    );
    expect(makeApplicationId('k-0123456789abcdef', new Date('2026-11-05T19:00:00Z'))).toContain(
      '-261106-',
    );
    expect(tashkentTimestamp(NOW)).toBe('2026-11-05 14:03:12');
    expect(parseTashkentTimestamp('2026-11-05 14:03:12').toISOString()).toBe(NOW.toISOString());
  });
});

describe('sheet row mapping', () => {
  it('columns in the approved order, technical columns last', () => {
    expect(HEADERS).toEqual([
      'ID',
      'Sana (Asia/Tashkent)',
      'Holat',
      'Ism',
      'Familiya',
      'Telefon',
      "O'lcham W×H×D mm",
      'Korpus',
      'Eshik',
      'Qismlar + ichki',
      'Eshiklar',
      'Filial/Kiosk',
      'Til',
      'Telegram holati',
      'Menejer izohi',
      'params JSON',
      'schemaVersion',
      'templateVersion',
      'engineVersion',
      'idempotencyKey',
      'Telegram urinishlar',
    ]);
  });

  it('a stored lead maps to that row and back', async () => {
    await send(body());
    const lead = store.rows[0]!;
    const row = leadToRow(lead);
    expect(row[0]).toBe(lead.id);
    expect(row[1]).toBe('2026-11-05 14:03:12');
    expect(row[2]).toBe('Yangi');
    expect(row[3]).toBe('Aziz');
    expect(row[4]).toBe("G'ulomov");
    expect(row[5]).toBe('+998901234567');
    expect(row[6]).toBe('1360 × 1900 × 600');
    expect(row[7]).toBe('Oq');
    expect(row[11]).toBe('chilonzor-1');
    expect(row[14]).toBe(''); // manager note starts empty
    expect(JSON.parse(String(row[15]))).toEqual(defaultParams(wardrobeTemplate));
    expect(row[16]).toBe('dafna-order/0.3-draft');
    expect(row[17]).toBe(wardrobeTemplate.templateVersion);
    expect(row[18]).toBe('abc1234');
    expect({ ...rowToLead(row), ref: lead.ref }).toEqual(lead);
  });
});

describe('POST /api/submit', () => {
  it('persists first, then notifies; returns the real ID', async () => {
    const { status, json } = await send(body({ renderPng: PNG }));
    expect(status).toBe(200);
    expect(json.status).toBe('submitted');
    expect(json.id).toMatch(ID_RE);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]!.id).toBe(json.id);
    expect(store.rows[0]!.telegram).toBe('sent');
    expect(store.rows[0]!.telegramAttempts).toBe(1);
    expect(notifier.sent[0]!.lead.id).toBe(json.id);
    expect(notifier.sent[0]!.png?.[1]).toBe(0x50); // the PNG reached the notifier
  });

  it('idempotency: the same key twice -> the same ID, one row, one notification', async () => {
    const a = await send(body());
    const b = await send(body());
    expect(b.status).toBe(200);
    expect(b.json.id).toBe(a.json.id);
    expect(store.rows).toHaveLength(1);
    expect(notifier.calls).toBe(1);
  });

  it('a new key -> a new application', async () => {
    const a = await send(body());
    const b = await send(body({ idempotencyKey: '11111111-2222-4333-8444-555555555555' }));
    expect(b.json.id).not.toBe(a.json.id);
    expect(store.rows).toHaveLength(2);
  });

  it('ID collision on the same day is re-derived', async () => {
    const key = body().idempotencyKey;
    await store.append({
      ...(await prefill()),
      id: makeApplicationId(key, NOW),
      idempotencyKey: 'other-key-0123456789',
    });
    const { json } = await send(body());
    expect(json.id).toBe(makeApplicationId(key, NOW, 1));
  });

  it('Telegram failure: the customer still gets success, the row is marked failed', async () => {
    notifier.failing = true;
    const { status, json } = await send(body());
    expect(status).toBe(200);
    expect(json.id).toMatch(ID_RE);
    expect(store.rows[0]!.telegram).toBe('failed');
    expect(store.rows[0]!.telegramAttempts).toBe(1);
  });

  it('storage failure -> 503 storage_failed, nothing notified', async () => {
    store.failAppend = true;
    const { status, json } = await send(body());
    expect(status).toBe(503);
    expect(json.error.code).toBe('storage_failed');
    expect(notifier.calls).toBe(0);
  });

  it('re-validates the configuration with the engine', async () => {
    const tooWide = await send(
      body({ params: { ...defaultParams(wardrobeTemplate), width: 99999 } }),
    );
    expect(tooWide.status).toBe(422);
    expect(tooWide.json.error.code).toBe('invalid_configuration');
    expect(tooWide.json.error.issues.length).toBeGreaterThan(0);
    const unknown = await send(body({ params: { ...defaultParams(wardrobeTemplate), hack: 1 } }));
    expect(unknown.json.error.code).toBe('invalid_configuration');
    expect(unknown.json.error.issues).toContain('UNKNOWN_PARAM');
    // a customer-blocking warning (1 section across 2400 mm: shelves would sag)
    const sag = await send(
      body({ params: { ...defaultParams(wardrobeTemplate), width: 2400, sections: 1 } }),
    );
    expect(sag.json.error.code).toBe('invalid_configuration');
    expect(store.rows).toHaveLength(0);
  });

  it('contact: phone must be 9 digits, consent required, name required', async () => {
    const r = await send(
      body({ contact: { firstName: ' ', phone: '90123', consent: false } as never }),
    );
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe('invalid_contact');
    expect(r.json.error.fields).toEqual(['firstName', 'phone', 'consent']);
    const letters = await send(
      body({ contact: { firstName: 'Aziz', phone: '90123456a', consent: true } }),
    );
    expect(letters.json.error.fields).toEqual(['phone']);
    expect(store.rows).toHaveLength(0);
  });

  it('request shape, honeypot, JSON, size, render, method', async () => {
    expect((await send(body({ idempotencyKey: 'short' }))).json.error.fields).toEqual([
      'idempotencyKey',
    ]);
    expect((await send(body({ lang: 'en' as never }))).json.error.fields).toEqual(['lang']);
    expect((await send(body({ website: 'http://spam' }))).json.error.code).toBe('rejected');
    expect((await send('{not json')).json.error.code).toBe('invalid_json');
    expect(
      (await send(body({ renderPng: 'data:image/jpeg;base64,AAAA' }))).json.error.fields,
    ).toEqual(['renderPng']);
    const huge = await send(body({ renderPng: PNG + 'A'.repeat(3_100_000) }));
    expect(huge.status).toBe(413);
    const get = await handleSubmit(new Request('https://kiosk.test/api/submit'), deps);
    expect(get.status).toBe(405);
    expect(store.rows).toHaveLength(0);
  });

  it('rate limit per IP and per kiosk', async () => {
    const limited: SubmitDeps = { ...deps, ipLimiter: new RateLimiter(2, 60_000) };
    const keys = ['aaaaaaaaaaaaaaaa1', 'aaaaaaaaaaaaaaaa2', 'aaaaaaaaaaaaaaaa3'];
    const results = [];
    for (const k of keys) results.push((await send(body({ idempotencyKey: k }), limited)).status);
    expect(results).toEqual([200, 200, 429]);
    const kiosk: SubmitDeps = { ...deps, kioskLimiter: new RateLimiter(1, 60_000) };
    expect((await send(body({ idempotencyKey: 'bbbbbbbbbbbbbbbb1' }), kiosk)).status).toBe(200);
    expect((await send(body({ idempotencyKey: 'bbbbbbbbbbbbbbbb2' }), kiosk)).json.error.code).toBe(
      'rate_limited',
    );
  });

  it('logs never contain contact data', async () => {
    const lines: string[] = [];
    notifier.failing = true;
    await send(body(), { ...deps, log: (e, d) => lines.push(JSON.stringify({ e, d })) });
    expect(lines.join('\n')).not.toMatch(/Aziz|901234567/);
  });
});

describe('cron retry of failed Telegram notifications', () => {
  it('a failed notification is re-sent and marked sent', async () => {
    notifier.failing = true;
    await send(body());
    notifier.failing = false;
    const report = await retryNotifications(store, notifier);
    expect(report).toEqual({ checked: 1, sent: 1, failed: 0 });
    expect(store.rows[0]!.telegram).toBe('sent');
    expect(store.rows[0]!.telegramAttempts).toBe(2);
    expect(await retryNotifications(store, notifier)).toEqual({ checked: 0, sent: 0, failed: 0 });
  });

  it(`gives up after ${MAX_TELEGRAM_ATTEMPTS} attempts in total`, async () => {
    notifier.failing = true;
    await send(body());
    for (let i = 0; i < 10; i++) await retryNotifications(store, notifier);
    expect(store.rows[0]!.telegramAttempts).toBe(MAX_TELEGRAM_ATTEMPTS);
    expect(store.rows[0]!.telegram).toBe('failed');
    expect(notifier.calls).toBe(MAX_TELEGRAM_ATTEMPTS);
  });
});

async function prefill() {
  const s = new MemoryLeadStore();
  await handleSubmit(post(body({ idempotencyKey: 'prefill-0123456789ab' })), { ...deps, store: s });
  return { ...s.rows[0]!, ref: undefined };
}
