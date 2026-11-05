import { resolveParams } from './params.js';
import { wardrobeTemplateV0 } from './template.js';
import type { GenerateResult, OrderDraft, Template } from './types.js';

export interface OrderDraftOptions {
  template?: Template;
  /** Injectable clock for deterministic output (tests). */
  now?: () => Date;
}

/** Builds the order draft JSON. Contains no price fields (price comes in a later batch). */
export function toOrderDraft(
  params: unknown,
  result: GenerateResult,
  options: OrderDraftOptions = {},
): OrderDraft {
  const template = options.template ?? wardrobeTemplateV0;
  const now = options.now ?? (() => new Date());
  return {
    schemaVersion: 'dafna-order/0-draft',
    productType: 'wardrobe',
    templateVersion: template.templateVersion,
    params: resolveParams(template, params).params,
    panels: result.panels,
    sections: result.sections,
    issues: result.issues,
    generatedAt: now().toISOString(),
  };
}
