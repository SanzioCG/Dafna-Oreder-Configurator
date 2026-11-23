import wardrobeV0Json from '../templates/wardrobe.v0.json' with { type: 'json' };
import wardrobeV1Json from '../templates/wardrobe.v1.json' with { type: 'json' };
import wardrobeV2Json from '../templates/wardrobe.v2.json' with { type: 'json' };
import wardrobeV3Json from '../templates/wardrobe.v3.json' with { type: 'json' };
import wardrobeV4Json from '../templates/wardrobe.v4.json' with { type: 'json' };
import wardrobeV5Json from '../templates/wardrobe.v5.json' with { type: 'json' };
import wardrobeV6Json from '../templates/wardrobe.v6.json' with { type: 'json' };
import wardrobeV7Json from '../templates/wardrobe.v7.json' with { type: 'json' };
import wardrobeV8Json from '../templates/wardrobe.v8.json' with { type: 'json' };
import wardrobeV9Json from '../templates/wardrobe.v9.json' with { type: 'json' };
import wardrobeV10Json from '../templates/wardrobe.v10.json' with { type: 'json' };
import wardrobeV11Json from '../templates/wardrobe.v11.json' with { type: 'json' };
import pedestalV1Json from '../templates/pedestal.v1.json' with { type: 'json' };
import pedestalV2Json from '../templates/pedestal.v2.json' with { type: 'json' };
import pedestalV3Json from '../templates/pedestal.v3.json' with { type: 'json' };
import deskV1Json from '../templates/desk.v1.json' with { type: 'json' };
import deskV2Json from '../templates/desk.v2.json' with { type: 'json' };
import deskV3Json from '../templates/desk.v3.json' with { type: 'json' };
import { catalogForTemplate, materialsV0, materialsV1, materialsV1_1 } from './catalog.js';
// D-8: the pedestal and desk generators register themselves on import
import './desk.js';
import './pedestal.js';
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
  '0.6.0': wardrobeV5Json as Template,
  '0.7.0': wardrobeV6Json as Template,
  '0.8.0': wardrobeV7Json as Template,
  '0.9.0': wardrobeV8Json as Template,
  '0.10.0': wardrobeV9Json as Template,
  '0.11.0': wardrobeV10Json as Template,
  '0.12.0': wardrobeV11Json as Template,
};

/** Material catalogs by catalogVersion (same rule: archived, never edited). */
export const CATALOG_ARCHIVE: Readonly<Record<string, MaterialCatalog>> = {
  [materialsV0.catalogVersion]: materialsV0,
  [materialsV1.catalogVersion]: materialsV1,
  [materialsV1_1.catalogVersion]: materialsV1_1,
};

/**
 * D-8: every product's released templates, by templateId then templateVersion. The wardrobe
 * entry is TEMPLATE_ARCHIVE (applications before D-8 stored no templateId = wardrobe).
 */
export const PRODUCT_ARCHIVE: Readonly<Record<string, Readonly<Record<string, Template>>>> = {
  wardrobe: TEMPLATE_ARCHIVE,
  pedestal: {
    '0.1.0': pedestalV1Json as Template,
    '0.2.0': pedestalV2Json as Template,
    '0.3.0': pedestalV3Json as Template,
  },
  desk: {
    '0.1.0': deskV1Json as Template,
    '0.2.0': deskV2Json as Template,
    '0.3.0': deskV3Json as Template,
  },
};

/**
 * The catalog each template version was released with (its material ids live there). An
 * application stores only templateVersion, so this mapping is part of the archive: never edit
 * an entry, add one for every new template version.
 */
export const TEMPLATE_CATALOG: Readonly<Record<string, string>> = {
  '0.1.0': materialsV0.catalogVersion,
  '0.2.0': materialsV0.catalogVersion,
  '0.3.0': materialsV0.catalogVersion,
  '0.4.0': materialsV0.catalogVersion,
  '0.5.0': materialsV0.catalogVersion,
  '0.6.0': materialsV1.catalogVersion,
  '0.7.0': materialsV1.catalogVersion,
  '0.8.0': materialsV1.catalogVersion,
  '0.9.0': materialsV1.catalogVersion,
  '0.10.0': materialsV1.catalogVersion,
  '0.11.0': materialsV1.catalogVersion,
  '0.12.0': materialsV1.catalogVersion,
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
  // D-8 (generate() dispatches to the registered generator)
  'pedestal-v1': generate,
  'desk-v1': generate,
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
  /** D-8: product (default 'wardrobe': applications before D-8 have no templateId) */
  templateId?: string;
  /** catalog the application was made with (default: TEMPLATE_CATALOG[templateVersion]) */
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
  const templateId = options.templateId ?? 'wardrobe';
  const template = PRODUCT_ARCHIVE[templateId]?.[templateVersion];
  if (!template) return { ok: false, code: 'UNKNOWN_TEMPLATE_VERSION', templateVersion };
  const run = GENERATORS[template.generator];
  if (!run) return { ok: false, code: 'TEMPLATE_NOT_REGENERABLE', templateVersion };
  const catalogVersion =
    options.catalogVersion ??
    (templateId === 'wardrobe'
      ? (TEMPLATE_CATALOG[templateVersion] ?? '')
      : catalogForTemplate(template).catalogVersion);
  const catalog = CATALOG_ARCHIVE[catalogVersion];
  if (!catalog) return { ok: false, code: 'UNKNOWN_CATALOG_VERSION', templateVersion };
  const generatedAt = new Date(options.generatedAt ?? 0);
  const result = run(template, params, catalog);
  return {
    ok: true,
    draft: toOrderDraft(params, result, { template, catalog, now: () => generatedAt }),
  };
}
