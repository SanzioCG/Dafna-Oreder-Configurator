import materialsV0Json from '../catalog/materials.v0.json' with { type: 'json' };
import materialsV1Json from '../catalog/materials.v1.json' with { type: 'json' };
import type { Material, MaterialCatalog } from './types.js';

/** Material catalog 0.1.0: placeholder decors (templates up to 0.5.0). Archived, never edited. */
export const materialsV0: MaterialCatalog = materialsV0Json as MaterialCatalog;

/**
 * Material catalog 1.0.0 (D-6): Dafna's price list — EGGER decors and Dafna LDSP 16 / 18 mm
 * (corpus + doors), LMDF 16 / 16.7 mm (doors only). Colours sampled from the price-list
 * swatches, every entry unconfirmed until textures / exact colours arrive.
 */
export const materialsV1: MaterialCatalog = materialsV1Json as MaterialCatalog;

/** The catalog of the current template (wardrobe 0.6.0). */
export const currentCatalog: MaterialCatalog = materialsV1;

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

export function getMaterial(catalog: MaterialCatalog, id: unknown): Material | undefined {
  return typeof id === 'string' ? catalog.materials.find((m) => m.id === id) : undefined;
}
