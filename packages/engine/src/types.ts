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

export type Severity = 'error' | 'warning';

export interface Issue {
  code: string;
  severity: Severity;
  paramKey?: string;
  /** i18n key, e.g. "issue.OUT_OF_RANGE" */
  messageKey: string;
  values: Record<string, number | string | boolean>;
}

export type PanelRole = 'side' | 'top' | 'bottom' | 'partition' | 'back' | 'plinth';

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
  material: string;
  position: Vec3;
  rotation: Vec3;
}

export interface Section {
  /** 0-based, left to right */
  index: number;
  innerWidthMm: number;
  innerHeightMm: number;
  innerDepthMm: number;
  /** X of the section's left inner face */
  xStartMm: number;
}

export interface GenerateResult {
  panels: Panel[];
  sections: Section[];
  issues: Issue[];
}

export interface OrderDraft {
  schemaVersion: 'dafna-order/0-draft';
  productType: 'wardrobe';
  templateVersion: string;
  params: Params;
  panels: Panel[];
  sections: Section[];
  issues: Issue[];
  generatedAt: string;
}
