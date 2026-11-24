import {
  allMaterials,
  getMaterial,
  type CustomHardware,
  type CustomMaterial,
  type MaterialTexture,
  type PriceList,
  type PriceService,
} from '@dafna/engine';

/** D-19 / D-20 manager page: shared data helpers (Uzbek-only office page). */

export const PRODUCTS: { type: string; label: string }[] = [
  { type: 'wardrobe', label: 'Shkaf' },
  { type: 'pedestal', label: 'Ofis tumbasi' },
  { type: 'desk', label: 'Stol' },
];

export const BASIS: { value: PriceService['basis']; label: string; unit: string }[] = [
  { value: 'm2', label: '1 m² plita', unit: "so'm / m²" },
  { value: 'edge_m', label: '1 metr kromka', unit: "so'm / m" },
  { value: 'product', label: '1 dona mahsulot', unit: "so'm / dona" },
  { value: 'pct', label: 'Xarajatlardan %', unit: '%' },
  // D-29: a per-metre job typed by hand (oval edge of curved parts)
  { value: 'manual_m', label: "1 metr — qo'lda (avtomatik hisoblanmaydi)", unit: "so'm / m" },
];

export const KIND_LABEL: Record<string, string> = {
  ldsp: 'LDSP',
  mdf: 'MDF / LMDF',
  hdf: 'HDF',
  metal: 'Metall',
};

export const HW_KIND: Record<string, string> = {
  hinge: 'Petlya',
  slide: "Yo'naltiruvchi",
  castor: "G'ildirak",
  lift_frame: "Ko'tariladigan rama",
  rail: 'Shtanga',
  rail_holder: 'Shtanga tutqichi',
  // D-28: from Dafna's stock report
  hinge_plate: 'Montaj planka',
  slide_lock: "Yo'naltiruvchi qulfi",
  sliding: 'Siljiydigan eshik mexanizmi',
  connector: 'Biriktirgich',
  screw: 'Vint / shurup',
};

/** D-28: what an item is for (hardware catalog `use`) */
export const HW_USE: Record<string, string> = {
  kiosk: 'Sotuvda',
  production: 'Ishlab chiqarish uchun',
  legacy: 'Eski (faqat eski arizalar)',
};

export const UNIT_LABEL: Record<string, string> = {
  pcs: 'dona',
  pair: 'juft',
  m: 'metr',
};

export const USAGE: { value: CustomMaterial['usage'][number]; label: string }[] = [
  { value: 'corpus', label: 'Korpus' },
  { value: 'door', label: 'Fasad / eshik' },
  { value: 'top', label: 'Stoleshnitsa' },
];

/** the 1C code key of the edge band (one edge band price today) */
export const EDGE_BAND_KEY = 'edge_band';

export const money = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** the sheet size GibLab assumes (server/giblab.ts sheetSize): EGGER and HDF/MDF 2800 × 2070,
 * other chipboard 2750 × 1830 — the manager corrects it per board */
export const defaultSheet = (id: string) => {
  const m = getMaterial(allMaterials, id);
  return m && m.kind === 'ldsp' && !m.code
    ? { lengthMm: 2750, widthMm: 1830 }
    : { lengthMm: 2800, widthMm: 2070 };
};

/** a material being added (no id until saved) or a saved one */
/**
 * D-31: an entry taken from 1C carries its 1C article and so'm price until it is saved (the
 * server then links them to the new id in the price list; they are not kept in the catalog)
 */
interface ErpFields {
  erpArticle?: string;
  erpPrice?: number;
  erpSheet?: { lengthMm: number; widthMm: number };
  /** D-34: the eman.uz picture copied into our store (a board's decor photo) */
  erpPicture?: string;
}
export type MaterialDraft = Omit<CustomMaterial, 'id'> & { id?: string } & ErpFields;
export type HardwareDraft = Omit<CustomHardware, 'id' | 'brandKey'> & {
  id?: string;
  brandKey?: string;
} & Omit<ErpFields, 'erpSheet' | 'erpPicture'>;
export interface CatalogDraft {
  materials: MaterialDraft[];
  hardware: HardwareDraft[];
  /** D-21: material id -> decor photo */
  textures?: Record<string, MaterialTexture>;
}

/** D-21: uploads a decor photo for a material, returns its URL or an error code */
export type UploadTexture = (
  materialId: string,
  image: Blob,
) => Promise<{ ok: true; url: string } | { ok: false; code: string }>;

export const NEW_MATERIAL: MaterialDraft = {
  kind: 'ldsp',
  name: '',
  code: '',
  brand: '',
  thicknessMm: 16,
  colorHex: '#c8b49a',
  group: 'wood',
  usage: ['corpus', 'door'],
  grain: true,
  moistureResistant: false,
  visible: true,
  note: '',
};

export const NEW_HARDWARE: HardwareDraft = {
  kind: 'hinge',
  brand: '',
  model: '',
  softClose: true,
  visible: true,
  note: '',
};

/**
 * Labour and assembly are services on this page ("Ish haqi — 1 m²", "Yig'ish — 1 m²", …): a
 * list saved before D-20 (labour per m², assembly per product) is turned into services, the same
 * price. A list never saved (DEMO) also gets the usual services to fill in.
 */
/**
 * D-29: Rover (CNC) per m²; oval edge per metre - only for curved (not straight, not radial)
 * parts, typed by hand, never counted. Drilling (prisadka) is left as it is for now.
 */
export const D29_SERVICES: PriceService[] = [
  { id: 's_rover', name: 'Rover (CNC ishlov)', basis: 'm2', products: [], price: 0 },
  { id: 's_oval', name: 'Ovalniy kromka', basis: 'manual_m', products: [], price: 0 },
];

export function toServiceModel(list: PriceList): PriceList {
  const services = [...(list.services ?? [])];
  const has = (id: string) => services.some((s) => s.id === id);
  if (list.laborPerM2 > 0 && !has('s_labor'))
    services.unshift({
      id: 's_labor',
      name: 'Ish haqi (kesish, ishlov berish)',
      basis: 'm2',
      products: [],
      price: list.laborPerM2,
    });
  for (const [type, price] of Object.entries(list.assembly ?? {}))
    if (price > 0 && !has(`s_asm_${type}`))
      services.push({
        id: `s_asm_${type}`,
        name: "Yig'ish",
        basis: 'product',
        products: [type],
        price,
      });
  if (list.demo) {
    if (!has('s_edge'))
      services.push({ id: 's_edge', name: 'Kromkalash', basis: 'edge_m', products: [], price: 0 });
    if (!has('s_assembly'))
      services.push({ id: 's_assembly', name: "Yig'ish", basis: 'm2', products: [], price: 0 });
  }
  // D-29: the services the founder listed (2026-11-24); prices are the manager's to fill in
  for (const sv of D29_SERVICES) if (!has(sv.id)) services.push({ ...sv });
  return { ...list, laborPerM2: 0, assembly: {}, services };
}

export const ERRORS: Record<string, string> = {
  unauthorized: 'Kirish muddati tugadi — qayta kiring',
  rate_limited: "Juda ko'p urinish: 10 daqiqadan keyin qayta urining",
  not_configured: 'Server sozlanmagan',
  invalid_price: "Narxlardan biri noto'g'ri",
  invalid_catalog: "Yangi material yoki furnituraning majburiy maydoni to'ldirilmagan",
  storage_not_configured:
    'Rasm saqlash joyi ulanmagan (Vercel: Storage → Blob, BLOB_READ_WRITE_TOKEN)',
  invalid_texture: 'Rasm JPG, PNG yoki WebP bo‘lishi kerak',
  too_large: 'Rasm juda katta',
  network: "Server bilan aloqa yo'q",
};

/** "services.2" -> "Xizmatlar: 3-qator" (the manager sees where the problem is) */
export function fieldText(field: string | undefined): string {
  if (!field) return '';
  const [part, n] = field.split('.');
  const row = n !== undefined && /^\d+$/.test(n) ? `${Number(n) + 1}-qator` : n;
  const where: Record<string, string> = {
    services: 'Xizmatlar',
    textures: 'Tekstura',
    materials: 'Yangi materiallar',
    hardware: 'Yangi furnitura',
    boardSheets: 'Listlar',
    hardwareprice: 'Furnitura',
    markupPct: 'Foyda %',
  };
  return ` — ${where[part ?? ''] ?? part}${row ? `: ${row}` : ''}`;
}
