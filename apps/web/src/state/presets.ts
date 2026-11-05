import { defaultParams, type Params } from '@dafna/engine';
import { TEMPLATE } from './useConfigurator';

/**
 * Ready-made models for the customer start screen (D-4, ADR-010). ALL values are unconfirmed
 * placeholders until Dafna confirms its catalogue: widths only; height, depth, doors and the
 * interior come from the template defaults (interior "auto" = the recommended fill).
 */
export interface ReadyModel {
  id: 'compact' | 'classic' | 'wide' | 'large';
  /** i18n key of the model name */
  nameKey: string;
  /** engine parameter overrides on top of the template defaults */
  params: Params;
  /** card fill token (bento) */
  fill: string;
}

export const PRESETS_UNCONFIRMED = true;

export const READY_MODELS: ReadyModel[] = [
  { id: 'compact', nameKey: 'model.compact', params: { width: 1000 }, fill: 'var(--step-size)' },
  { id: 'classic', nameKey: 'model.classic', params: { width: 1500 }, fill: 'var(--step-color)' },
  { id: 'wide', nameKey: 'model.wide', params: { width: 2000 }, fill: 'var(--step-interior)' },
  { id: 'large', nameKey: 'model.large', params: { width: 2400 }, fill: 'var(--accent-peach)' },
];

/** Full engine params of a model (template defaults + the model's overrides). */
export function modelParams(model: ReadyModel): Params {
  return { ...defaultParams(TEMPLATE), ...model.params };
}
