/** All lengths are millimetres. See packages/engine/README.md for the coordinate system. */

export type ParamType = 'int' | 'enum' | 'bool';
export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

export interface ParamDef {
  key: string;
  type: ParamType;
  default: ParamValue;
  /** int only */
  min?: number;
  /** int only */
  max?: number;
  /** int only: UI increment (slider / stepper). Not a validation constraint. */
  step?: number;
  /** enum only */
  options?: ParamValue[];
  unit?: string;
  /** i18n key of the label */
  labelKey: string;
  /** UI step (wizard page) this parameter belongs to, e.g. "size" */
  uiStep: string;
  customerVisible: boolean;
  /** true = assumed value, not yet confirmed by Dafna production */
  unconfirmed: boolean;
  note?: string;
  /** UI hint: "swatch" = material swatches, "presetCards" = illustrated preset cards */
  control?: 'swatch' | 'presetCards';
  /** enum of material ids: catalog kinds allowed for this parameter */
  materialKinds?: MaterialKind[];
  /** 1-based section number this parameter applies to (UI hides it if there are fewer sections) */
  appliesToSection?: number;
}

export interface TemplateConstant {
  value: number | string;
  unit?: string;
  unconfirmed: boolean;
  note?: string;
}

export interface ConstructionRule {
  id: string;
  unconfirmed: boolean;
  note: string;
}

export interface Template {
  templateId: string;
  templateVersion: string;
  productType: string;
  generator: string;
  units: 'mm';
  parameters: ParamDef[];
  constants: Record<string, TemplateConstant>;
  constructionRules: ConstructionRule[];
}

export type MaterialKind = 'ldsp' | 'hdf' | 'mdf';

export interface Material {
  id: string;
  kind: MaterialKind;
  /** i18n key of the decor name */
  decorName: string;
  thicknessMm: number;
  colorHex: string;
  /** null until real decor textures exist */
  textureUrl: string | null;
  /** false = staff-only (e.g. back panel HDF, legacy 18 mm board) */
  customerVisible: boolean;
  unconfirmed: boolean;
  note?: string;
}

export interface MaterialCatalog {
  catalogVersion: string;
  materials: Material[];
}

export type Severity = 'error' | 'warning';

export interface Issue {
  code: string;
  severity: Severity;
  paramKey?: string;
  /** i18n key, e.g. "issue.OUT_OF_RANGE" */
  messageKey: string;
  values: Record<string, number | string | boolean>;
}

export type PanelRole =
  | 'side'
  | 'top'
  | 'bottom'
  | 'partition'
  | 'back'
  | 'plinth'
  | 'door'
  | 'shelf'
  | 'drawer_front'
  | 'drawer_side'
  | 'drawer_back'
  | 'drawer_bottom';
export type DoorType = 'none' | 'single_left' | 'single_right' | 'double';
export type HingeSide = 'left' | 'right';

export type Vec3 = [number, number, number];

/**
 * Edge banding of one panel edge. Edge names are in the panel's LOCAL frame: front = +width
 * side (local +Z), back = -width side, left = -length end (local -X), right = +length end.
 * For top/bottom/sides/partitions/shelves the local front edge faces the customer (+Z).
 */
export interface EdgeBand {
  bandId: string | null;
  thicknessMm: number | null;
}

export interface PanelEdges {
  front: EdgeBand;
  back: EdgeBand;
  left: EdgeBand;
  right: EdgeBand;
}

export type GrainDirection = 'length' | 'width' | null;

/**
 * Machining operations — TYPED PLACEHOLDERS for a later Bazis / GibLab export. No operation is
 * generated yet; do not invent hole patterns without Dafna production data.
 */
export interface DrillingOperation {
  kind: 'drilling';
  /** which panel face: 'top' = local +Y, 'bottom' = local -Y, or an edge name */
  face: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';
  /** position on that face, mm from the panel's local min corner */
  xMm: number;
  yMm: number;
  diameterMm: number;
  depthMm: number;
}

export interface GrooveOperation {
  kind: 'groove';
  face: 'top' | 'bottom';
  /** offset of the groove from the local back edge, mm */
  offsetMm: number;
  widthMm: number;
  depthMm: number;
}

export type Operation = DrillingOperation | GrooveOperation;

export type InteriorPreset =
  'empty' | 'shelves' | 'rail' | 'rail_shelf' | 'drawers_shelves' | 'rail_drawers';

export interface ShelfSummary {
  /** panel id */
  id: string;
  /** y of the shelf's bottom face (mm, floor = 0) */
  yMm: number;
  /** removable (on pins), fixed (above drawers), top (above a rail) */
  kind: 'removable' | 'fixed' | 'top';
  lengthMm: number;
  depthMm: number;
}

export interface RailSummary {
  id: string;
  axisYMm: number;
  lengthMm: number;
  diameterMm: number;
  zMm: number;
}

export interface DrawerSummary {
  /** id prefix of the drawer's panels (…-front, …-side-left, …) */
  id: string;
  frontYMm: number;
  frontHeightMm: number;
  frontWidthMm: number;
  boxWidthMm: number;
  boxDepthMm: number;
  boxHeightMm: number;
}

/** Hanging rail — a part, not a board. position = centre of the rail axis (mm). */
export interface Rail {
  id: string;
  sectionIndex: number;
  lengthMm: number;
  diameterMm: number;
  position: Vec3;
}

/**
 * A rectangular board. In its local frame the board is centred at the origin with
 * length along local X, thickness along local Y and width along local Z (a board lying flat).
 * `position` is the board centre in product coordinates (mm); `rotation` is an Euler rotation
 * in degrees, order XYZ, from the local frame to product axes.
 */
export interface Panel {
  id: string;
  role: PanelRole;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  /** material id from the catalog */
  material: string;
  position: Vec3;
  rotation: Vec3;
  /** doors only: 0-based section index */
  sectionIndex?: number;
  /** doors only */
  hingeSide?: HingeSide;
  /** production data (D-1b): edge banding per local edge */
  edges: PanelEdges;
  /** grain along the panel length / width; null = no grain (HDF) */
  grainDirection: GrainDirection;
  /** machining operations — always empty in D-1b (typed placeholder) */
  operations: Operation[];
}

export interface Section {
  /** 0-based, left to right */
  index: number;
  innerWidthMm: number;
  innerHeightMm: number;
  innerDepthMm: number;
  /** X of the section's left inner face */
  xStartMm: number;
  /** door type actually used for this section (preset/auto/override resolved) */
  doorType: DoorType;
  /** interior preset actually used ('auto' resolved by the template default rule) */
  preset: InteriorPreset;
  presetSource: 'auto' | 'chosen';
  shelves: ShelfSummary[];
  rails: RailSummary[];
  drawers: DrawerSummary[];
  /** rail axis to the top of what is below it; null without a rail */
  clearHangingHeightMm: number | null;
}

/** Overall and derived dimensions; staff mode shows the depth breakdown from these. */
export interface Dimensions {
  widthMm: number;
  heightMm: number;
  /** overall outer depth = back + carcass + door gap + door */
  depthMm: number;
  carcassHeightMm: number;
  carcassDepthMm: number;
  backThicknessMm: number;
  /** 0 when there are no doors */
  doorThicknessMm: number;
  /** 0 when there are no doors */
  doorGapFrontMm: number;
  plinthHeightMm: number;
}

export interface GenerateResult {
  panels: Panel[];
  /** hanging rails (non-panel parts) */
  rails: Rail[];
  sections: Section[];
  issues: Issue[];
  /** null when params have errors */
  dimensions: Dimensions | null;
}

export interface OrderDraftMaterials {
  corpus: Material | null;
  doors: Material | null;
  back: Material | null;
}

export interface OrderDraftDoor {
  sectionIndex: number;
  type: DoorType;
  /** panel ids of the leaves, left to right */
  leaves: string[];
}

export const ORDER_SCHEMA_VERSION = 'dafna-order/0.2-draft';
export const ORDER_SCHEMA_VERSION_01 = 'dafna-order/0.1-draft';
export const ORDER_SCHEMA_VERSION_D0 = 'dafna-order/0-draft';

/** Interior of one section in the order draft (D-1b). */
export interface OrderDraftInterior {
  sectionIndex: number;
  preset: InteriorPreset;
  presetSource: 'auto' | 'chosen';
  shelves: ShelfSummary[];
  rails: RailSummary[];
  drawers: DrawerSummary[];
  clearHangingHeightMm: number | null;
}

export interface OrderDraft {
  schemaVersion: typeof ORDER_SCHEMA_VERSION;
  productType: 'wardrobe';
  templateVersion: string;
  catalogVersion: string;
  params: Params;
  materials: OrderDraftMaterials;
  doors: OrderDraftDoor[];
  /** interior per section (0.2) */
  interior: OrderDraftInterior[];
  dimensions: Dimensions | null;
  /** panels incl. edges / grainDirection / operations (0.2) */
  panels: Panel[];
  /** hanging rails (0.2) */
  rails: Rail[];
  sections: Section[];
  issues: Issue[];
  generatedAt: string;
  /** set when the draft was produced by migrating an older schema */
  migratedFrom?: string;
}
