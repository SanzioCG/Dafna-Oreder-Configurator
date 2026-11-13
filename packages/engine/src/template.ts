import wardrobeV6Json from '../templates/wardrobe.v6.json' with { type: 'json' };
import type {
  Material,
  MaterialCatalog,
  ParamDef,
  Params,
  Template,
  TemplateConstant,
} from './types.js';

/**
 * The current wardrobe (shkaf) template: v6 (templateVersion 0.7.0, D-7: standard customer sizes
 * and GOST 13025.1-85 storage presets; catalog 1.0.0, same generator). Older templates (v0 D-0 …
 * v5 D-6) are archived (regenerate.ts); older order drafts are migrated with migrateOrderDraft().
 */
export const wardrobeTemplate: Template = wardrobeV6Json as Template;

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
