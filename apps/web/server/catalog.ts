import {
  EMPTY_EXTENSION,
  allMaterials,
  applyCatalogExtension,
  getMaterial,
  type MaterialTexture,
  type CatalogExtension,
  type CustomHardware,
  type CustomMaterial,
  type MaterialUsage,
} from '@dafna/engine';
import { SheetTab, type PriceSheetConfig } from './priceSheet';

/**
 * D-20: the catalog extension (materials and hardware added on the manager page), stored in the
 * Google Sheet tab "Katalog". APPEND-ONLY: an entry is never deleted (only hidden from
 * customers) and its construction fields never change once saved, so every stored application
 * still regenerates exactly (ADR-011). mergeCatalog() enforces this on every save.
 *
 * Every server entry applies the extension (CachedCatalog.get) before it generates anything.
 */
export interface CatalogStore {
  load(): Promise<CatalogExtension>;
  save(ext: CatalogExtension): Promise<void>;
}

export class MemoryCatalogStore implements CatalogStore {
  saved: CatalogExtension = EMPTY_EXTENSION;
  async load() {
    return this.saved;
  }
  async save(ext: CatalogExtension) {
    this.saved = ext;
  }
}

/** Loads the extension at most once per `ttlMs` per warm instance and applies it to the engine. */
export class CachedCatalog {
  private cached: { ext: CatalogExtension; at: number } | null = null;
  constructor(
    private readonly store: CatalogStore,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async get(): Promise<CatalogExtension> {
    const t = this.now();
    if (!this.cached || t - this.cached.at >= this.ttlMs) {
      this.cached = { ext: await this.store.load(), at: t };
    }
    applyCatalogExtension(this.cached.ext);
    return this.cached.ext;
  }

  set(ext: CatalogExtension) {
    this.cached = { ext, at: this.now() };
    applyCatalogExtension(ext);
  }
}

const USAGES: MaterialUsage[] = ['corpus', 'door', 'top'];
const THICKNESS = [16, 16.7, 18, 22, 25];
const HEX = /^#[0-9a-f]{6}$/i;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * D-31: a new entry taken from Dafna's 1C carries its 1C article and price (never stored in the
 * "Katalog" tab): the manager handler puts them into the price list under the new id.
 */
export interface ErpLink {
  id: string;
  kind: 'material' | 'hardware';
  article: string;
  /** so'm: per sheet (material) or per unit (hardware) */
  price?: number;
  sheet?: { lengthMm: number; widthMm: number };
}

export type MergeResult =
  { ok: true; ext: CatalogExtension; links: ErpLink[] } | { ok: false; field: string };

/** D-31: the 1C fields of an incoming new entry, validated */
function erpLinkOf(x: unknown): Omit<ErpLink, 'id' | 'kind'> | null {
  const v = x as { erpArticle?: unknown; erpPrice?: unknown; erpSheet?: unknown } | null;
  const article = typeof v?.erpArticle === 'string' ? v.erpArticle.trim().slice(0, 40) : '';
  if (!article) return null;
  const price =
    typeof v?.erpPrice === 'number' && Number.isFinite(v.erpPrice) && v.erpPrice >= 0
      ? Math.round(v.erpPrice)
      : undefined;
  const s = v?.erpSheet as { lengthMm?: unknown; widthMm?: unknown } | undefined;
  const mm = (n: unknown) => typeof n === 'number' && n >= 300 && n <= 6000;
  const sheet =
    s && mm(s.lengthMm) && mm(s.widthMm)
      ? { lengthMm: Math.round(s.lengthMm as number), widthMm: Math.round(s.widthMm as number) }
      : undefined;
  return { article, price, sheet };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20) || 'brand';

/**
 * The manager's catalog -> the catalog to store. Saved entries keep their construction fields
 * (material: kind, thickness, usage; hardware: kind, brand key); only the name, decor code,
 * colour, swatch group, brand / model text, soft close and visibility may change. An entry
 * missing from the incoming list is kept unchanged (never deleted). New entries get new ids.
 */
/** D-21: where a decor photo may live (the Vercel Blob store; data URLs on the dev server) */
export function textureUrlAllowed(url: string, allowDataUrls = false): boolean {
  if (allowDataUrls && /^data:image\/(jpeg|png|webp);base64,/.test(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export function mergeCatalog(
  saved: CatalogExtension,
  incoming: unknown,
  options: { allowDataUrls?: boolean } = {},
): MergeResult {
  const inc = (incoming ?? {}) as { materials?: unknown; hardware?: unknown; textures?: unknown };
  if (!Array.isArray(inc.materials ?? []) || !Array.isArray(inc.hardware ?? []))
    return { ok: false, field: 'catalog' };
  const rawM = (inc.materials ?? []) as Partial<CustomMaterial>[];
  const rawH = (inc.hardware ?? []) as Partial<CustomHardware>[];
  if (rawM.length > 500 || rawH.length > 200) return { ok: false, field: 'catalog' };

  const materials = saved.materials.map((m) => ({ ...m }));
  const links: ErpLink[] = [];
  const newTextures: Record<string, MaterialTexture> = {};
  let next = materials.length + 1;
  for (const [i, x] of rawM.entries()) {
    const name = text(x?.name, 80);
    const colorHex = text(x?.colorHex, 7);
    const group = x?.group === 'wood' ? 'wood' : 'plain';
    const code = text(x?.code, 40) || undefined;
    const visible = x?.visible !== false;
    if (!name || !HEX.test(colorHex)) return { ok: false, field: `materials.${i}` };
    const old = typeof x?.id === 'string' ? materials.find((m) => m.id === x.id) : undefined;
    const brand = text(x?.brand, 40) || undefined;
    const note = text(x?.note, 200) || undefined;
    if (old) {
      Object.assign(old, {
        name,
        code,
        colorHex: colorHex.toLowerCase(),
        group,
        visible,
        brand,
        note,
      });
      continue;
    }
    const kind = x?.kind === 'mdf' ? 'mdf' : x?.kind === 'ldsp' ? 'ldsp' : null;
    const usage = Array.isArray(x?.usage)
      ? USAGES.filter((u) => (x.usage as unknown[]).includes(u))
      : [];
    if (!kind || !THICKNESS.includes(Number(x?.thicknessMm)) || usage.length === 0)
      return { ok: false, field: `materials.${i}` };
    while (materials.some((m) => m.id === `x_m${next}`)) next++;
    const link = erpLinkOf(x);
    if (link) links.push({ ...link, id: `x_m${next}`, kind: 'material' });
    // D-34: a picture taken from eman.uz becomes its decor photo (the manager sets the scale)
    const pic = (x as { erpPicture?: unknown } | null)?.erpPicture;
    if (typeof pic === 'string' && textureUrlAllowed(pic, options.allowDataUrls))
      newTextures[`x_m${next}`] = { url: pic, widthMm: 1000, heightMm: 1000 };
    materials.push({
      id: `x_m${next++}`,
      kind,
      name,
      code,
      thicknessMm: Number(x!.thicknessMm),
      colorHex: colorHex.toLowerCase(),
      group,
      usage,
      visible,
      brand,
      grain: x?.grain === true,
      moistureResistant: x?.moistureResistant === true,
      note,
    });
  }

  const hardware = saved.hardware.map((h) => ({ ...h }));
  let nextH = hardware.length + 1;
  for (const [i, x] of rawH.entries()) {
    const brand = text(x?.brand, 40);
    const model = text(x?.model, 60);
    const softClose = x?.softClose === true;
    const visible = x?.visible !== false;
    if (!brand || !model) return { ok: false, field: `hardware.${i}` };
    const old = typeof x?.id === 'string' ? hardware.find((h) => h.id === x.id) : undefined;
    const note = text(x?.note, 200) || undefined;
    // D-33: the customer's text and the photo are visual only: they may change at any time
    const info = text(x?.info, 400) || undefined;
    const photo = typeof x?.photoUrl === 'string' ? x.photoUrl : '';
    if (photo && !textureUrlAllowed(photo, options.allowDataUrls))
      return { ok: false, field: `hardware.${i}` };
    const photoUrl = photo || undefined;
    if (old) {
      Object.assign(old, { brand, model, softClose, visible, note, info, photoUrl });
      continue;
    }
    const kind = x?.kind === 'hinge' || x?.kind === 'slide' ? x.kind : null;
    if (!kind) return { ok: false, field: `hardware.${i}` };
    // a brand option value unique within its kind, never one of the built-in brands
    let brandKey = `x_${slug(`${brand}_${model}`)}`;
    for (let n = 2; hardware.some((h) => h.kind === kind && h.brandKey === brandKey); n++)
      brandKey = `x_${slug(`${brand}_${model}`)}_${n}`;
    while (hardware.some((h) => h.id === `x_h${nextH}`)) nextH++;
    const linkH = erpLinkOf(x);
    if (linkH)
      links.push({
        id: `x_h${nextH}`,
        kind: 'hardware',
        article: linkH.article,
        price: linkH.price,
      });
    hardware.push({
      id: `x_h${nextH++}`,
      kind,
      brandKey,
      brand,
      model,
      softClose,
      visible,
      note,
      info,
      photoUrl,
    });
  }
  // D-21: decor photos are visual only: the incoming set replaces the stored one
  let textures: Record<string, MaterialTexture> = { ...(saved.textures ?? {}) };
  if (inc.textures !== undefined) {
    if (typeof inc.textures !== 'object' || inc.textures === null)
      return { ok: false, field: 'textures' };
    textures = {};
    for (const [id, raw] of Object.entries(inc.textures)) {
      const t = raw as Partial<MaterialTexture> | null;
      const known =
        getMaterial(allMaterials, id) !== undefined || materials.some((m) => m.id === id);
      const size = (n: unknown) => typeof n === 'number' && n >= 50 && n <= 10000;
      if (
        !known ||
        !t ||
        typeof t.url !== 'string' ||
        !textureUrlAllowed(t.url, options.allowDataUrls) ||
        !size(t.widthMm) ||
        !size(t.heightMm)
      )
        return { ok: false, field: `textures.${id}` };
      textures[id] = {
        url: t.url,
        widthMm: Math.round(t.widthMm!),
        heightMm: Math.round(t.heightMm!),
      };
    }
  }
  return {
    ok: true,
    ext: { materials, hardware, textures: { ...textures, ...newTextures } },
    links,
  };
}

/* ---------- the "Katalog" tab ---------- */

export const CATALOG_TAB = 'Katalog';
export const CATALOG_HEADER = [
  'Turi',
  'Kod',
  'Nomi / brend',
  'Dekor kodi / model',
  'Material turi / furnitura turi',
  'Qalinligi (mm)',
  'Rang',
  'Guruh / yumshoq yopiladi',
  'Ishlatilishi / brend kaliti',
  "Mijozga ko'rinadi",
  'Ishlab chiqaruvchi',
  "Tekstura yo'nalishi",
  'Namlikka chidamli',
  'Izoh',
  // D-33: furnitura only
  "Mijoz uchun ma'lumot",
  'Rasm',
];

export function catalogToRows(ext: CatalogExtension): (string | number)[][] {
  return [
    CATALOG_HEADER,
    ...ext.materials.map((m) => [
      'material',
      m.id,
      m.name,
      m.code ?? '',
      m.kind,
      m.thicknessMm,
      m.colorHex,
      m.group,
      m.usage.join(','),
      m.visible ? 'ha' : "yo'q",
      m.brand ?? '',
      m.grain ? 'ha' : "yo'q",
      m.moistureResistant ? 'ha' : "yo'q",
      m.note ?? '',
    ]),
    ...ext.hardware.map((h) => [
      'furnitura',
      h.id,
      h.brand,
      h.model,
      h.kind,
      '',
      '',
      h.softClose ? 'ha' : "yo'q",
      h.brandKey,
      h.visible ? 'ha' : "yo'q",
      '',
      '',
      '',
      h.note ?? '',
      h.info ?? '',
      h.photoUrl ?? '',
    ]),
    ...Object.entries(ext.textures ?? {}).map(([id, t]) => [
      'tekstura',
      id,
      t.url,
      '',
      '',
      t.widthMm,
      t.heightMm,
    ]),
  ];
}

export function rowsToCatalog(rows: unknown[][]): CatalogExtension {
  const materials: CustomMaterial[] = [];
  const hardware: CustomHardware[] = [];
  const textures: Record<string, MaterialTexture> = {};
  const s = (v: unknown) => String(v ?? '').trim();
  for (const r of rows.slice(1)) {
    const c = (i: number) => s(r[i]);
    const [type, id, name, code, kind, thick, color, group, usage, visible] = [
      c(0),
      c(1),
      c(2),
      c(3),
      c(4),
      c(5),
      c(6),
      c(7),
      c(8),
      c(9),
    ];
    if (type === 'material' && id && (kind === 'ldsp' || kind === 'mdf')) {
      materials.push({
        id,
        kind,
        name: name || id,
        code: code || undefined,
        thicknessMm: Number(thick.replace(',', '.')) || 16,
        colorHex: HEX.test(color) ? color : '#cccccc',
        group: group === 'wood' ? 'wood' : 'plain',
        usage: USAGES.filter((u) => usage.split(',').includes(u)),
        visible: visible !== "yo'q",
        brand: c(10) || undefined,
        grain: c(11) === 'ha',
        moistureResistant: c(12) === 'ha',
        note: c(13) || undefined,
      });
    } else if (type === 'tekstura' && id && textureUrlAllowed(name)) {
      textures[id] = {
        url: name,
        widthMm: Number(thick) || 1000,
        heightMm: Number(color) || 1000,
      };
    } else if (type === 'furnitura' && id && (kind === 'hinge' || kind === 'slide') && usage) {
      hardware.push({
        id,
        kind,
        brandKey: usage,
        brand: name || id,
        model: code,
        softClose: group === 'ha',
        visible: visible !== "yo'q",
        note: c(13) || undefined,
        // D-33: what the customer reads, and the photo
        info: c(14) || undefined,
        photoUrl: c(15) || undefined,
      });
    }
  }
  return { materials, hardware, textures };
}

export class GoogleSheetsCatalogStore implements CatalogStore {
  private readonly tab: SheetTab;
  constructor(config: PriceSheetConfig) {
    this.tab = new SheetTab(config, CATALOG_TAB, {
      widths: [90, 150, 220, 160, 130, 90, 80, 120, 160, 90, 130, 90, 90, 220, 260, 220],
    });
  }
  async load() {
    return rowsToCatalog(await this.tab.read());
  }
  async save(ext: CatalogExtension) {
    await this.tab.write(catalogToRows(ext));
  }
}

const json = (status: number, body: unknown, maxAge = 0) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
    },
  });

/** GET /api/catalog: the extension for the kiosk (no prices in it). */
export async function handleCatalog(req: Request, catalog: CachedCatalog): Promise<Response> {
  if (req.method !== 'GET') return json(405, { error: { code: 'method_not_allowed' } });
  return json(200, await catalog.get(), 30);
}
