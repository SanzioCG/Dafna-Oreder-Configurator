import { pinMatches } from './prices';
import type { RateLimiter } from './rateLimit';

/**
 * D-30: Dafna's 1C (EMAN OData API, base eman_materials, read-only token) for the manager page.
 * Dafna takes only some of its 20 000 items (laminate, chipboard, some hardware), so nothing is
 * imported wholesale: the manager searches 1C, links an item of ours to a 1C article (the
 * existing "1C kodi" field), and pulls the current prices of the linked items.
 *
 *   POST /api/erp (x-manager-pin) {action: 'search', q}         -> {items: ErpItem[]}
 *   POST /api/erp (x-manager-pin) {action: 'prices', articles}  -> {prices: {article: ErpPrice}}
 *
 * Env: EMAN_1C_TOKEN (secret, Vercel only), EMAN_1C_URL (optional, default the eman_materials
 * OData root), EMAN_1C_PRICE_TYPE (optional, the price type GUID; default Dafna's retail type).
 */
export const DEFAULT_ERP_URL = 'https://api.eman.uz/api/odata/eman_materials/';
export const DEFAULT_PRICE_TYPE = '1b9d6aa5-fe2c-11ea-a9b9-505dac4282cc';

export interface ErpItem {
  key: string;
  name: string;
  article: string;
  unit: string;
  /** D-32: the item's kind path in 1C (search within a group only) */
  kind?: string;
}

export interface ErpPrice {
  name: string;
  unit: string;
  price: number | null;
  /** currency name as in 1C (e.g. "сум", "USD"); null when unknown */
  currency: string | null;
  /** free stock over all warehouses; null when 1C gave none */
  stock: number | null;
}

export interface ErpConfig {
  url: string;
  token: string;
  priceType: string;
  fetchImpl?: typeof fetch;
}

export function erpFromEnv(env: Record<string, string | undefined>): ErpConfig | null {
  const token = env.EMAN_1C_TOKEN?.trim();
  if (!token) return null;
  const url = env.EMAN_1C_URL?.trim() || DEFAULT_ERP_URL;
  const priceType = env.EMAN_1C_PRICE_TYPE?.trim() || DEFAULT_PRICE_TYPE;
  return { url: url.endsWith('/') ? url : `${url}/`, token, priceType };
}

/** an OData string literal: single quotes doubled */
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function odata<T>(cfg: ErpConfig, path: string, query: Record<string, string>): Promise<T[]> {
  return (await odataPage<T>(cfg, path, query)).value;
}

async function odataPage<T>(
  cfg: ErpConfig,
  path: string,
  query: Record<string, string>,
): Promise<{ value: T[]; count: number | null }> {
  const q = new URLSearchParams({ $format: 'json', ...query }).toString().replace(/\+/g, '%20');
  const url = `${cfg.url}${encodeURI(path)}?${q}`;
  const res = await (cfg.fetchImpl ?? fetch)(url, {
    headers: { 'X-API-TOKEN': cfg.token, accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`erp_${res.status}`);
  const data = (await res.json()) as { value?: T[]; 'odata.count'?: string };
  const count = data['odata.count'] !== undefined ? Number(data['odata.count']) : null;
  return { value: data.value ?? [], count };
}

interface RawItem {
  Ref_Key: string;
  Description?: string;
  Артикул?: string;
  ЕдиницаИзмерения?: { Description?: string };
  DeletionMark?: boolean;
  IsFolder?: boolean;
  ВидНоменклатуры_Key?: string;
}

const ITEM_SELECT =
  'Ref_Key,Description,Артикул,DeletionMark,IsFolder,ЕдиницаИзмерения/Description';

const toItem = (r: RawItem): ErpItem => ({
  key: r.Ref_Key,
  name: (r.Description ?? '').trim(),
  article: (r.Артикул ?? '').trim(),
  unit: (r.ЕдиницаИзмерения?.Description ?? '').trim(),
});

/** search by a word of the name or an exact article; folders and deleted items left out */
export async function erpSearch(
  cfg: ErpConfig,
  q: string,
  top = 30,
  only?: { group?: KindGroup; sub?: 'hinge' | 'slide'; groups?: Record<string, KindGroup> },
): Promise<ErpItem[]> {
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (words.length === 0) return [];
  const byName = words.map((w) => `substringof(${lit(w)}, Description)`).join(' and ');
  // D-32: within a group, ask for more and keep the items of that group
  const rows = await odata<RawItem>(cfg, 'Catalog_Номенклатура', {
    $filter: `(${byName}) or Артикул eq ${lit(q.trim())}`,
    $select: `${ITEM_SELECT},ВидНоменклатуры_Key`,
    $expand: 'ЕдиницаИзмерения',
    $top: String(only?.group ? 200 : top),
  });
  const tree = only?.group ? await kindTree(cfg) : null;
  const out: ErpItem[] = [];
  for (const r of rows) {
    if (r.IsFolder || r.DeletionMark) continue;
    const item = toItem(r);
    if (tree && only?.group) {
      const info = tree.info(r.ВидНоменклатуры_Key ?? '');
      item.kind = info.path;
      if (groupOf(info.top, only.groups) !== only.group) continue;
      if (only.sub && !SUB[only.sub].test(`${info.path} ${item.name}`)) continue;
    }
    out.push(item);
    if (out.length >= top) break;
  }
  return out;
}

export type KindGroup = 'material' | 'hardware' | 'other';

/**
 * D-32: the default group of a top 1C kind by its name (the manager can change any of them):
 * boards, edge bands and work tops are materials; INFINITY (Hettich, Blum, …), Yechim (Samet,
 * Camet, Mesan, Cebi, …), NUOMI and Опора are hardware; the rest (glue, lamps, services, …) other.
 */
export function defaultGroup(name: string): KindGroup {
  // (\b does not work for Cyrillic in JS)
  if (/^(infinity|yechim|nuomi|опора)(\s|$)/i.test(name.trim())) return 'hardware';
  if (
    /лдсп|лмдф|лхдф|дсп|мдф|хдф|двп|кромк|столешниц|hpl|акрил|perfect\s*sense|осп|плен|шаттдекор|термопласт|ультрадекор|frente|agt/i.test(
      name,
    )
  )
    return 'material';
  return 'other';
}

export function groupOf(
  top: { key: string; name: string } | null,
  groups: Record<string, KindGroup> = {},
): KindGroup {
  if (!top) return 'other';
  return groups[top.key] ?? defaultGroup(top.name);
}

/** D-32: hinges / slides inside the hardware group, by the kind path or the name */
const SUB = {
  hinge: /петл|hinge|sensys|intermat/i,
  slide: /направляющ|slide|quadro|actro|ящик|innotech|arcitech|avantech/i,
};

interface KindNode {
  key: string;
  name: string;
  parent: string;
}

/** D-32: the whole kind tree (about 1500 kinds), kept per warm instance for 10 minutes */
let treeCache: { at: number; url: string; nodes: Map<string, KindNode> } | null = null;

export async function kindTree(cfg: ErpConfig, now = Date.now()) {
  if (!treeCache || treeCache.url !== cfg.url || now - treeCache.at > 10 * 60_000) {
    const rows = await odata<{ Ref_Key: string; Description?: string; Parent_Key?: string }>(
      cfg,
      'Catalog_ВидыНоменклатуры',
      { $select: 'Ref_Key,Description,Parent_Key' },
    );
    treeCache = {
      at: now,
      url: cfg.url,
      nodes: new Map(
        rows.map((r) => [
          r.Ref_Key,
          { key: r.Ref_Key, name: (r.Description ?? '').trim(), parent: r.Parent_Key ?? '' },
        ]),
      ),
    };
  }
  const nodes = treeCache.nodes;
  return {
    info(key: string): { top: { key: string; name: string } | null; path: string } {
      const names: string[] = [];
      let top: KindNode | null = null;
      for (let k = key, n = 0; nodes.has(k) && n < 20; n++) {
        const node = nodes.get(k)!;
        names.unshift(node.name);
        top = node;
        k = node.parent;
      }
      return { top: top ? { key: top.key, name: top.name } : null, path: names.join(' › ') };
    },
  };
}

/** test hook */
export function resetKindTree() {
  treeCache = null;
}

const chunks = <T>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** current price, currency and free stock of each article (unknown articles are left out) */
export async function erpPrices(
  cfg: ErpConfig,
  articles: string[],
): Promise<Record<string, ErpPrice>> {
  const wanted = [...new Set(articles.map((a) => a.trim()).filter(Boolean))];
  const items = new Map<string, ErpItem>();
  for (const part of chunks(wanted, 15)) {
    const rows = await odata<RawItem>(cfg, 'Catalog_Номенклатура', {
      $filter: part.map((a) => `Артикул eq ${lit(a)}`).join(' or '),
      $select: ITEM_SELECT,
      $expand: 'ЕдиницаИзмерения',
    });
    for (const r of rows)
      if (!r.IsFolder && !r.DeletionMark && r.Артикул && !items.has(r.Артикул.trim()))
        items.set(r.Артикул.trim(), toItem(r));
  }
  const byKey = await pricesOf(cfg, [...items.values()]);
  const out: Record<string, ErpPrice> = {};
  for (const [article, item] of items) out[article] = byKey.get(item.key)!;
  return out;
}

/** D-30: price, currency and free stock of 1C items, by their key */
async function pricesOf(cfg: ErpConfig, list: ErpItem[]): Promise<Map<string, ErpPrice>> {
  const items = new Map(list.map((i) => [i.key, i]));
  const keys = [...items.keys()].filter((k) => GUID_RE.test(k));
  const price = new Map<string, { price: number; currency: string }>();
  const stock = new Map<string, number>();
  const currencies = new Map<string, string>();
  for (const part of chunks(keys, 15)) {
    const byKey = part.map((k) => `Номенклатура_Key eq guid'${k}'`).join(' or ');
    const prices = await odata<{ Номенклатура_Key: string; Цена: number; Валюта_Key: string }>(
      cfg,
      'InformationRegister_ЦеныНоменклатуры_RecordType/SliceLast()',
      {
        $filter: `ВидЦены_Key eq guid'${cfg.priceType}' and (${byKey})`,
        $select: 'Номенклатура_Key,Цена,Валюта_Key',
      },
    );
    for (const p of prices)
      price.set(p.Номенклатура_Key, { price: p.Цена, currency: p.Валюта_Key });
    const rests = await odata<{ Номенклатура_Key: string; ВНаличииBalance?: number }>(
      cfg,
      "AccumulationRegister_СвободныеОстатки/Balance(Dimensions='Номенклатура, Склад')",
      { $filter: byKey },
    );
    for (const r of rests)
      stock.set(
        r.Номенклатура_Key,
        (stock.get(r.Номенклатура_Key) ?? 0) + (r.ВНаличииBalance ?? 0),
      );
  }
  const curKeys = [...new Set([...price.values()].map((p) => p.currency))].filter((k) =>
    GUID_RE.test(k),
  );
  if (curKeys.length > 0) {
    const rows = await odata<{ Ref_Key: string; Description?: string }>(cfg, 'Catalog_Валюты', {
      $filter: curKeys.map((k) => `Ref_Key eq guid'${k}'`).join(' or '),
      $select: 'Ref_Key,Description',
    });
    for (const r of rows) currencies.set(r.Ref_Key, (r.Description ?? '').trim());
  }
  const out = new Map<string, ErpPrice>();
  for (const [key, item] of items) {
    const p = price.get(key);
    out.set(key, {
      name: item.name,
      unit: item.unit,
      price: p ? p.price : null,
      currency: p ? (currencies.get(p.currency) ?? null) : null,
      stock: stock.has(key) ? stock.get(key)! : null,
    });
  }
  return out;
}

export const ROOT_FOLDER = '00000000-0000-0000-0000-000000000000';

export interface ErpKind {
  key: string;
  name: string;
  /** a group of kinds (opens to its sub-kinds) */
  folder: boolean;
  /** D-32: top kinds only - their default group (the manager's choice is kept on the page) */
  group?: KindGroup;
}
export type ErpRow = ErpItem & Omit<ErpPrice, 'name' | 'unit'>;

/**
 * D-31: 1C groups its items by kind (ВидыНоменклатуры: ЛДСП, ЛМДФ, Кромка, …; a tree). The
 * manager browses the whole list this way and marks what the kiosk shows.
 */
export async function erpKinds(cfg: ErpConfig, parent: string): Promise<ErpKind[]> {
  const rows = await odata<{ Ref_Key: string; Description?: string; IsFolder?: boolean }>(
    cfg,
    'Catalog_ВидыНоменклатуры',
    {
      $filter: `Parent_Key eq guid'${GUID_RE.test(parent) ? parent : ROOT_FOLDER}' and DeletionMark eq false`,
      $select: 'Ref_Key,Description,IsFolder',
      $top: '500',
    },
  );
  return rows
    .map((r) => ({
      key: r.Ref_Key,
      name: (r.Description ?? '').trim(),
      folder: r.IsFolder === true,
    }))
    .filter((k) => k.name && !k.name.startsWith('_') && !k.name.startsWith('!'))
    .map((k) => (GUID_RE.test(parent) ? k : { ...k, group: defaultGroup(k.name) }))
    .sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, 'ru'));
}

/** one page of the items of a kind, with price and stock */
export async function erpItemsOfKind(
  cfg: ErpConfig,
  kind: string,
  skip = 0,
  top = 50,
): Promise<{ items: ErpRow[]; total: number }> {
  if (!GUID_RE.test(kind)) return { items: [], total: 0 };
  const filter = `ВидНоменклатуры_Key eq guid'${kind}' and IsFolder eq false and DeletionMark eq false`;
  // 1C refuses $expand together with $inlinecount: the count is a request of its own
  const count = await odataPage<RawItem>(cfg, 'Catalog_Номенклатура', {
    $filter: filter,
    $select: 'Ref_Key',
    $top: '1',
    $inlinecount: 'allpages',
  });
  const res = await odataPage<RawItem>(cfg, 'Catalog_Номенклатура', {
    $filter: filter,
    $select: ITEM_SELECT,
    $expand: 'ЕдиницаИзмерения',
    $top: String(top),
    $skip: String(skip),
  });
  const items = res.value
    .filter((r) => !r.IsFolder && !r.DeletionMark)
    .map(toItem)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const prices = await pricesOf(cfg, items);
  return {
    items: items.map((i) => {
      const p = prices.get(i.key);
      return {
        ...i,
        price: p?.price ?? null,
        currency: p?.currency ?? null,
        stock: p?.stock ?? null,
      };
    }),
    total: count.count ?? items.length,
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export interface ErpDeps {
  erp: ErpConfig | null;
  managerPin: string | undefined;
  limiter: RateLimiter;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip'))?.trim() || 'unknown';
}

export async function handleErp(req: Request, deps: ErpDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: { code: 'method_not_allowed' } });
  if (!deps.managerPin) return json(503, { error: { code: 'not_configured' } });
  if (!deps.limiter.take(clientIp(req))) return json(429, { error: { code: 'rate_limited' } });
  if (!pinMatches(req.headers.get('x-manager-pin'), deps.managerPin))
    return json(401, { error: { code: 'wrong_pin' } });
  if (!deps.erp) return json(503, { error: { code: 'erp_not_configured' } });
  let body: {
    action?: unknown;
    q?: unknown;
    articles?: unknown;
    parent?: unknown;
    kind?: unknown;
    skip?: unknown;
  };
  try {
    const text = await req.text();
    if (text.length > 20_000) return json(413, { error: { code: 'too_large' } });
    body = JSON.parse(text) as typeof body;
  } catch {
    return json(400, { error: { code: 'invalid_request' } });
  }
  try {
    if (body.action === 'search') {
      const q = typeof body.q === 'string' ? body.q.slice(0, 80) : '';
      if (q.trim().length < 2) return json(400, { error: { code: 'invalid_request' } });
      // D-32: search within a group (materials / hardware), the manager's groups sent along
      const b = body as { group?: unknown; sub?: unknown; groups?: unknown };
      const group = b.group === 'material' || b.group === 'hardware' ? b.group : undefined;
      const sub = b.sub === 'hinge' || b.sub === 'slide' ? b.sub : undefined;
      const groups: Record<string, KindGroup> = {};
      if (b.groups && typeof b.groups === 'object')
        for (const [k, g] of Object.entries(b.groups as Record<string, unknown>).slice(0, 300))
          if (GUID_RE.test(k) && (g === 'material' || g === 'hardware' || g === 'other'))
            groups[k] = g;
      return json(200, { items: await erpSearch(deps.erp, q, 30, { group, sub, groups }) });
    }
    if (body.action === 'kinds') {
      const parent = typeof body.parent === 'string' ? body.parent : ROOT_FOLDER;
      return json(200, { kinds: await erpKinds(deps.erp, parent) });
    }
    if (body.action === 'items') {
      const b = body as { kind?: unknown; skip?: unknown };
      const skip = Number.isInteger(b.skip) && (b.skip as number) >= 0 ? (b.skip as number) : 0;
      const kind = typeof b.kind === 'string' ? b.kind : '';
      return json(200, await erpItemsOfKind(deps.erp, kind, Math.min(skip, 100_000)));
    }
    if (body.action === 'prices') {
      const articles = Array.isArray(body.articles)
        ? body.articles.filter((a): a is string => typeof a === 'string' && a.length <= 40)
        : null;
      if (!articles || articles.length > 300)
        return json(400, { error: { code: 'invalid_request' } });
      return json(200, { prices: await erpPrices(deps.erp, articles) });
    }
    return json(400, { error: { code: 'invalid_request' } });
  } catch (e) {
    // never echo 1C's answer (it may name internal hosts); the log keeps only the status
    console.warn('erp:', e instanceof Error ? e.message.slice(0, 40) : 'error');
    return json(502, { error: { code: 'erp_unavailable' } });
  }
}
