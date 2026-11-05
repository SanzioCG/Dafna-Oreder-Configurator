import materialsV0Json from '../catalog/materials.v0.json' with { type: 'json' };
import type { Material, MaterialCatalog } from './types.js';

/** Material catalog v0: placeholder decors (all unconfirmed) until Dafna sends its decor list. */
export const materialsV0: MaterialCatalog = materialsV0Json as MaterialCatalog;

export function getMaterial(catalog: MaterialCatalog, id: unknown): Material | undefined {
  return typeof id === 'string' ? catalog.materials.find((m) => m.id === id) : undefined;
}
