import { materialsV0 } from './catalog.js';
import { toOrderDraft } from './order.js';
import { makeIssue } from './params.js';
import { defaultParams, wardrobeTemplate } from './template.js';
import {
  ORDER_SCHEMA_VERSION,
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
 * D-0 params (template 0.1.0) -> current params.
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
 * Upgrades an order draft to the current schema (dafna-order/0.1-draft).
 * D-0 drafts are re-generated from their migrated params with the current engine; the original
 * `generatedAt` is kept and `migratedFrom` records the old schema. Never throws.
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

  if (d.schemaVersion !== ORDER_SCHEMA_VERSION_D0) {
    return {
      draft: null,
      issues: [
        makeIssue('UNSUPPORTED_SCHEMA', 'error', undefined, {
          schemaVersion: String(d.schemaVersion),
        }),
      ],
    };
  }

  const migrated = migrateParamsFromD0(d.params, { template, catalog });
  if (migrated.issues.some((i) => i.severity === 'error')) {
    return { draft: null, issues: migrated.issues };
  }
  const result = generate(template, migrated.params, catalog);
  const generatedAt = typeof d.generatedAt === 'string' ? d.generatedAt : new Date(0).toISOString();
  const out = toOrderDraft(migrated.params, result, {
    template,
    catalog,
    now: () => new Date(generatedAt),
  });
  return { draft: { ...out, migratedFrom: ORDER_SCHEMA_VERSION_D0 }, issues: migrated.issues };
}
