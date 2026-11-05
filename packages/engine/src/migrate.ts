import { materialsV0 } from './catalog.js';
import { toOrderDraft } from './order.js';
import { makeIssue } from './params.js';
import { defaultParams, wardrobeTemplate } from './template.js';
import {
  ORDER_SCHEMA_VERSION,
  ORDER_SCHEMA_VERSION_01,
  ORDER_SCHEMA_VERSION_D0,
  type Issue,
  type MaterialCatalog,
  type OrderDraft,
  type ParamValue,
  type Params,
  type Template,
} from './types.js';
import { generate } from './wardrobe.js';

export interface MigrationOptions {
  template?: Template;
  catalog?: MaterialCatalog;
}

/**
 * Migration is a chain of parameter steps, then ONE re-generation with the current engine:
 *   D-0  (dafna-order/0-draft)   --migrateParamsFromD0-->  0.1 params
 *   0.1  (dafna-order/0.1-draft) --migrateParamsFrom01-->  0.2 params  --generate--> 0.2 draft
 * Rule: a migration never silently changes what was ordered. What cannot be preserved is
 * reported (MIGRATION_DOORS_CHANGED warning) or blocks the migration (error issues, no draft).
 */

/**
 * D-0 params (template 0.1.0) -> 0.1 params.
 * - `panelThickness` (16 | 18) -> `corpusMaterial` = first LDSP in the catalog with that
 *   thickness (catalog order puts white first; D-0 had no decor choice).
 * - D-0 had no doors -> `doors = 'none'`. Without doors the depth formula is unchanged
 *   (depth = back + carcass), so the migrated geometry equals the D-0 geometry.
 * - Every other D-0 key is copied unchanged; new keys get template defaults.
 */
export function migrateParamsFromD0(
  d0Params: unknown,
  options: MigrationOptions = {},
): { params: Params; issues: Issue[] } {
  const template = options.template ?? wardrobeTemplate;
  const catalog = options.catalog ?? materialsV0;
  const issues: Issue[] = [];
  const raw: Record<string, unknown> =
    d0Params !== null && typeof d0Params === 'object' ? (d0Params as Record<string, unknown>) : {};

  // D-0 had no doors: keep them off so the geometry stays identical
  const params: Params = { ...defaultParams(template), doors: 'none' };
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'panelThickness') continue;
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      params[key] = value as ParamValue;
    }
  }

  const thickness = raw.panelThickness ?? 16;
  const material = catalog.materials.find((m) => m.kind === 'ldsp' && m.thicknessMm === thickness);
  if (material) {
    params.corpusMaterial = material.id;
  } else {
    issues.push(
      makeIssue('MIGRATION_THICKNESS_UNAVAILABLE', 'error', 'corpusMaterial', {
        panelThickness: String(thickness),
      }),
    );
  }
  return { params, issues };
}

/**
 * 0.1 params (template 0.2.0) -> 0.2 params (template 0.3.0).
 * - interior1..4 = 'empty' (0.1 orders had no interior fill).
 * - sections: 'auto' is pinned to the section count the 0.1 draft actually had, because the
 *   D-1b auto rule also considers doors and could pick a different count.
 * - Everything else is copied; door overrides keep their meaning.
 */
export function migrateParamsFrom01(
  params01: unknown,
  sectionCount: number | null,
  options: MigrationOptions = {},
): Params {
  const template = options.template ?? wardrobeTemplate;
  const raw: Record<string, unknown> =
    params01 !== null && typeof params01 === 'object' ? (params01 as Record<string, unknown>) : {};
  const params: Params = { ...defaultParams(template) };
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      params[key] = value as ParamValue;
    }
  }
  if (params.sections === 'auto' && sectionCount) params.sections = sectionCount;
  for (const n of [1, 2, 3, 4]) params[`interior${n}`] = 'empty';
  return params;
}

function sectionCountOf(d: Record<string, unknown>): number | null {
  return Array.isArray(d.sections) && d.sections.length > 0 ? d.sections.length : null;
}

function doorTypesOf(d: Record<string, unknown>): string[] {
  return Array.isArray(d.sections)
    ? d.sections.map((s) => String((s as Record<string, unknown>).doorType ?? 'none'))
    : [];
}

/**
 * Upgrades an order draft to the current schema (dafna-order/0.2-draft). Never throws.
 * The draft is re-generated from the migrated params with the current engine; the original
 * `generatedAt` is kept and `migratedFrom` records the original schema.
 * - Door types that the D-1b hinge rule changes (e.g. 0.1 alternation L,R,L -> L,R,R) are
 *   reported as MIGRATION_DOORS_CHANGED warnings.
 * - If the old order cannot be built under the current rules (e.g. two adjacent double doors ->
 *   HINGE_CONFLICT), the result is { draft: null, issues: [the errors] }: staff must re-confirm it.
 */
export function migrateOrderDraft(
  draft: unknown,
  options: MigrationOptions = {},
): { draft: OrderDraft | null; issues: Issue[] } {
  const template = options.template ?? wardrobeTemplate;
  const catalog = options.catalog ?? materialsV0;
  const d = draft !== null && typeof draft === 'object' ? (draft as Record<string, unknown>) : {};

  if (d.schemaVersion === ORDER_SCHEMA_VERSION)
    return { draft: d as unknown as OrderDraft, issues: [] };

  const schema = d.schemaVersion;
  if (schema !== ORDER_SCHEMA_VERSION_D0 && schema !== ORDER_SCHEMA_VERSION_01) {
    return {
      draft: null,
      issues: [
        makeIssue('UNSUPPORTED_SCHEMA', 'error', undefined, { schemaVersion: String(schema) }),
      ],
    };
  }

  const issues: Issue[] = [];
  let params01: unknown = d.params;
  if (schema === ORDER_SCHEMA_VERSION_D0) {
    const step = migrateParamsFromD0(d.params, { template, catalog });
    issues.push(...step.issues);
    if (step.issues.some((i) => i.severity === 'error')) return { draft: null, issues };
    params01 = step.params;
  }
  const params = migrateParamsFrom01(params01, sectionCountOf(d), { template });

  const result = generate(template, params, catalog);
  const errors = result.issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return { draft: null, issues: [...issues, ...errors] };

  const before = doorTypesOf(d);
  result.sections.forEach((s, i) => {
    const old = before[i];
    if (old !== undefined && old !== s.doorType) {
      issues.push(
        makeIssue('MIGRATION_DOORS_CHANGED', 'warning', `doorSection${i + 1}`, {
          sectionIndex: i,
          sectionNumber: i + 1,
          from: old,
          to: s.doorType,
        }),
      );
    }
  });

  const generatedAt = typeof d.generatedAt === 'string' ? d.generatedAt : new Date(0).toISOString();
  const out = toOrderDraft(params, result, { template, catalog, now: () => new Date(generatedAt) });
  return { draft: { ...out, migratedFrom: String(schema) }, issues };
}
