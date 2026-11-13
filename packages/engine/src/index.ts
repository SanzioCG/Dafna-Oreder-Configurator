export type * from './types.js';
export {
  ORDER_SCHEMA_VERSION,
  ORDER_SCHEMA_VERSION_02,
  ORDER_SCHEMA_VERSION_01,
  ORDER_SCHEMA_VERSION_D0,
} from './types.js';
export {
  wardrobeTemplate,
  defaultParams,
  getParamDef,
  getNumberConstant,
  listUnconfirmed,
  type UnconfirmedItem,
} from './template.js';
export {
  MATERIAL_MAP_V0_V1,
  currentCatalog,
  getMaterial,
  materialsV0,
  materialsV1,
} from './catalog.js';
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
  migrateParamsFrom02,
  migrateOrderDraft,
  mapMaterialsV0toV1,
  MATERIALS_CHANGED_IN,
  INTERIOR_CHANGED_IN,
  INTERIOR_MAP_07,
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
  type Ergonomics,
  slideLength,
  type InteriorConstants,
  type InteriorPlan,
  type SectionBox,
} from './interior.js';
export { interiorConstants } from './wardrobe.js';
export {
  CATALOG_ARCHIVE,
  REGENERABLE_SINCE,
  TEMPLATE_CATALOG,
  TEMPLATE_ARCHIVE,
  regenerateApplication,
  type RegenerateFailure,
  type RegenerateOptions,
  type RegenerateResult,
} from './regenerate.js';
