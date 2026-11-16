import { PRODUCT_TEMPLATES, defaultParams, type Params } from '@dafna/engine';

/**
 * Ready-made models for the customer start screen (D-4, ADR-010; D-8: per product). ALL values
 * are unconfirmed placeholders until Dafna confirms its catalogue; every model uses the
 * product's standard sizes (template customerValues).
 */
export type ProductId = 'wardrobe' | 'pedestal' | 'desk';
export const PRODUCTS: ProductId[] = ['wardrobe', 'pedestal', 'desk'];

export interface ReadyModel {
  id: string;
  product: ProductId;
  /** i18n key of the model name */
  nameKey: string;
  /** engine parameter overrides on top of the product template defaults */
  params: Params;
  /** card fill token (bento) */
  fill: string;
}

export const PRESETS_UNCONFIRMED = true;

export const READY_MODELS: ReadyModel[] = [
  {
    id: 'compact',
    product: 'wardrobe',
    nameKey: 'model.compact',
    params: { width: 1000 },
    fill: 'var(--step-size)',
  },
  {
    id: 'classic',
    product: 'wardrobe',
    nameKey: 'model.classic',
    params: { width: 1500 },
    fill: 'var(--step-color)',
  },
  {
    id: 'wide',
    product: 'wardrobe',
    nameKey: 'model.wide',
    params: { width: 2000 },
    fill: 'var(--step-interior)',
  },
  {
    id: 'large',
    product: 'wardrobe',
    nameKey: 'model.large',
    params: { width: 2400 },
    fill: 'var(--accent-peach)',
  },
  {
    id: 'ped-drawers',
    product: 'pedestal',
    nameKey: 'model.pedDrawers',
    params: { layout: 'drawers3' },
    fill: 'var(--step-size)',
  },
  {
    id: 'ped-file',
    product: 'pedestal',
    nameKey: 'model.pedFile',
    params: { layout: 'drawers2_file' },
    fill: 'var(--step-color)',
  },
  {
    id: 'ped-door',
    product: 'pedestal',
    nameKey: 'model.pedDoor',
    params: { layout: 'door_shelf' },
    fill: 'var(--step-interior)',
  },
  {
    id: 'desk-ldsp',
    product: 'desk',
    nameKey: 'model.deskLdsp',
    params: { legs: 'ldsp' },
    fill: 'var(--step-size)',
  },
  {
    id: 'desk-lift',
    product: 'desk',
    nameKey: 'model.deskLift',
    params: { legs: 'metal_lift', width: 1700 },
    fill: 'var(--step-interior)',
  },
];

/** Full engine params of a model (its product's template defaults + the model's overrides). */
export function modelParams(model: ReadyModel): Params {
  const template = PRODUCT_TEMPLATES[model.product]!;
  return { ...defaultParams(template), ...model.params };
}
