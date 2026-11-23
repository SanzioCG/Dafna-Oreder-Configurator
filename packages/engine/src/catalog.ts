import materialsV0Json from '../catalog/materials.v0.json' with { type: 'json' };
import materialsV1Json from '../catalog/materials.v1.json' with { type: 'json' };
import materialsV11Json from '../catalog/materials.v1_1.json' with { type: 'json' };
import type { Material, MaterialCatalog, Template } from './types.js';

/** Material catalog 0.1.0: placeholder decors (templates up to 0.5.0). Archived, never edited. */
export const materialsV0: MaterialCatalog = materialsV0Json as MaterialCatalog;

/**
 * Material catalog 1.0.0 (D-6): Dafna's price list — EGGER decors and Dafna LDSP 16 / 18 mm
 * (corpus + doors), LMDF 16 / 16.7 mm (doors only). Colours sampled from the price-list
 * swatches, every entry unconfirmed until textures / exact colours arrive.
 */
export const materialsV1: MaterialCatalog = materialsV1Json as MaterialCatalog;

/**
 * Material catalog 1.1.0 (D-8) = every 1.0.0 entry unchanged + Dafna table-top boards (22 / 25 mm)
 * + metal frame finishes (desk legs, pedestal castors). Used by the pedestal and desk templates;
 * the wardrobe stays on 1.0.0 so its applications regenerate unchanged.
 */
export const materialsV1_1: MaterialCatalog = materialsV11Json as MaterialCatalog;

/** The wardrobe's current catalog (wardrobe 0.6.0 / 0.7.0). */
export const currentCatalog: MaterialCatalog = materialsV1;

/** Every material known to any current product (the UI looks decors up here). */
export const allMaterials: MaterialCatalog = materialsV1_1;

const before = (a: string, b: string) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
};

/**
 * The catalog a template was released with (its material ids live there). Archived: never edit
 * an entry, add one for every new template. Wardrobe: <0.6.0 -> 0.1.0, >=0.6.0 -> 1.0.0;
 * pedestal / desk 0.1.0 -> 1.1.0.
 */
export function catalogForTemplate(template: Template): MaterialCatalog {
  if (template.templateId === 'wardrobe') {
    return before(template.templateVersion, '0.6.0') ? materialsV0 : materialsV1;
  }
  return materialsV1_1;
}

/**
 * Catalog 0.1.0 placeholder -> nearest catalog 1.0.0 decor, for migrating drafts made before
 * template 0.6.0. A migrated draft reports every mapped decor (MIGRATION_MATERIAL_CHANGED),
 * except the white board whose id is unchanged.
 */
export const MATERIAL_MAP_V0_V1: Readonly<Record<string, string>> = {
  ldsp_white_16: 'ldsp_white_16',
  ldsp_light_grey_16: 'egger_u707_st9_16',
  ldsp_beige_16: 'egger_u702_st9_16',
  ldsp_oak_light_16: 'egger_h3860_st9_16',
  ldsp_anthracite_16: 'egger_u963_st9_16',
  ldsp_white_18: 'egger_w1000_st9_18',
};

/** D-20: materials added on the admin page (extension.ts registers the lookup). */
let materialFallback: ((id: string) => Material | undefined) | null = null;
export function setMaterialFallback(fn: ((id: string) => Material | undefined) | null): void {
  materialFallback = fn;
}

export function getMaterial(catalog: MaterialCatalog, id: unknown): Material | undefined {
  if (typeof id !== 'string') return undefined;
  return catalog.materials.find((m) => m.id === id) ?? materialFallback?.(id);
}
