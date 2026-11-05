export type * from './types.js';
export { ORDER_SCHEMA_VERSION, ORDER_SCHEMA_VERSION_01, ORDER_SCHEMA_VERSION_D0 } from './types.js';
export {
  wardrobeTemplate,
  defaultParams,
  getParamDef,
  getNumberConstant,
  listUnconfirmed,
  type UnconfirmedItem,
} from './template.js';
export { materialsV0, getMaterial } from './catalog.js';
export { resolveParams, clampParam, type ResolvedParams } from './params.js';
export {
  generate,
  validate,
  computeLayout,
  autoSectionCount,
  distributeEvenly,
  maxSectionInnerWidth,
  SAME_AS_CORPUS,
  WARDROBE_GENERATOR,
  type WardrobeLayout,
  type DoorLeaf,
} from './wardrobe.js';
export { toOrderDraft, type OrderDraftOptions } from './order.js';
export {
  migrateParamsFromD0,
  migrateParamsFrom01,
  migrateOrderDraft,
  type MigrationOptions,
} from './migrate.js';
export {
  planDoors,
  doorKindForLeaf,
  hingeSideFor,
  hingeMountFor,
  roundLeaves,
  type DoorPlan,
  type DoorPlanInput,
} from './doors.js';
export {
  INTERIOR_PRESETS,
  defaultPresetFor,
  evenShelfBottoms,
  planInterior,
  resolveInterior,
  slideLength,
  type InteriorConstants,
  type InteriorPlan,
  type SectionBox,
} from './interior.js';
export { interiorConstants } from './wardrobe.js';
