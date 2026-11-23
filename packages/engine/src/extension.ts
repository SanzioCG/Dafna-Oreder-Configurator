import { hardwareV1 } from './bom.js';
import { setMaterialFallback } from './catalog.js';
import { PRODUCT_TEMPLATES } from './template.js';
import type { Material, MaterialKind, ParamValue } from './types.js';

/**
 * D-20: the catalog extension — materials and hardware the manager adds on the admin page, on
 * top of the versioned catalogs. Applied at runtime (kiosk: from GET /api/catalog; server: from
 * the sheet tab "Katalog") to the CURRENT templates: a new material becomes an option of the
 * material parameters it is meant for, a new hinge / slide a new brand option.
 *
 * Reproducibility (ADR-011) holds because the extension is append-only: an entry is never
 * deleted (only hidden from customers) and its construction fields (kind, thickness, usage,
 * hardware kind) never change once saved; the server enforces this. getMaterial() falls back to
 * the extension, so every stored application still regenerates.
 */
export type MaterialUsage = 'corpus' | 'door' | 'top';

export interface CustomMaterial {
  /** "x_…", assigned by the server */
  id: string;
  /** LDSP or MDF (LMDF fronts are MDF); HDF is the back panel only */
  kind: Extract<MaterialKind, 'ldsp' | 'mdf'>;
  /** shown as typed (material names are never translated) */
  name: string;
  /** supplier decor code, e.g. "EGGER H3157 ST12" */
  code?: string;
  thicknessMm: number;
  colorHex: string;
  group: 'plain' | 'wood';
  usage: MaterialUsage[];
  /** false = hidden from customers (kept for old applications) */
  visible: boolean;
  /** manufacturer, e.g. "Egger", "Kronospan" */
  brand?: string;
  /** the decor has a grain direction (parts are cut along it); locked once saved */
  grain?: boolean;
  /** moisture resistant board (kitchen / bathroom); locked once saved */
  moistureResistant?: boolean;
  /** free note for the office (supplier, delivery time, …) */
  note?: string;
}

export interface CustomHardware {
  /** hardware item id, "x_…" */
  id: string;
  kind: 'hinge' | 'slide';
  /** brand option value of hingeBrand / slideBrand */
  brandKey: string;
  /** brand as written, e.g. "Blum" */
  brand: string;
  /** model, e.g. "Clip Top Blumotion" */
  model: string;
  softClose: boolean;
  visible: boolean;
  /** free note for the office */
  note?: string;
}

export interface CatalogExtension {
  materials: CustomMaterial[];
  hardware: CustomHardware[];
}

export const EMPTY_EXTENSION: CatalogExtension = { materials: [], hardware: [] };

/** material parameter -> what a material must be meant for to appear there */
const PARAM_USAGE: Record<string, MaterialUsage> = {
  corpusMaterial: 'corpus',
  doorMaterial: 'door',
  topMaterial: 'top',
};
const BRAND_PARAM: Record<CustomHardware['kind'], string> = {
  hinge: 'hingeBrand',
  slide: 'slideBrand',
};

const cloneBrands = (b: Record<string, Record<string, string>>) =>
  Object.fromEntries(Object.entries(b).map(([k, v]) => [k, { ...v }]));

let current: CatalogExtension = EMPTY_EXTENSION;
const materialById = new Map<string, Material>();
/** the options each template parameter had before any extension (to re-apply idempotently) */
const baseOptions = new WeakMap<object, readonly ParamValue[]>();
/** the hardware catalog before any extension (captured on the first apply) */
let base: { items: typeof hardwareV1.items; brands: typeof hardwareV1.brands } | null = null;

export function toMaterial(m: CustomMaterial): Material {
  return {
    id: m.id,
    kind: m.kind,
    decorName: m.name,
    code: m.code,
    thicknessMm: m.thicknessMm,
    colorHex: m.colorHex,
    group: m.group,
    textureUrl: null,
    customerVisible: m.visible,
    unconfirmed: false,
    note: m.note ? `D-20 (admin): ${m.note}` : 'D-20: added on the admin page',
  };
}

/** Replaces the active extension (idempotent: applying the same extension twice is a no-op). */
export function applyCatalogExtension(ext: CatalogExtension): void {
  current = ext;
  materialById.clear();
  for (const m of ext.materials) materialById.set(m.id, toMaterial(m));
  setMaterialFallback((id) => materialById.get(id));
  base ??= { items: hardwareV1.items.slice(), brands: cloneBrands(hardwareV1.brands) };

  for (const template of Object.values(PRODUCT_TEMPLATES)) {
    for (const def of template.parameters) {
      if (def.type !== 'enum' || !def.options) continue;
      const usage = PARAM_USAGE[def.key];
      const kind = (Object.keys(BRAND_PARAM) as CustomHardware['kind'][]).find(
        (k) => BRAND_PARAM[k] === def.key,
      );
      if (!usage && !kind) continue;
      if (!baseOptions.has(def)) baseOptions.set(def, def.options.slice());
      const own = baseOptions.get(def)!;
      const extra = usage
        ? ext.materials
            // the parameter's own kind rule stays (e.g. no MDF carcass on the pedestal)
            .filter((m) => m.usage.includes(usage) && (def.materialKinds ?? []).includes(m.kind))
            .map((m) => m.id)
        : ext.hardware.filter((h) => h.kind === kind).map((h) => h.brandKey);
      (def as { options: ParamValue[] }).options = [
        ...own,
        ...extra.filter((x) => !own.includes(x)),
      ];
    }
  }

  hardwareV1.items.length = 0;
  hardwareV1.items.push(...base.items);
  hardwareV1.brands = cloneBrands(base.brands);
  for (const h of ext.hardware) {
    hardwareV1.items.push({
      id: h.id,
      kind: h.kind,
      brand: h.brand,
      nameKey: `${h.brand} ${h.model}`,
      softClose: h.softClose,
      unit: h.kind === 'slide' ? 'pair' : 'pcs',
      unconfirmed: false,
    });
    (hardwareV1.brands[h.kind] ??= {})[h.brandKey] = h.id;
  }
}

export function catalogExtension(): CatalogExtension {
  return current;
}

/** D-20: getMaterial() fallback for materials added on the admin page. */
export function extensionMaterial(id: string): Material | undefined {
  return materialById.get(id);
}

/** the extension's hardware behind a brand option value (labels in the hardware step) */
export function extensionBrand(
  kind: CustomHardware['kind'],
  brandKey: string,
): CustomHardware | undefined {
  return current.hardware.find((h) => h.kind === kind && h.brandKey === brandKey);
}
