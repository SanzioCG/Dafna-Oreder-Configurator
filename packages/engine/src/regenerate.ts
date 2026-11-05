import wardrobeV0Json from '../templates/wardrobe.v0.json' with { type: 'json' };
import wardrobeV1Json from '../templates/wardrobe.v1.json' with { type: 'json' };
import wardrobeV2Json from '../templates/wardrobe.v2.json' with { type: 'json' };
import wardrobeV3Json from '../templates/wardrobe.v3.json' with { type: 'json' };
import wardrobeV4Json from '../templates/wardrobe.v4.json' with { type: 'json' };
import { materialsV0 } from './catalog.js';
import { toOrderDraft } from './order.js';
import type { GenerateResult, MaterialCatalog, OrderDraft, Template } from './types.js';
import { generate } from './wardrobe.js';

/**
 * Every wardrobe template version ever released, by templateVersion. Templates are data
 * (ADR-002): an archived file is never edited, a change is always a new version.
 */
export const TEMPLATE_ARCHIVE: Readonly<Record<string, Template>> = {
  '0.1.0': wardrobeV0Json as Template,
  '0.2.0': wardrobeV1Json as Template,
  '0.3.0': wardrobeV2Json as Template,
  '0.4.0': wardrobeV3Json as Template,
  '0.5.0': wardrobeV4Json as Template,
};

/** Material catalogs by catalogVersion (same rule: archived, never edited). */
export const CATALOG_ARCHIVE: Readonly<Record<string, MaterialCatalog>> = {
  [materialsV0.catalogVersion]: materialsV0,
};

type Generator = (template: Template, params: unknown, catalog: MaterialCatalog) => GenerateResult;

/**
 * Generator code by template.generator id. RULE (ADR-011): once a generator has produced a
 * submitted application, its behaviour is frozen. A construction change gets a NEW generator id
 * (and template version); the old generator stays here unchanged, so every stored application
 * regenerates exactly. The application fixtures (test/fixtures/applications) enforce this.
 */
const GENERATORS: Readonly<Record<string, Generator>> = {
  'wardrobe-carcass-v4': generate,
};

/**
 * Applications (D-5) exist from template 0.5.0 on. Templates 0.1.0-0.4.0 were replaced before
 * any application was submitted; their generator code was retired in D-1a…D-3a.1, so they stay
 * loadable (TEMPLATE_ARCHIVE) and their order drafts migratable (migrateOrderDraft), but they
 * cannot be regenerated.
 */
export const REGENERABLE_SINCE = '0.5.0';

export type RegenerateFailure = {
  ok: false;
  code: 'UNKNOWN_TEMPLATE_VERSION' | 'TEMPLATE_NOT_REGENERABLE' | 'UNKNOWN_CATALOG_VERSION';
  templateVersion: string;
};
export type RegenerateResult = { ok: true; draft: OrderDraft } | RegenerateFailure;

export interface RegenerateOptions {
  /** catalog the application was made with (default: the catalog of that time, materials v0) */
  catalogVersion?: string;
  /** stored in the draft's generatedAt; default 1970-01-01T00:00:00.000Z keeps it deterministic */
  generatedAt?: string;
}

/**
 * Entry point for production / Bazis / GibLab export (future batches): rebuilds the full order
 * draft of an application from what the lead stores — compact params + templateVersion.
 * Pure and deterministic: the same input gives a deep-equal draft, today and in any later
 * engine version. Never throws on stored data.
 */
export function regenerateApplication(
  params: unknown,
  templateVersion: string,
  options: RegenerateOptions = {},
): RegenerateResult {
  const template = TEMPLATE_ARCHIVE[templateVersion];
  if (!template) return { ok: false, code: 'UNKNOWN_TEMPLATE_VERSION', templateVersion };
  const run = GENERATORS[template.generator];
  if (!run) return { ok: false, code: 'TEMPLATE_NOT_REGENERABLE', templateVersion };
  const catalog = CATALOG_ARCHIVE[options.catalogVersion ?? materialsV0.catalogVersion];
  if (!catalog) return { ok: false, code: 'UNKNOWN_CATALOG_VERSION', templateVersion };
  const generatedAt = new Date(options.generatedAt ?? 0);
  const result = run(template, params, catalog);
  return {
    ok: true,
    draft: toOrderDraft(params, result, { template, catalog, now: () => generatedAt }),
  };
}
