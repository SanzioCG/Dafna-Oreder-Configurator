import { getMaterial, materialsV0 } from './catalog.js';
import { resolveParams } from './params.js';
import { getStringConstant, wardrobeTemplate } from './template.js';
import {
  ORDER_SCHEMA_VERSION,
  type GenerateResult,
  type MaterialCatalog,
  type OrderDraft,
  type Template,
} from './types.js';
import { SAME_AS_CORPUS } from './wardrobe.js';

export interface OrderDraftOptions {
  template?: Template;
  catalog?: MaterialCatalog;
  /** Injectable clock for deterministic output (tests). */
  now?: () => Date;
}

/**
 * Builds the order draft JSON (schema dafna-order/0.3-draft: door panels carry hingeMount). Contains no price fields
 * (price comes in a later batch). Materials are embedded as full catalog entries so the draft
 * stays readable even after the catalog changes.
 */
export function toOrderDraft(
  params: unknown,
  result: GenerateResult,
  options: OrderDraftOptions = {},
): OrderDraft {
  const template = options.template ?? wardrobeTemplate;
  const catalog = options.catalog ?? materialsV0;
  const now = options.now ?? (() => new Date());
  const resolved = resolveParams(template, params).params;
  const hasDoors = result.sections.some((s) => s.doorType !== 'none');
  const doorMaterialId =
    resolved.doorMaterial === SAME_AS_CORPUS ? resolved.corpusMaterial : resolved.doorMaterial;
  const hasBack = result.panels.some((p) => p.role === 'back');

  return {
    schemaVersion: ORDER_SCHEMA_VERSION,
    productType: 'wardrobe',
    templateVersion: template.templateVersion,
    catalogVersion: catalog.catalogVersion,
    params: resolved,
    materials: {
      corpus: getMaterial(catalog, resolved.corpusMaterial) ?? null,
      doors: hasDoors ? (getMaterial(catalog, doorMaterialId) ?? null) : null,
      back: hasBack
        ? (getMaterial(catalog, getStringConstant(template, 'backMaterial')) ?? null)
        : null,
    },
    doors: result.sections.map((s) => ({
      sectionIndex: s.index,
      type: s.doorType,
      leaves: result.panels
        .filter((p) => p.role === 'door' && p.sectionIndex === s.index)
        .map((p) => p.id),
    })),
    interior: result.sections.map((s) => ({
      sectionIndex: s.index,
      preset: s.preset,
      presetSource: s.presetSource,
      shelves: s.shelves,
      rails: s.rails,
      drawers: s.drawers,
      clearHangingHeightMm: s.clearHangingHeightMm,
    })),
    dimensions: result.dimensions,
    panels: result.panels,
    rails: result.rails,
    sections: result.sections,
    issues: result.issues,
    generatedAt: now().toISOString(),
  };
}
