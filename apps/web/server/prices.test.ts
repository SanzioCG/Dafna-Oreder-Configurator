// @vitest-environment node
import { defaultParams, priceListDemo, wardrobeTemplate as W } from '@dafna/engine';
import { describe, expect, it } from 'vitest';
import { priceListToRows, rowsToPriceList } from './priceSheet';
import {
  CachedPrices,
  MemoryPriceStore,
  handleManager,
  handleQuote,
  parsePriceList,
  type ManagerDeps,
  type QuoteDeps,
} from './prices';
import { RateLimiter } from './rateLimit';

const quoteReq = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://x/api/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const wardrobe = {
  templateId: 'wardrobe',
  templateVersion: W.templateVersion,
  params: defaultParams(W),
};

function setup() {
  const store = new MemoryPriceStore();
  const prices = new CachedPrices(store, 0);
  const quote: QuoteDeps = { prices, staffPin: '2580', managerPin: '9137' };
  const manager: ManagerDeps = {
    store,
    prices,
    managerPin: '9137',
    limiter: new RateLimiter(100, 60_000),
    now: () => new Date('2026-11-23T09:05:00Z'),
  };
  return { store, prices, quote, manager };
}

const managerReq = (method: string, pin: string | null, body?: unknown) =>
  new Request('http://x/api/manager', {
    method,
    headers: { 'content-type': 'application/json', ...(pin ? { 'x-manager-pin': pin } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const live = {
  markupPct: 25,
  laborPerM2: 40000,
  edgePerM: 4000,
  assembly: { wardrobe: 300000, pedestal: 100000, desk: 150000 },
  hardware: { hinge_strax: 15000 },
  boardSheets: { ldsp_white_16: { price: 579600, lengthMm: 2800, widthMm: 2070 } },
};

interface QuoteBody {
  total: number;
  demo: boolean;
  breakdown?: { assembly: number; markup: number; subtotal: number };
}

describe('D-19 /api/quote: the price is computed on the server', () => {
  it('a customer gets the final number only: no costs, no profit %', async () => {
    const { quote } = setup();
    const res = await handleQuote(quoteReq(wardrobe), quote);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['currency', 'demo', 'priceListVersion', 'total']);
    expect(body.total).toBeGreaterThan(0);
    expect(body.demo).toBe(true); // nothing saved yet: the DEMO list
  });

  it('staff (consultant PIN) and the manager get the breakdown; a wrong PIN does not', async () => {
    const { quote } = setup();
    const get = async (h: Record<string, string>) =>
      (await (await handleQuote(quoteReq(wardrobe, h), quote)).json()) as QuoteBody;
    expect((await get({ 'x-staff-pin': '2580' })).breakdown).toBeTruthy();
    expect((await get({ 'x-manager-pin': '9137' })).breakdown).toBeTruthy();
    expect((await get({ 'x-staff-pin': '1111' })).breakdown).toBeUndefined();
  });

  it('unknown product / version / prototype keys -> 400; GET -> 405', async () => {
    const { quote } = setup();
    for (const body of [
      { ...wardrobe, templateId: 'sofa' },
      { ...wardrobe, templateVersion: '9.9.9' },
      { ...wardrobe, templateId: '__proto__' },
      { ...wardrobe, templateVersion: 'constructor' },
      { ...wardrobe, params: null },
    ])
      expect((await handleQuote(quoteReq(body), quote)).status).toBe(400);
    expect((await handleQuote(new Request('http://x/api/quote'), quote)).status).toBe(405);
  });
});

describe('D-19 /api/manager: the price list behind MANAGER_PIN', () => {
  it('not configured -> 503; no / wrong PIN -> 401', async () => {
    const { manager } = setup();
    const off = { ...manager, managerPin: undefined };
    expect((await handleManager(managerReq('GET', '9137'), off)).status).toBe(503);
    expect((await handleManager(managerReq('GET', null), manager)).status).toBe(401);
    expect((await handleManager(managerReq('GET', '1234'), manager)).status).toBe(401);
  });

  it('saves the list; the kiosk price follows it at once and is no longer DEMO', async () => {
    const { manager, quote, store } = setup();
    const before = (await (await handleQuote(quoteReq(wardrobe), quote)).json()) as QuoteBody;
    const res = await handleManager(managerReq('PUT', '9137', { list: live }), manager);
    expect(res.status).toBe(200);
    expect(store.saved?.updatedAt).toBe('2026-11-23 14:05');
    expect(store.saved?.list.priceListVersion).toBe('live-2026-11-23 14:05');
    const after = (await (
      await handleQuote(quoteReq(wardrobe, { 'x-manager-pin': '9137' }), quote)
    ).json()) as QuoteBody;
    expect(after.demo).toBe(false);
    expect(after.total).not.toBe(before.total);
    expect(after.breakdown?.assembly).toBe(300000);
    expect(after.breakdown?.markup).toBe(Math.round((after.breakdown?.subtotal ?? 0) * 0.25));
    const got = (await (await handleManager(managerReq('GET', '9137'), manager)).json()) as {
      list: { markupPct: number };
      updatedAt: string;
    };
    expect([got.list.markupPct, got.updatedAt]).toEqual([25, '2026-11-23 14:05']);
  });

  it('a bad value is refused with its field, nothing is saved', async () => {
    const { manager, store } = setup();
    const cases: [unknown, string][] = [
      [{ ...live, markupPct: -5 }, 'markupPct'],
      [{ ...live, edgePerM: 'abc' }, 'edgePerM'],
      [{ ...live, hardware: { hinge_strax: -1 } }, 'hardware.hinge_strax'],
      [
        { ...live, boardSheets: { x: { price: 10, lengthMm: 10, widthMm: 2070 } } },
        'boardSheets.x',
      ],
    ];
    for (const [list, field] of cases) {
      const res = await handleManager(managerReq('PUT', '9137', { list }), manager);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { field: string } }).error.field).toBe(field);
    }
    expect(store.saved).toBeNull();
  });

  it('rate limited per IP', async () => {
    const { manager } = setup();
    const m = { ...manager, limiter: new RateLimiter(2, 60_000) };
    await handleManager(managerReq('GET', '0000'), m);
    await handleManager(managerReq('GET', '0000'), m);
    expect((await handleManager(managerReq('GET', '9137'), m)).status).toBe(429);
  });
});

describe('D-19 "Narxlar" sheet tab', () => {
  it('rows round-trip the list; an empty tab means nothing saved', () => {
    const parsed = parsePriceList(live, 'live-2026-11-23 14:05');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const rows = priceListToRows(parsed.list, '2026-11-23 14:05');
    expect(rows[0]).toEqual([
      'Turi',
      'Kod',
      'Nomi',
      "Narx (so'm)",
      'Varaq uzunligi (mm)',
      'Varaq eni (mm)',
    ]);
    expect(rows.find((r) => r[1] === 'ldsp_white_16')?.[2]).toContain('16 mm');
    // the sheet may hand numbers back as text with spaces ("579 600")
    const asText = rows.map((r) =>
      r.map((c) => (typeof c === 'number' ? c.toLocaleString('ru-RU') : c)),
    );
    expect(rowsToPriceList(asText)).toEqual({ list: parsed.list, updatedAt: '2026-11-23 14:05' });
    expect(rowsToPriceList([])).toBeNull();
    expect(rowsToPriceList([rows[0]!])).toBeNull();
  });

  it('the cache reads the store once per TTL', async () => {
    const store = new MemoryPriceStore();
    let loads = 0;
    const counting = {
      load: () => {
        loads++;
        return store.load();
      },
      save: store.save.bind(store),
    };
    let t = 0;
    const cache = new CachedPrices(counting, 60_000, () => t);
    expect((await cache.get()).list).toBe(priceListDemo);
    await cache.get();
    t = 61_000;
    await cache.get();
    expect(loads).toBe(2);
  });
});
