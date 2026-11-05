import { getMaterial, materialsV0 } from './catalog.js';
import { planDoors, type DoorLeaf, type DoorPlan, type HingeConflict } from './doors.js';
import { makeIssue, resolveParams } from './params.js';
import { getNumberConstant, getParamDef, getStringConstant, wardrobeTemplate } from './template.js';
import type {
  Dimensions,
  DoorType,
  GenerateResult,
  Issue,
  Material,
  MaterialCatalog,
  Panel,
  Params,
  Section,
  Template,
  Vec3,
} from './types.js';

export const WARDROBE_GENERATOR = 'wardrobe-carcass-v2';

/** Rotations (degrees, XYZ) from the panel local frame (L→X, T→Y, W→Z) to product axes. */
const ROT_HORIZONTAL: Vec3 = [0, 0, 0]; // length X, thickness Y, width Z
const ROT_VERTICAL_YZ: Vec3 = [0, 0, 90]; // length Y, thickness X, width Z  (sides, partitions)
const ROT_VERTICAL_XY: Vec3 = [90, 0, 0]; // length X, width Y, thickness Z  (back, plinth, doors)

export const SAME_AS_CORPUS = 'same_as_corpus';

export type { DoorLeaf } from './doors.js';

export interface WardrobeLayout {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  corpusMaterial: Material;
  doorMaterial: Material;
  backMaterial: Material;
  /** corpus board thickness (from corpusMaterial) */
  panelThicknessMm: number;
  hasPlinth: boolean;
  plinthHeightMm: number;
  plinthRecessMm: number;
  hasBack: boolean;
  backThicknessMm: number;
  hasDoors: boolean;
  doorThicknessMm: number;
  doorGapFrontMm: number;
  doorGapEdgeMm: number;
  doorGapBetweenMm: number;
  /** height - plinth height */
  carcassHeightMm: number;
  /** depth - back - (doors ? door + doorGapFront : 0)  — ADR-003 */
  carcassDepthMm: number;
  /** Z of the carcass back face */
  carcassBackZMm: number;
  /** Z of the carcass front edge */
  carcassFrontZMm: number;
  sectionCount: number;
  /** sections param was 'auto' (used to attribute HINGE_CONFLICT) */
  sectionsWereAuto: boolean;
  sectionInnerWidthsMm: number[];
  doorTypes: DoorType[];
  /** which doorSectionN override produced each section's door type (null = preset) */
  doorTypeSource: (string | null)[];
  doorLeaves: DoorLeaf[];
  /** partitions where two leaves would hinge (only with invalid overrides / section counts) */
  hingeConflicts: HingeConflict[];
  doorHeightMm: number;
  maxShelfSpanMm: number;
  maxSingleLeafWidthMm: number;
  maxDoorHeightMm: number;
}

/** Split `total` whole millimetres into `n` parts differing by at most 1 mm (extra mm leftmost). */
export function distributeEvenly(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => (i < remainder ? base + 1 : base));
}

function innerTotal(widthMm: number, t: number, n: number): number {
  return widthMm - (n + 1) * t;
}

/** Largest section inner width for `n` sections (integer distribution). */
export function maxSectionInnerWidth(widthMm: number, t: number, n: number): number {
  return Math.ceil(innerTotal(widthMm, t, n) / n);
}

/**
 * Minimum section count from the template's numeric `sections` options that keeps every section
 * inner width <= maxShelfSpanMm and, if given, satisfies `acceptable(n)` (the door layout is
 * valid: no DOOR_TOO_WIDE, no HINGE_CONFLICT). Falls back to the largest option.
 */
export function autoSectionCount(
  template: Template,
  widthMm: number,
  t: number,
  acceptable: (n: number) => boolean = () => true,
): number {
  const maxSpan = getNumberConstant(template, 'maxShelfSpanMm');
  const counts = (getParamDef(template, 'sections')?.options ?? [])
    .filter((o): o is number => typeof o === 'number')
    .sort((a, b) => a - b);
  for (const n of counts) {
    if (maxSectionInnerWidth(widthMm, t, n) <= maxSpan && acceptable(n)) return n;
  }
  return counts[counts.length - 1] ?? 1;
}

function doorPlanFor(
  template: Template,
  params: Params,
  widthMm: number,
  t: number,
  innerWidths: number[],
): DoorPlan {
  return planDoors({
    widthMm,
    t,
    innerWidths,
    preset: String(params.doors),
    overrides: innerWidths.map((_, i) => {
      const o = params[`doorSection${i + 1}`];
      return typeof o === 'string' ? o : undefined;
    }),
    gapEdge: getNumberConstant(template, 'doorGapEdgeMm'),
    gapBetween: getNumberConstant(template, 'doorGapBetweenMm'),
    maxSingleLeafWidth: getNumberConstant(template, 'maxSingleLeafWidthMm'),
    rounding: getNumberConstant(template, 'doorLeafRoundingMm'),
  });
}

/** True if the door plan has no DOOR_TOO_WIDE single leaf and no hinge conflict. */
function doorPlanValid(plan: DoorPlan, maxLeaf: number): boolean {
  if (plan.conflicts.length > 0) return false;
  return plan.leaves.every((l) => plan.types[l.sectionIndex] === 'double' || l.widthMm <= maxLeaf);
}

/** Derives all dimensions from a complete, valid parameter set. */
export function computeLayout(
  template: Template,
  params: Params,
  catalog: MaterialCatalog = materialsV0,
): WardrobeLayout {
  const corpusMaterial = requireMaterial(catalog, params.corpusMaterial);
  const doorMaterial = requireMaterial(
    catalog,
    params.doorMaterial === SAME_AS_CORPUS ? params.corpusMaterial : params.doorMaterial,
  );
  const backMaterial = requireMaterial(catalog, getStringConstant(template, 'backMaterial'));

  const widthMm = Number(params.width);
  const heightMm = Number(params.height);
  const depthMm = Number(params.depth);
  const t = corpusMaterial.thicknessMm;
  const hasPlinth = params.base === 'plinth';
  const plinthHeightMm = hasPlinth ? Number(params.plinthHeight) : 0;
  const plinthRecessMm = hasPlinth ? Number(params.plinthRecess) : 0;
  const hasBack = params.backPanel === 'hdf_overlay';
  const backThicknessMm = hasBack ? backMaterial.thicknessMm : 0;
  const maxSingleLeafWidthMm = getNumberConstant(template, 'maxSingleLeafWidthMm');
  const innerFor = (n: number) => distributeEvenly(innerTotal(widthMm, t, n), n);
  const sectionCount =
    params.sections === 'auto'
      ? autoSectionCount(
          template,
          widthMm,
          t,
          (n) =>
            params.doors === 'none' ||
            doorPlanValid(
              doorPlanFor(template, params, widthMm, t, innerFor(n)),
              maxSingleLeafWidthMm,
            ),
        )
      : Number(params.sections);
  const sectionInnerWidthsMm = innerFor(sectionCount);

  const doors = doorPlanFor(template, params, widthMm, t, sectionInnerWidthsMm);
  const hasDoors = doors.types.some((d) => d !== 'none');
  const doorThicknessMm = hasDoors ? doorMaterial.thicknessMm : 0;
  const doorGapFrontMm = hasDoors ? getNumberConstant(template, 'doorGapFrontMm') : 0;
  const doorGapEdgeMm = getNumberConstant(template, 'doorGapEdgeMm');
  const doorGapBetweenMm = getNumberConstant(template, 'doorGapBetweenMm');
  const carcassHeightMm = heightMm - plinthHeightMm;
  const carcassDepthMm = depthMm - backThicknessMm - doorThicknessMm - doorGapFrontMm;

  return {
    widthMm,
    heightMm,
    depthMm,
    corpusMaterial,
    doorMaterial,
    backMaterial,
    panelThicknessMm: t,
    hasPlinth,
    plinthHeightMm,
    plinthRecessMm,
    hasBack,
    backThicknessMm,
    hasDoors,
    doorThicknessMm,
    doorGapFrontMm,
    doorGapEdgeMm,
    doorGapBetweenMm,
    carcassHeightMm,
    carcassDepthMm,
    carcassBackZMm: backThicknessMm,
    carcassFrontZMm: backThicknessMm + carcassDepthMm,
    sectionCount,
    sectionsWereAuto: params.sections === 'auto',
    sectionInnerWidthsMm,
    doorTypes: doors.types,
    doorTypeSource: doors.source,
    doorLeaves: doors.leaves,
    hingeConflicts: doors.conflicts,
    doorHeightMm: carcassHeightMm - 2 * doorGapEdgeMm,
    maxShelfSpanMm: getNumberConstant(template, 'maxShelfSpanMm'),
    maxSingleLeafWidthMm,
    maxDoorHeightMm: getNumberConstant(template, 'maxDoorHeightMm'),
  };
}

function requireMaterial(catalog: MaterialCatalog, id: unknown): Material {
  const m = getMaterial(catalog, id);
  // validate() reports MATERIAL_UNKNOWN before computeLayout is ever reached with a bad id.
  if (!m) throw new Error(`Unknown material "${String(id)}"`);
  return m;
}

/** Material params must reference catalog entries of an allowed kind; back material too. */
function materialIssues(template: Template, params: Params, catalog: MaterialCatalog): Issue[] {
  const issues: Issue[] = [];
  for (const def of template.parameters) {
    if (!def.materialKinds) continue;
    const value = params[def.key];
    if (value === SAME_AS_CORPUS) continue;
    const m = getMaterial(catalog, value);
    if (!m || !def.materialKinds.includes(m.kind)) {
      issues.push(makeIssue('MATERIAL_UNKNOWN', 'error', def.key, { material: String(value) }));
    }
  }
  const back = getStringConstant(template, 'backMaterial');
  if (!getMaterial(catalog, back)) {
    issues.push(makeIssue('MATERIAL_UNKNOWN', 'error', undefined, { material: back }));
  }
  return issues;
}

function layoutIssues(layout: WardrobeLayout): Issue[] {
  const issues: Issue[] = [];
  const innerHeight = layout.carcassHeightMm - 2 * layout.panelThicknessMm;
  const minWidth = Math.min(...layout.sectionInnerWidthsMm);
  if (minWidth <= 0 || innerHeight <= 0 || layout.carcassDepthMm <= 0) {
    issues.push(
      makeIssue('GEOMETRY_INVALID', 'error', undefined, {
        minSectionInnerWidthMm: minWidth,
        innerHeightMm: innerHeight,
        carcassDepthMm: layout.carcassDepthMm,
      }),
    );
    return issues;
  }
  layout.sectionInnerWidthsMm.forEach((w, index) => {
    if (w > layout.maxShelfSpanMm) {
      issues.push(
        makeIssue('SHELF_SPAN', 'warning', 'sections', {
          sectionIndex: index,
          sectionNumber: index + 1,
          innerWidthMm: w,
          maxMm: layout.maxShelfSpanMm,
        }),
      );
    }
  });
  // DOOR_TOO_WIDE: measured on the (rounded) single leaf — same width the auto rule uses
  for (const leaf of layout.doorLeaves) {
    const index = leaf.sectionIndex;
    if (layout.doorTypes[index] === 'double' || leaf.widthMm <= layout.maxSingleLeafWidthMm)
      continue;
    issues.push(
      makeIssue('DOOR_TOO_WIDE', 'error', layout.doorTypeSource[index] ?? 'doors', {
        sectionIndex: index,
        sectionNumber: index + 1,
        leafWidthMm: leaf.widthMm,
        maxMm: layout.maxSingleLeafWidthMm,
      }),
    );
  }
  // HINGE_CONFLICT: two leaves on one partition (bad override, or an explicit section count
  // whose auto layout needs two adjacent double doors)
  for (const c of layout.hingeConflicts) {
    issues.push(
      makeIssue('HINGE_CONFLICT', 'error', c.source ?? hingeParamKey(layout), {
        partitionNumber: c.partitionNumber,
        sectionNumber: c.partitionNumber,
        nextSectionNumber: c.partitionNumber + 1,
      }),
    );
  }
  if (layout.hasDoors && layout.doorHeightMm > layout.maxDoorHeightMm) {
    issues.push(
      makeIssue('DOOR_TOO_HEIGHT', 'warning', 'height', {
        doorHeightMm: layout.doorHeightMm,
        maxMm: layout.maxDoorHeightMm,
      }),
    );
  }
  return issues;
}

/** Without a responsible override, the explicit section count is what makes doors collide. */
function hingeParamKey(layout: WardrobeLayout): string {
  return layout.sectionsWereAuto ? 'doors' : 'sections';
}

function checkTemplate(template: Template): Issue | null {
  if (template.generator !== WARDROBE_GENERATOR) {
    return makeIssue('UNSUPPORTED_TEMPLATE', 'error', undefined, {
      generator: template.generator,
    });
  }
  return null;
}

/** Validates untrusted parameters. Never throws; returns issues (errors and warnings). */
export function validate(
  params: unknown,
  template: Template = wardrobeTemplate,
  catalog: MaterialCatalog = materialsV0,
): Issue[] {
  const templateIssue = checkTemplate(template);
  if (templateIssue) return [templateIssue];
  const resolved = resolveParams(template, params);
  if (resolved.issues.some((i) => i.severity === 'error')) return resolved.issues;
  const matIssues = materialIssues(template, resolved.params, catalog);
  if (matIssues.length > 0) return [...resolved.issues, ...matIssues];
  return [...resolved.issues, ...layoutIssues(computeLayout(template, resolved.params, catalog))];
}

function buildSections(layout: WardrobeLayout): Section[] {
  const t = layout.panelThicknessMm;
  const sections: Section[] = [];
  let x = t;
  layout.sectionInnerWidthsMm.forEach((w, index) => {
    sections.push({
      index,
      innerWidthMm: w,
      innerHeightMm: layout.carcassHeightMm - 2 * t,
      innerDepthMm: layout.carcassDepthMm,
      xStartMm: x,
      doorType: layout.doorTypes[index] ?? 'none',
    });
    x += w + t;
  });
  return sections;
}

function buildPanels(layout: WardrobeLayout, sections: Section[]): Panel[] {
  const t = layout.panelThicknessMm;
  const W = layout.widthMm;
  const H = layout.heightMm;
  const ph = layout.plinthHeightMm;
  const Hc = layout.carcassHeightMm;
  const Dc = layout.carcassDepthMm;
  const zC = layout.carcassBackZMm;
  const zMid = zC + Dc / 2;
  const corpus = layout.corpusMaterial.id;

  const panels: Panel[] = [
    {
      id: 'side-left',
      role: 'side',
      lengthMm: Hc,
      widthMm: Dc,
      thicknessMm: t,
      material: corpus,
      position: [t / 2, ph + Hc / 2, zMid],
      rotation: ROT_VERTICAL_YZ,
    },
    {
      id: 'side-right',
      role: 'side',
      lengthMm: Hc,
      widthMm: Dc,
      thicknessMm: t,
      material: corpus,
      position: [W - t / 2, ph + Hc / 2, zMid],
      rotation: ROT_VERTICAL_YZ,
    },
    {
      id: 'bottom',
      role: 'bottom',
      lengthMm: W - 2 * t,
      widthMm: Dc,
      thicknessMm: t,
      material: corpus,
      position: [W / 2, ph + t / 2, zMid],
      rotation: ROT_HORIZONTAL,
    },
    {
      id: 'top',
      role: 'top',
      lengthMm: W - 2 * t,
      widthMm: Dc,
      thicknessMm: t,
      material: corpus,
      position: [W / 2, H - t / 2, zMid],
      rotation: ROT_HORIZONTAL,
    },
  ];

  // A partition stands right of every section except the last.
  for (const s of sections.slice(0, -1)) {
    panels.push({
      id: `partition-${s.index + 1}`,
      role: 'partition',
      lengthMm: Hc - 2 * t,
      widthMm: Dc,
      thicknessMm: t,
      material: corpus,
      position: [s.xStartMm + s.innerWidthMm + t / 2, ph + Hc / 2, zMid],
      rotation: ROT_VERTICAL_YZ,
    });
  }

  if (layout.hasBack) {
    const tb = layout.backThicknessMm;
    panels.push({
      id: 'back',
      role: 'back',
      lengthMm: W,
      widthMm: Hc,
      thicknessMm: tb,
      material: layout.backMaterial.id,
      position: [W / 2, ph + Hc / 2, tb / 2],
      rotation: ROT_VERTICAL_XY,
    });
  }

  if (layout.hasPlinth) {
    panels.push(
      {
        id: 'plinth-front',
        role: 'plinth',
        lengthMm: W,
        widthMm: ph,
        thicknessMm: t,
        material: corpus,
        position: [W / 2, ph / 2, layout.carcassFrontZMm - layout.plinthRecessMm - t / 2],
        rotation: ROT_VERTICAL_XY,
      },
      {
        id: 'plinth-back',
        role: 'plinth',
        lengthMm: W,
        widthMm: ph,
        thicknessMm: t,
        material: corpus,
        position: [W / 2, ph / 2, zC + t / 2],
        rotation: ROT_VERTICAL_XY,
      },
    );
  }

  const td = layout.doorThicknessMm;
  for (const leaf of layout.doorLeaves) {
    panels.push({
      id: leaf.id,
      role: 'door',
      lengthMm: leaf.widthMm,
      widthMm: layout.doorHeightMm,
      thicknessMm: td,
      material: layout.doorMaterial.id,
      position: [leaf.xStartMm + leaf.widthMm / 2, ph + Hc / 2, layout.depthMm - td / 2],
      rotation: ROT_VERTICAL_XY,
      sectionIndex: leaf.sectionIndex,
      hingeSide: leaf.hingeSide,
    });
  }

  return panels;
}

function buildDimensions(layout: WardrobeLayout): Dimensions {
  return {
    widthMm: layout.widthMm,
    heightMm: layout.heightMm,
    depthMm: layout.depthMm,
    carcassHeightMm: layout.carcassHeightMm,
    carcassDepthMm: layout.carcassDepthMm,
    backThicknessMm: layout.backThicknessMm,
    doorThicknessMm: layout.doorThicknessMm,
    doorGapFrontMm: layout.doorGapFrontMm,
    plinthHeightMm: layout.plinthHeightMm,
  };
}

/**
 * Generates the wardrobe for untrusted parameters. Never throws on user input.
 * If any error issue exists, panels and sections are empty and dimensions is null.
 * Output is deterministic: ids and ordering are stable (sides, bottom, top, partitions L→R,
 * back, plinth front/back, door leaves L→R).
 */
export function generate(
  template: Template,
  params: unknown,
  catalog: MaterialCatalog = materialsV0,
): GenerateResult {
  const issues = validate(params, template, catalog);
  if (issues.some((i) => i.severity === 'error')) {
    return { panels: [], sections: [], issues, dimensions: null };
  }
  const { params: resolved } = resolveParams(template, params);
  const layout = computeLayout(template, resolved, catalog);
  const sections = buildSections(layout);
  return {
    panels: buildPanels(layout, sections),
    sections,
    issues,
    dimensions: buildDimensions(layout),
  };
}
