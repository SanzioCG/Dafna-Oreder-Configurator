import { materialsV0 } from './catalog.js';
import { toOrderDraft } from './order.js';
import { makeIssue } from './params.js';
import { defaultParams, wardrobeTemplate } from './template.js';
import {
  ORDER_SCHEMA_VERSION,
  ORDER_SCHEMA_VERSION_01,
  ORDER_SCHEMA_VERSION_02,
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
 *   0.1  (dafna-order/0.1-draft) --migrateParamsFrom01-->  0.2 params
 *   0.2  (dafna-order/0.2-draft) --migrateParamsFrom02-->  0.3 params  --generate--> 0.3 draft
 * Rule: a migration never silently changes what was ordered. Door types / hinge sides of the
 * old draft are kept (as doorSectionN overrides where the current auto rule differs); only a
 * door that is no longer valid (single leaf > 600 mm) is changed, and that is reported
 * (MIGRATION_DOORS_CHANGED warning).
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

/**
 * 0.2 params (template 0.3.0) -> 0.3 params (template 0.4.0).
 * - sections: 'auto' is pinned to the old section count (D-1c's auto rule picks fewer sections
 *   than D-1b's, e.g. 1360: 3 -> 2).
 * - Everything else (including depth, which was always stored explicitly) is copied.
 */
export function migrateParamsFrom02(
  params02: unknown,
  sectionCount: number | null,
  options: MigrationOptions = {},
): Params {
  const template = options.template ?? wardrobeTemplate;
  const raw: Record<string, unknown> =
    params02 !== null && typeof params02 === 'object' ? (params02 as Record<string, unknown>) : {};
  const params: Params = { ...defaultParams(template) };
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      params[key] = value as ParamValue;
    }
  }
  if (params.sections === 'auto' && sectionCount) params.sections = sectionCount;
  return params;
}

const DOOR_TYPES = ['single_left', 'single_right', 'double', 'none'];

/**
 * Keep the old draft's door types: where the current rules would give a different type for a
 * section without an explicit override, pin the old type as a doorSectionN override. If that
 * override is invalid now (DOOR_TOO_WIDE), drop it again and report MIGRATION_DOORS_CHANGED.
 */
function preserveDoors(
  params: Params,
  oldTypes: string[],
  template: Template,
  catalog: MaterialCatalog,
): { params: Params; issues: Issue[] } {
  const out: Params = { ...params };
  const pinned: number[] = [];
  const first = generate(template, out, catalog);
  first.sections.forEach((s, i) => {
    const old = oldTypes[i];
    const key = `doorSection${i + 1}`;
    const explicit = typeof params[key] === 'string' && params[key] !== 'preset';
    if (old && DOOR_TYPES.includes(old) && old !== s.doorType && !explicit && i < 4) {
      out[key] = old;
      pinned.push(i);
    }
  });
  // drop every pinned override that is invalid now, then read the resulting types once
  const check = generate(template, out, catalog);
  const dropped: { i: number; from: string }[] = [];
  for (const i of pinned) {
    const key = `doorSection${i + 1}`;
    if (check.issues.some((x) => x.severity === 'error' && x.paramKey === key)) {
      dropped.push({ i, from: String(out[key]) });
      out[key] = 'preset';
    }
  }
  const final = dropped.length > 0 ? generate(template, out, catalog) : check;
  const issues: Issue[] = dropped.map(({ i, from }) =>
    makeIssue('MIGRATION_DOORS_CHANGED', 'warning', `doorSection${i + 1}`, {
      sectionIndex: i,
      sectionNumber: i + 1,
      from,
      to: final.sections[i]?.doorType ?? 'none',
    }),
  );
  return { params: out, issues };
}

/** Template version that introduced sides to the floor + plinth strips between the sides. */
export const CONSTRUCTION_CHANGED_IN = '0.5.0';

/** true if `version` (x.y.z) is older than `than`; unknown versions count as older. */
export function templateBefore(version: string | null, than: string): boolean {
  if (!version) return true;
  const a = version.split('.').map(Number);
  const b = than.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/** Current-schema params (any template of the same schema): copied over the defaults. */
function migrateParamsCurrent(raw: unknown, template: Template): Params {
  const src: Record<string, unknown> =
    raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const params: Params = { ...defaultParams(template) };
  for (const [key, value] of Object.entries(src)) {
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      params[key] = value as ParamValue;
    }
  }
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
 * Upgrades an order draft to the current schema (dafna-order/0.3-draft). Never throws.
 * The draft is re-generated from the migrated params with the current engine; the original
 * `generatedAt` is kept and `migratedFrom` records the original schema. Door types and hinge
 * sides of the old draft are preserved (see preserveDoors); remaining errors return
 * { draft: null, issues }.
 */
export function migrateOrderDraft(
  draft: unknown,
  options: MigrationOptions = {},
): { draft: OrderDraft | null; issues: Issue[] } {
  const template = options.template ?? wardrobeTemplate;
  const catalog = options.catalog ?? materialsV0;
  const d = draft !== null && typeof draft === 'object' ? (draft as Record<string, unknown>) : {};

  const fromTemplate = typeof d.templateVersion === 'string' ? d.templateVersion : null;
  if (d.schemaVersion === ORDER_SCHEMA_VERSION && fromTemplate === template.templateVersion)
    return { draft: d as unknown as OrderDraft, issues: [] };

  const schema = d.schemaVersion;
  if (
    schema !== ORDER_SCHEMA_VERSION &&
    schema !== ORDER_SCHEMA_VERSION_D0 &&
    schema !== ORDER_SCHEMA_VERSION_01 &&
    schema !== ORDER_SCHEMA_VERSION_02
  ) {
    return {
      draft: null,
      issues: [
        makeIssue('UNSUPPORTED_SCHEMA', 'error', undefined, { schemaVersion: String(schema) }),
      ],
    };
  }

  const issues: Issue[] = [];
  const count = sectionCountOf(d);
  let params: Params;
  if (schema === ORDER_SCHEMA_VERSION) {
    // same schema, older template (0.4.0): params unchanged, only the construction differs
    params = migrateParamsCurrent(d.params, template);
  } else if (schema === ORDER_SCHEMA_VERSION_02) {
    params = migrateParamsFrom02(d.params, count, { template });
  } else {
    let params01: unknown = d.params;
    if (schema === ORDER_SCHEMA_VERSION_D0) {
      const step = migrateParamsFromD0(d.params, { template, catalog });
      issues.push(...step.issues);
      if (step.issues.some((i) => i.severity === 'error')) return { draft: null, issues };
      params01 = step.params;
    }
    params = migrateParamsFrom02(migrateParamsFrom01(params01, count, { template }), count, {
      template,
    });
  }

  const kept = preserveDoors(params, doorTypesOf(d), template, catalog);
  params = kept.params;
  issues.push(...kept.issues);

  const result = generate(template, params, catalog);
  const errors = result.issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return { draft: null, issues: [...issues, ...errors] };

  // ADR-009: drafts made before template 0.5.0 had the sides standing on the plinth. With a
  // plinth the regenerated panels differ (side length, plinth strip length) — never silently.
  if (params.base === 'plinth' && templateBefore(fromTemplate, CONSTRUCTION_CHANGED_IN)) {
    issues.push(
      makeIssue('MIGRATION_CONSTRUCTION_CHANGED', 'warning', 'base', {
        from: fromTemplate ?? 'unknown',
        to: template.templateVersion,
      }),
    );
  }

  const generatedAt = typeof d.generatedAt === 'string' ? d.generatedAt : new Date(0).toISOString();
  const out = toOrderDraft(params, result, { template, catalog, now: () => new Date(generatedAt) });
  return { draft: { ...out, migratedFrom: String(schema) }, issues };
}
