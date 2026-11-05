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
  /** UI hint: "swatch" = enum of material ids shown as colour swatches */
  control?: 'swatch';
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

export type PanelRole = 'side' | 'top' | 'bottom' | 'partition' | 'back' | 'plinth' | 'door';
export type DoorType = 'none' | 'single_left' | 'single_right' | 'double';
export type HingeSide = 'left' | 'right';

export type Vec3 = [number, number, number];

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

export const ORDER_SCHEMA_VERSION = 'dafna-order/0.1-draft';
export const ORDER_SCHEMA_VERSION_D0 = 'dafna-order/0-draft';

export interface OrderDraft {
  schemaVersion: typeof ORDER_SCHEMA_VERSION;
  productType: 'wardrobe';
  templateVersion: string;
  catalogVersion: string;
  params: Params;
  materials: OrderDraftMaterials;
  doors: OrderDraftDoor[];
  dimensions: Dimensions | null;
  panels: Panel[];
  sections: Section[];
  issues: Issue[];
  generatedAt: string;
  /** set when the draft was produced by migrating an older schema */
  migratedFrom?: string;
}
