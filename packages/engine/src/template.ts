import wardrobeV3Json from '../templates/wardrobe.v3.json' with { type: 'json' };
import type {
  Material,
  MaterialCatalog,
  ParamDef,
  Params,
  Template,
  TemplateConstant,
} from './types.js';

/**
 * The current wardrobe (shkaf) template: v3 (templateVersion 0.4.0, D-1c: shared partitions
 * allowed again, hinge mounts, default depth). Older templates (v0 D-0, v1 D-1a, v2 D-1b) are
 * kept as an archive only; older order drafts are migrated with migrateOrderDraft().
 */
export const wardrobeTemplate: Template = wardrobeV3Json as Template;

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
