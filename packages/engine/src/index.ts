export type * from './types.js';
export {
  ORDER_SCHEMA_VERSION,
  ORDER_SCHEMA_VERSION_02,
  ORDER_SCHEMA_VERSION_01,
  ORDER_SCHEMA_VERSION_D0,
} from './types.js';
export {
  wardrobeTemplate,
  pedestalTemplate,
  deskTemplate,
  PRODUCT_TEMPLATES,
  defaultParams,
  getParamDef,
  getNumberConstant,
  listUnconfirmed,
  type UnconfirmedItem,
} from './template.js';
export {
  MATERIAL_MAP_V0_V1,
  allMaterials,
  catalogForTemplate,
  currentCatalog,
  materialsV1_1,
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
  BOOK_GAP_GOST_MIN_MM,
  bookShelfBottoms,
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
  PRODUCT_ARCHIVE,
  TEMPLATE_ARCHIVE,
  regenerateApplication,
  type RegenerateFailure,
  type RegenerateOptions,
  type RegenerateResult,
} from './regenerate.js';
export { PEDESTAL_GENERATOR } from './pedestal.js';
export { DESK_GENERATOR } from './desk.js';
export { registerGenerator, generatorFor, type ProductGenerator } from './registry.js';
export {
  boardPrice,
  computeBom,
  computePrice,
  hardwareV1,
  hingeCount,
  priceListDemo,
  type BomLine,
  type HardwareCatalog,
  type HardwareItem,
  type PriceList,
  type PriceResult,
  type PricedLine,
} from './bom.js';
