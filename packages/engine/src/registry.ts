import type { GenerateResult, Issue, MaterialCatalog, Template } from './types.js';

/**
 * D-8: generator registry for products other than the wardrobe (office pedestal, desk, …).
 * generate() / validate() (wardrobe.ts) dispatch here when template.generator is not the
 * wardrobe generator, so every caller keeps one entry point: generate(template, params).
 * A registered generator follows the ADR-011 freeze rule like the wardrobe one.
 */
export interface ProductGenerator {
  validate(params: unknown, template: Template, catalog: MaterialCatalog): Issue[];
  generate(template: Template, params: unknown, catalog: MaterialCatalog): GenerateResult;
}

const REGISTRY = new Map<string, ProductGenerator>();

export function registerGenerator(id: string, generator: ProductGenerator): void {
  REGISTRY.set(id, generator);
}

export function generatorFor(id: string): ProductGenerator | undefined {
  return REGISTRY.get(id);
}
