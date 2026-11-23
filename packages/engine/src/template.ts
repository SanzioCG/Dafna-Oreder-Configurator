import wardrobeV14Json from '../templates/wardrobe.v14.json' with { type: 'json' };
import pedestalV6Json from '../templates/pedestal.v6.json' with { type: 'json' };
import deskV4Json from '../templates/desk.v4.json' with { type: 'json' };
import type {
  Material,
  MaterialCatalog,
  ParamDef,
  Params,
  Template,
  TemplateConstant,
} from './types.js';

/**
 * The current wardrobe (shkaf) template: v14 (templateVersion 0.15.0, D-28: Samet hinges and
 * slides from Dafna's stock report). v13 (0.14.0, D-27: inset doors span
 * the partitions between doored sections; the partitions stand behind them). v12 (0.13.0, D-26: Dafna's Bazis models -
 * feet, back in a groove, two edge bands, inset doors by default). v11 (0.12.0, D-22: the technologist's
 * confirmation table - top on the sides, overlay or inset doors, confirmed gaps / setbacks).
 * v10 (0.11.0, D-17): height up to 2200.
 * History: v7 (templateVersion 0.8.0, D-9: + hardware brands
 * hingeBrand / slideBrand for the BOM and price; otherwise = v6 / 0.7.0: standard customer sizes,
 * GOST 13025.1-85 storage presets, catalog 1.0.0, same generator). Older templates are archived
 * (regenerate.ts); older order drafts are migrated with migrateOrderDraft().
 */
export const wardrobeTemplate: Template = wardrobeV14Json as Template;

/** D-8: office pedestal (ofis tumbasi), template 0.6.0 (D-28: Samet slides; D-26: Bazis "Tum mobil" construction) (pedestal.ts, ADR-014). */
export const pedestalTemplate: Template = pedestalV6Json as Template;

/** D-8: office / writing desk (stol), template 0.4.0 (D-26: Bazis - two full top sheets, double legs, stepped modesty panel) (desk.ts, ADR-014). */
export const deskTemplate: Template = deskV4Json as Template;

/** The current template of every product, by templateId (= productType). */
export const PRODUCT_TEMPLATES: Readonly<Record<string, Template>> = {
  wardrobe: wardrobeTemplate,
  pedestal: pedestalTemplate,
  desk: deskTemplate,
};

export function getParamDef(template: Template, key: string): ParamDef | undefined {
  return template.parameters.find((p) => p.key === key);
}

export function defaultParams(template: Template): Params {
  const out: Params = {};
  for (const def of template.parameters) out[def.key] = def.default;
  return out;
}

export function getNumberConstant(template: Template, name: string): number {
  const c = template.constants[name];
  if (!c || typeof c.value !== 'number') {
    // Template is developer-authored data, not user input.
    throw new Error(`Template ${template.templateId} is missing numeric constant "${name}"`);
  }
  return c.value;
}

export function getStringConstant(template: Template, name: string): string {
  const c = template.constants[name];
  if (!c || typeof c.value !== 'string') {
    throw new Error(`Template ${template.templateId} is missing string constant "${name}"`);
  }
  return c.value;
}

export type UnconfirmedItem =
  | { kind: 'param'; key: string; def: ParamDef }
  | { kind: 'constant'; key: string; constant: TemplateConstant }
  | { kind: 'rule'; key: string; note: string }
  | { kind: 'material'; key: string; material: Material };

/**
 * Every assumption in the template (and, if given, the material catalog), in template order.
 * Used by staff mode and docs.
 */
export function listUnconfirmed(template: Template, catalog?: MaterialCatalog): UnconfirmedItem[] {
  const out: UnconfirmedItem[] = [];
  for (const def of template.parameters) {
    if (def.unconfirmed) out.push({ kind: 'param', key: def.key, def });
  }
  for (const [key, constant] of Object.entries(template.constants)) {
    if (constant.unconfirmed) out.push({ kind: 'constant', key, constant });
  }
  for (const rule of template.constructionRules) {
    if (rule.unconfirmed) out.push({ kind: 'rule', key: rule.id, note: rule.note });
  }
  for (const material of catalog?.materials ?? []) {
    if (material.unconfirmed) out.push({ kind: 'material', key: material.id, material });
  }
  return out;
}
