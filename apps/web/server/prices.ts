import {
  PRODUCT_ARCHIVE,
  catalogForTemplate,
  computeBom,
  computePrice,
  generate,
  priceListDemo,
  sheetCounts,
  type PriceList,
  type PriceResult,
  type PriceService,
  type SheetPrice,
} from '@dafna/engine';
import { mergeCatalog, type CachedCatalog, type CatalogStore, type ErpLink } from './catalog';
import type { RateLimiter } from './rateLimit';
import type { StaffUser } from './staffAuth';

/** D-38: the signed-in staff member of a request (session cookie), or null */
export type AuthOf = (req: Request) => Promise<StaffUser | null>;

/**
 * D-19: live prices. The manager keeps the price list (sheet prices of the boards, edge band,
 * hardware, labour, assembly, profit %) on the manager page; it is stored in the Google Sheet
 * (tab "Narxlar"). The price is computed HERE, never in the kiosk: a customer only ever
 * receives the final number, the costs and the profit % stay on the server. Staff (consultant
 * PIN) and the manager also receive the breakdown.
 *
 *   POST /api/quote    {templateId, templateVersion, params} -> {total, currency, demo, …}
 *   GET  /api/manager  (x-manager-pin) -> {list, updatedAt}
 *   PUT  /api/manager  (x-manager-pin) {list} -> {ok, list}
 *
 * Until the manager saves a list the DEMO list is used and every price is marked "sinov narxi".
 */
export interface PriceStore {
  /** null: nothing saved yet */
  load(): Promise<{ list: PriceList; updatedAt: string } | null>;
  save(list: PriceList, updatedAt: string): Promise<void>;
}

export class MemoryPriceStore implements PriceStore {
  saved: { list: PriceList; updatedAt: string } | null = null;
  async load() {
    return this.saved;
  }
  async save(list: PriceList, updatedAt: string) {
    this.saved = { list, updatedAt };
  }
}

/** Keeps the loaded list for `ttlMs` per warm instance (the sheet is read at most that often). */
export class CachedPrices {
  private cached: { list: PriceList; updatedAt: string | null; at: number } | null = null;
  constructor(
    private readonly store: PriceStore,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async get(): Promise<{ list: PriceList; updatedAt: string | null }> {
    const t = this.now();
    if (this.cached && t - this.cached.at < this.ttlMs) return this.cached;
    const saved = await this.store.load();
    this.cached = {
      list: saved?.list ?? priceListDemo,
      updatedAt: saved?.updatedAt ?? null,
      at: t,
    };
    return this.cached;
  }

  /** after a save: this instance uses the new list at once (others within ttlMs) */
  set(list: PriceList, updatedAt: string) {
    this.cached = { list, updatedAt, at: this.now() };
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip'))?.trim() || 'unknown';
}

/** What a customer receives: the final number only. */
export interface Quote {
  total: number;
  currency: string;
  demo: boolean;
  priceListVersion: string;
  /** staff / manager only */
  breakdown?: PriceResult;
}

export interface QuoteDeps {
  prices: CachedPrices;
  /** D-38: a signed-in staff member gets the breakdown */
  auth?: AuthOf;
  /** dev server only: the breakdown without signing in */
  breakdownWithoutPin?: boolean;
  /** D-20: materials / hardware added on the manager page */
  catalog?: CachedCatalog;
}

const MAX_BODY = 20_000;

export async function handleQuote(req: Request, deps: QuoteDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: { code: 'method_not_allowed' } });
  let body: { templateId?: unknown; templateVersion?: unknown; params?: unknown };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return json(413, { error: { code: 'too_large' } });
    body = JSON.parse(text) as typeof body;
  } catch {
    return json(400, { error: { code: 'invalid_request' } });
  }
  const { templateId, templateVersion } = body;
  const versions =
    typeof templateId === 'string' && Object.hasOwn(PRODUCT_ARCHIVE, templateId)
      ? PRODUCT_ARCHIVE[templateId]
      : undefined;
  const template =
    versions && typeof templateVersion === 'string' && Object.hasOwn(versions, templateVersion)
      ? versions[templateVersion]
      : undefined;
  if (!template || typeof body.params !== 'object' || body.params === null)
    return json(400, { error: { code: 'invalid_request' } });

  await deps.catalog?.get();
  const { list } = await deps.prices.get();
  const params = body.params as Record<string, unknown>;
  const result = generate(template, params);
  const catalog = catalogForTemplate(template);
  const price = computePrice(
    computeBom(template, params as never, result),
    catalog,
    list,
    template.productType,
    // D-48: the raskroy (used when the list bills boards by the whole sheet)
    list.boardBilling === 'sheets' ? sheetCounts(result, list, catalog) : undefined,
  );
  const quote: Quote = {
    total: price.total,
    currency: price.currency,
    demo: price.demo,
    priceListVersion: price.priceListVersion,
  };
  const staff = deps.breakdownWithoutPin || (deps.auth ? (await deps.auth(req)) !== null : false);
  if (staff) quote.breakdown = price;
  return json(200, quote);
}

/** Checks a price list sent by the manager page; returns it cleaned, or the first problem. */
export function parsePriceList(
  raw: unknown,
  version: string,
): { ok: true; list: PriceList } | { ok: false; field: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, field: 'list' };
  const v = raw as Record<string, unknown>;
  const money = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 1e10;
  const record = (x: unknown, field: string): Record<string, number> | string => {
    if (x === undefined) return {};
    if (typeof x !== 'object' || x === null) return field;
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(x)) {
      if (!money(n)) return `${field}.${k}`;
      out[k] = Math.round(n as number);
    }
    return out;
  };
  const sheets: Record<string, SheetPrice> = {};
  if (v.boardSheets !== undefined) {
    if (typeof v.boardSheets !== 'object' || v.boardSheets === null)
      return { ok: false, field: 'boardSheets' };
    for (const [id, s] of Object.entries(v.boardSheets)) {
      const x = s as Partial<SheetPrice> | null;
      const size = (n: unknown) => typeof n === 'number' && n >= 500 && n <= 6000;
      if (!x || !money(x.price) || !size(x.lengthMm) || !size(x.widthMm))
        return { ok: false, field: `boardSheets.${id}` };
      sheets[id] = {
        price: Math.round(x.price!),
        lengthMm: Math.round(x.lengthMm!),
        widthMm: Math.round(x.widthMm!),
      };
    }
  }
  const hardware = record(v.hardware, 'hardware');
  if (typeof hardware === 'string') return { ok: false, field: hardware };
  const assembly = record(v.assembly, 'assembly');
  if (typeof assembly === 'string') return { ok: false, field: assembly };
  const services: PriceService[] = [];
  if (v.services !== undefined) {
    if (!Array.isArray(v.services) || v.services.length > 100)
      return { ok: false, field: 'services' };
    for (const [i, raw] of v.services.entries()) {
      const x = raw as Partial<PriceService> | null;
      const name = typeof x?.name === 'string' ? x.name.trim().slice(0, 80) : '';
      const okBasis = ['m2', 'edge_m', 'product', 'pct', 'manual_m'].includes(String(x?.basis));
      const products = Array.isArray(x?.products)
        ? x.products.filter((p): p is string => typeof p === 'string' && /^[a-z]+$/.test(p))
        : [];
      if (!x || !name || !okBasis || !money(x.price) || (x.basis === 'pct' && x.price! > 100))
        return { ok: false, field: `services.${i}` };
      const id = typeof x.id === 'string' && /^s_[a-z0-9_]{1,20}$/.test(x.id) ? x.id : `s_${i + 1}`;
      services.push({ id, name, basis: x.basis!, products, price: Math.round(x.price!) });
    }
    // ids unique (a new row may reuse a free number)
    const seen = new Set<string>();
    for (const sv of services) {
      let n = 1;
      while (seen.has(sv.id)) sv.id = `s_${n++}`;
      seen.add(sv.id);
    }
  }
  const erpCodes: Record<string, string> = {};
  if (v.erpCodes !== undefined) {
    if (typeof v.erpCodes !== 'object' || v.erpCodes === null)
      return { ok: false, field: 'erpCodes' };
    for (const [id, code] of Object.entries(v.erpCodes)) {
      if (typeof code !== 'string' || code.length > 60)
        return { ok: false, field: `erpCodes.${id}` };
      if (code.trim()) erpCodes[id] = code.trim();
    }
  }
  // D-32: the manager's group of each top 1C kind
  const erpKindGroups: Record<string, 'material' | 'hardware' | 'other'> = {};
  if (v.erpKindGroups !== undefined) {
    if (typeof v.erpKindGroups !== 'object' || v.erpKindGroups === null)
      return { ok: false, field: 'erpKindGroups' };
    const entries = Object.entries(v.erpKindGroups);
    if (entries.length > 300) return { ok: false, field: 'erpKindGroups' };
    for (const [key, g] of entries) {
      if (!/^[0-9a-f-]{36}$/i.test(key) || !['material', 'hardware', 'other'].includes(String(g)))
        return { ok: false, field: `erpKindGroups.${key}` };
      erpKindGroups[key] = g as 'material' | 'hardware' | 'other';
    }
  }
  for (const k of ['edgePerM', 'laborPerM2'] as const)
    if (!money(v[k])) return { ok: false, field: k };
  const markup = v.markupPct;
  if (typeof markup !== 'number' || !(markup >= 0 && markup <= 300))
    return { ok: false, field: 'markupPct' };
  // D-48: how a board is charged; the waste of the area billing (absent = the demo's)
  if (v.boardBilling !== undefined && v.boardBilling !== 'area' && v.boardBilling !== 'sheets')
    return { ok: false, field: 'boardBilling' };
  const waste = v.wasteFactor ?? priceListDemo.wasteFactor;
  if (typeof waste !== 'number' || !(waste >= 1 && waste <= 2))
    return { ok: false, field: 'wasteFactor' };
  return {
    ok: true,
    list: {
      ...priceListDemo,
      priceListVersion: version,
      demo: false,
      boardSheets: sheets,
      hardware: { ...priceListDemo.hardware, ...hardware },
      assembly,
      services,
      erpCodes,
      erpKindGroups,
      edgePerM: Math.round(v.edgePerM as number),
      laborPerM2: Math.round(v.laborPerM2 as number),
      markupPct: markup,
      wasteFactor: Math.round(waste * 1000) / 1000,
      boardBilling: v.boardBilling === 'sheets' ? 'sheets' : 'area',
    },
  };
}

export interface ManagerDeps {
  store: PriceStore;
  prices: CachedPrices;
  /** D-38: the signed-in staff member (admin / manager) */
  auth: AuthOf;
  limiter: RateLimiter;
  now: () => Date;
  /** D-20: the catalog extension (append-only) */
  catalogStore?: CatalogStore;
  catalog?: CachedCatalog;
  /** D-21: stores a decor photo, returns its public URL; undefined = no storage configured */
  putTexture?: (name: string, body: ArrayBuffer, contentType: string) => Promise<string>;
  /** dev server only: decor photos as data URLs */
  allowDataUrls?: boolean;
}

/** D-21: decor photos the manager may upload (the page shrinks them to ≤ 2048 px first) */
export const TEXTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const TEXTURE_MAX_BYTES = 3 * 1024 * 1024;

/** "2026-11-23 14:05" (Asia/Tashkent, UTC+5) */
export function tashkentMinute(d: Date): string {
  return new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
}

export async function handleManager(req: Request, deps: ManagerDeps): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'POST')
    return json(405, { error: { code: 'method_not_allowed' } });
  if (!deps.limiter.take(clientIp(req))) return json(429, { error: { code: 'rate_limited' } });
  if (!(await deps.auth(req))) return json(401, { error: { code: 'unauthorized' } });

  if (req.method === 'POST') {
    // D-21: POST /api/manager (x-material-id, image body) -> {url}; saved with the catalog later
    if (!deps.putTexture) return json(503, { error: { code: 'storage_not_configured' } });
    const id = req.headers.get('x-material-id') ?? '';
    const type = (req.headers.get('content-type') ?? '').split(';')[0]!.trim();
    if (!/^[a-z0-9_]{1,40}$/.test(id) || !TEXTURE_TYPES.includes(type))
      return json(400, { error: { code: 'invalid_texture' } });
    const body = await req.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > TEXTURE_MAX_BYTES)
      return json(413, { error: { code: 'too_large' } });
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    const url = await deps.putTexture(`textures/${id}.${ext}`, body, type);
    return json(200, { ok: true, url });
  }
  if (req.method === 'GET') {
    const catalog = await deps.catalog?.get();
    const { list, updatedAt } = await deps.prices.get();
    return json(200, { list, updatedAt, catalog });
  }
  let body: { list?: unknown; catalog?: unknown };
  try {
    const text = await req.text();
    if (text.length > (deps.allowDataUrls ? 30_000_000 : MAX_BODY * 5))
      return json(413, { error: { code: 'too_large' } });
    body = JSON.parse(text) as typeof body;
  } catch {
    return json(400, { error: { code: 'invalid_request' } });
  }
  // D-20: the catalog first (append-only merge on the stored one), then the prices
  let catalog = deps.catalog ? await deps.catalog.get() : undefined;
  let links: ErpLink[] = [];
  if (body.catalog !== undefined) {
    if (!deps.catalogStore || !deps.catalog)
      return json(503, { error: { code: 'not_configured' } });
    const merged = mergeCatalog(await deps.catalogStore.load(), body.catalog, {
      allowDataUrls: deps.allowDataUrls,
    });
    if (!merged.ok) return json(400, { error: { code: 'invalid_catalog', field: merged.field } });
    await deps.catalogStore.save(merged.ext);
    deps.catalog.set(merged.ext);
    catalog = merged.ext;
    links = merged.links;
  }
  if (body.list === undefined) {
    const { list, updatedAt } = await deps.prices.get();
    return json(200, { ok: true, list, updatedAt, catalog });
  }
  const updatedAt = tashkentMinute(deps.now());
  const parsed = parsePriceList(body.list, `live-${updatedAt}`);
  if (!parsed.ok) return json(400, { error: { code: 'invalid_price', field: parsed.field } });
  // D-31: an item just taken from 1C keeps its 1C article and price under its new id
  for (const l of links) {
    parsed.list.erpCodes = { ...parsed.list.erpCodes, [l.id]: l.article };
    if (l.price === undefined) continue;
    if (l.kind === 'hardware') parsed.list.hardware[l.id] = l.price;
    else if (l.sheet)
      parsed.list.boardSheets = {
        ...parsed.list.boardSheets,
        [l.id]: { price: l.price, lengthMm: l.sheet.lengthMm, widthMm: l.sheet.widthMm },
      };
  }
  await deps.store.save(parsed.list, updatedAt);
  deps.prices.set(parsed.list, updatedAt);
  return json(200, { ok: true, list: parsed.list, updatedAt, catalog });
}
