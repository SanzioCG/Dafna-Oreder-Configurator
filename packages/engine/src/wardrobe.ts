import { catalogForTemplate, getMaterial, currentCatalog } from './catalog.js';
import { metalBox } from './parts.js';
import { generatorFor } from './registry.js';
import {
  partitionHidden,
  planDoors,
  planInsetDoors,
  type DoorLeaf,
  type DoorPlan,
} from './doors.js';
import {
  resolveInterior,
  type InteriorConstants,
  type InteriorPlan,
  type SectionBox,
} from './interior.js';
import { makeIssue, resolveParams } from './params.js';
import { getNumberConstant, getParamDef, getStringConstant, wardrobeTemplate } from './template.js';
import type {
  Dimensions,
  DoorType,
  GenerateResult,
  InteriorPreset,
  Issue,
  Material,
  MaterialCatalog,
  Panel,
  PanelEdges,
  Params,
  Rail,
  Section,
  Template,
  Vec3,
} from './types.js';

export const WARDROBE_GENERATOR = 'wardrobe-carcass-v4';

/** D-26: the feet (Bingo 20 mm) are drawn as small dark parts */
const FOOT_MATERIAL = 'metal_black';

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
  sectionInnerWidthsMm: number[];
  /**
   * D-15: two carcasses side by side, split after this section (0-based; the boundary is two
   * side panels instead of a partition). null = one carcass.
   */
  splitAfter: number | null;
  doorTypes: DoorType[];
  /** which doorSectionN override produced each section's door type (null = preset) */
  doorTypeSource: (string | null)[];
  doorLeaves: DoorLeaf[];
  doorHeightMm: number;
  /** D-14: leaf height in a books_lower section */
  lowerDoorHeightMm: number;
  maxShelfSpanMm: number;
  maxSingleLeafWidthMm: number;
  maxDoorHeightMm: number;
  /** interior plan per section ('auto' resolved) */
  interior: (InteriorPlan & { source: 'auto' | 'chosen' })[];
  interiorMin: { railDepth: number; railHeight: number; drawerWidth: number };
  drawerFrontSetbackMm: number;
  edgeBand: { bandId: string; thicknessMm: number };
  /** D-22: doors sit inside the section openings (doorMount = inset) */
  insetDoors: boolean;
  /** D-27: the partition right of section i stands behind the inset doors */
  hiddenPartitions: boolean[];
  /** D-27: how far a hidden partition's front edge is behind the doors */
  partitionBehindDoorMm: number;
  /** D-22 (template 0.12.0+, rule top-over-sides): the top lies on the side panels */
  topOverSides: boolean;
  /**
   * D-26 (template 0.13.0+, rule lester-carcass, Dafna's Bazis models): two edge bands, the
   * back in a groove, removable shelves 1 mm short each side, feet instead of a plinth.
   */
  lester: boolean;
  /** D-26: the bottom is full width and the sides stand on it (base = feet / none) */
  bottomFull: boolean;
  /** D-26: base = feet: their height (0 otherwise) and inset from the carcass corners */
  feetHeightMm: number;
  feetInsetMm: number;
  /** D-26: how far the back enters the groove of each panel */
  backGrooveDepthMm: number;
  /** D-26: the back sits in a groove this far from the rear edge (0 = nailed on) */
  backGrooveMm: number;
  /** Z of the interior's back (the back panel's front face) */
  interiorBackZMm: number;
  /** D-26: the thin edge band of the less visible edges (null = one band) */
  thinBand: { bandId: string; thicknessMm: number } | null;
  /**
   * D-51 (template 0.16.0+, rule lester-side-inset, Bazis): the sides stand this far in from the
   * ends of the top / bottom (each carcass) and are this much short of the carcass front
   */
  sideInsetMm: number;
  sideFrontShortMm: number;
  /** Z of the sides' front edge (= carcassFrontZMm - sideFrontShortMm): inset doors, shelves */
  interiorFrontZMm: number;
}

/** D-51: the Lester sides 2 mm in from the ends and 2 mm short at the front (0 / 0 before) */
function sideInset(template: Template): { endMm: number; frontMm: number } {
  if (!template.constructionRules.some((r) => r.id === 'lester-side-inset'))
    return { endMm: 0, frontMm: 0 };
  return {
    endMm: getNumberConstant(template, 'sideInsetMm'),
    frontMm: getNumberConstant(template, 'sideFrontShortMm'),
  };
}

/** Split `total` whole millimetres into `n` parts differing by at most 1 mm (extra mm leftmost). */
export function distributeEvenly(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => (i < remainder ? base + 1 : base));
}

/**
 * D-15: one or two carcasses. Template 0.10.0+ splits a wardrobe from splitCarcassFromWidthMm
 * on (founder's decision: 1600 mm); staff may force it with `carcasses` ('1' / '2').
 */
function carcassSplit(template: Template, params: Params, widthMm: number): boolean {
  if (template.constants.splitCarcassFromWidthMm === undefined) return false;
  const choice = String(params.carcasses ?? 'auto');
  if (choice === '1') return false;
  if (choice === '2') return true;
  return widthMm >= getNumberConstant(template, 'splitCarcassFromWidthMm');
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
 * valid: no single leaf wider than maxSingleLeafWidth). Falls back to the largest option.
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
  splitAfter: number | null = null,
): DoorPlan {
  // D-22 (template 0.12.0+): inset doors sit inside the openings with their own gap
  const inset = params.doorMount === 'inset';
  const gap = getNumberConstant(template, inset ? 'insetDoorGapMm' : 'doorGapEdgeMm');
  // D-51: the left side's inner face and the boundary at a split move in with the side inset
  const e = sideInset(template).endMm;
  return (inset ? planInsetDoors : planDoors)({
    widthMm,
    t,
    innerWidths,
    splitAfter,
    x0: e + t,
    splitGap: 2 * t + 2 * e,
    preset: String(params.doors),
    overrides: innerWidths.map((_, i) => {
      const o = params[`doorSection${i + 1}`];
      return typeof o === 'string' ? o : undefined;
    }),
    gapEdge: gap,
    gapBetween: inset ? gap : getNumberConstant(template, 'doorGapBetweenMm'),
    maxSingleLeafWidth: getNumberConstant(template, 'maxSingleLeafWidthMm'),
    rounding: getNumberConstant(template, 'doorLeafRoundingMm'),
    // D-27 (template 0.14.0+): inset leaves span the partitions between doored sections
    spanPartitions: inset && spansPartitions(template),
    lowerOnly: lowerOnlyFor(params, innerWidths.length),
  });
}

function spansPartitions(template: Template): boolean {
  return template.constructionRules.some((r) => r.id === 'inset-doors-hide-partitions');
}

/** D-27: sections whose door covers only the lower part (books_lower) */
function lowerOnlyFor(params: Params, count: number): boolean[] {
  return Array.from({ length: count }, (_, i) => params[`interior${i + 1}`] === 'books_lower');
}

/** True if the door plan has no DOOR_TOO_WIDE single leaf and no hinge conflict. */
function doorPlanValid(plan: DoorPlan, maxLeaf: number): boolean {
  return plan.leaves.every((l) => plan.types[l.sectionIndex] === 'double' || l.widthMm <= maxLeaf);
}

export function interiorConstants(template: Template): InteriorConstants {
  const n = (name: string) => getNumberConstant(template, name);
  return {
    shelfPitchTargetMm: n('shelfPitchTargetMm'),
    shelfFrontSetbackMm: n('shelfFrontSetbackMm'),
    railTopShelfDropMm: n('railTopShelfDropMm'),
    railAxisDropMm: n('railAxisDropMm'),
    railDiameterMm: n('railDiameterMm'),
    drawerFrontHeightMm: n('drawerFrontHeightMm'),
    drawerCount: n('drawerCountPerSection'),
    drawerGapMm: n('drawerGapMm'),
    drawerFrontSetbackMm: n('drawerFrontSetbackMm'),
    drawerSlideClearanceMm: n('drawerSlideClearanceMm'),
    drawerBoxHeightReductionMm: n('drawerBoxHeightReductionMm'),
    drawerBackClearanceMm: n('drawerBackClearanceMm'),
    drawerSlideMinMm: n('drawerSlideMinMm'),
    drawerSlideMaxMm: n('drawerSlideMaxMm'),
    drawerSlideStepMm: n('drawerSlideStepMm'),
    railMinDepthMm: n('railMinDepthMm'),
    railMinHangingHeightMm: n('railMinHangingHeightMm'),
    drawerMaxFrontWidthMm: n('drawerMaxFrontWidthMm'),
    ...ergonomicConstants(template),
  };
}

type ErgonomicPart = Pick<
  InteriorConstants,
  'ergonomics' | 'autoPresetSingle' | 'autoPresetDouble' | 'books'
>;

/** D-7: GOST functional sizes and 'auto' presets, only in templates that define them (0.7.0+). */
function ergonomicConstants(template: Template): ErgonomicPart {
  const has = (name: string) => template.constants[name] !== undefined;
  const out: ErgonomicPart = {};
  if (has('railTopMaxMm')) {
    const n = (name: string) => getNumberConstant(template, name);
    out.ergonomics = {
      railTopMaxMm: n('railTopMaxMm'),
      railTopToShelfMm: n('railTopToShelfMm'),
      longHangMinMm: n('longHangMinMm'),
      shortHangMinMm: n('shortHangMinMm'),
      shortHangClearMm: n('shortHangClearMm'),
      drawerTopMaxMm: n('drawerTopMaxMm'),
      minShelfGapMm: n('minShelfGapMm'),
    };
  }
  if (has('bookGapMinMm')) {
    const n = (name: string) => getNumberConstant(template, name);
    out.books = { gapMinMm: n('bookGapMinMm'), gapMaxMm: n('bookGapMaxMm') };
  }
  if (has('autoPresetDouble')) {
    out.autoPresetDouble = getStringConstant(template, 'autoPresetDouble') as InteriorPreset;
  }
  if (has('autoPresetSingle')) {
    out.autoPresetSingle = getStringConstant(template, 'autoPresetSingle') as InteriorPreset;
  }
  return out;
}

/** Derives all dimensions from a complete, valid parameter set. */
export function computeLayout(
  template: Template,
  params: Params,
  catalog: MaterialCatalog = currentCatalog,
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
  // D-26: feet (template 0.13.0+) lift the carcass like a plinth, without plinth strips
  const feetHeightMm = params.base === 'feet' ? getNumberConstant(template, 'feetHeightMm') : 0;
  const plinthHeightMm = hasPlinth ? Number(params.plinthHeight) : feetHeightMm;
  const lester = template.constructionRules.some((r) => r.id === 'lester-carcass');
  const plinthRecessMm = hasPlinth ? Number(params.plinthRecess) : 0;
  const hasBack = params.backPanel === 'hdf_overlay';
  const backThicknessMm = hasBack ? backMaterial.thicknessMm : 0;
  // D-26: the back in a groove is inside the carcass depth (not behind it)
  const backGrooveMm = lester && hasBack ? getNumberConstant(template, 'backGrooveFromRearMm') : 0;
  const backStackMm = backGrooveMm > 0 ? 0 : backThicknessMm;
  const interiorBackZMm = backGrooveMm > 0 ? backGrooveMm + backThicknessMm : backThicknessMm;
  const maxSingleLeafWidthMm = getNumberConstant(template, 'maxSingleLeafWidthMm');
  // D-15 (template 0.10.0+): wide wardrobes are two carcasses, split at the middle boundary
  const splitWanted = carcassSplit(template, params, widthMm);
  const splitFor = (n: number) => (splitWanted && n >= 2 ? Math.ceil(n / 2) - 1 : null);
  // D-51: the side insets narrow the inside (2e per carcass: both ends, and both at a split)
  const { endMm: sideE, frontMm: sideF } = sideInset(template);
  const innerFor = (n: number) =>
    distributeEvenly(
      innerTotal(widthMm - 2 * sideE, t, n) - (splitFor(n) !== null ? t + 2 * sideE : 0),
      n,
    );
  const sectionCount =
    params.sections === 'auto'
      ? autoSectionCount(
          template,
          widthMm - 2 * sideE,
          t,
          (n) =>
            params.doors === 'none' ||
            doorPlanValid(
              doorPlanFor(template, params, widthMm, t, innerFor(n), splitFor(n)),
              maxSingleLeafWidthMm,
            ),
        )
      : Number(params.sections);
  const sectionInnerWidthsMm = innerFor(sectionCount);

  const splitAfter = splitFor(sectionCount);
  const doors = doorPlanFor(template, params, widthMm, t, sectionInnerWidthsMm, splitAfter);
  const hasDoors = doors.types.some((d) => d !== 'none');
  // D-22: inset doors stand inside the carcass, so they add nothing to the depth stack
  const insetDoors = hasDoors && params.doorMount === 'inset';
  const doorThicknessMm = hasDoors ? doorMaterial.thicknessMm : 0;
  const doorGapFrontMm =
    hasDoors && !insetDoors ? getNumberConstant(template, 'doorGapFrontMm') : 0;
  const doorGapEdgeMm = getNumberConstant(
    template,
    insetDoors ? 'insetDoorGapMm' : 'doorGapEdgeMm',
  );
  const doorGapBetweenMm = insetDoors
    ? doorGapEdgeMm
    : getNumberConstant(template, 'doorGapBetweenMm');
  const carcassHeightMm = heightMm - plinthHeightMm;
  const carcassDepthMm =
    depthMm - backStackMm - (insetDoors ? 0 : doorThicknessMm) - doorGapFrontMm;
  // D-26: shelves 5 mm back in an open section, 1 mm behind an inset door (Bazis)
  const shelfSetbackFor = (index: number): { shelfSetbackMm?: number } => {
    if (template.constants.openShelfSetbackMm === undefined) return {};
    if ((doors.types[index] ?? 'none') === 'none')
      return { shelfSetbackMm: getNumberConstant(template, 'openShelfSetbackMm') };
    if (insetDoors) return { shelfSetbackMm: getNumberConstant(template, 'insetShelfSetbackMm') };
    return {};
  };
  // interior depth of a section behind an inset door: up to the door's back face
  const doorDepthIn = (index: number) =>
    insetDoors && (doors.types[index] ?? 'none') !== 'none' ? doorThicknessMm : 0;

  // D-14: a books_lower section's door height (parameter) and the door edge gap
  const ic = {
    ...interiorConstants(template),
    lowerDoorHeightMm: Number(params.lowerDoorHeight ?? 800),
    doorGapEdgeMm,
    ...(insetDoors ? { insetDoors: true } : {}),
  };
  let xs = sideE + t;
  const interior = sectionInnerWidthsMm.map((innerW, index) => {
    const box: SectionBox = {
      index,
      xStart: xs,
      innerW,
      yBottom: plinthHeightMm + t,
      yTop: heightMm - t,
      zBack: interiorBackZMm,
      innerDepth: carcassDepthMm - (interiorBackZMm - backStackMm) - doorDepthIn(index) - sideF,
      t,
      ...shelfSetbackFor(index),
    };
    xs += innerW + (index === splitAfter ? 2 * t + 2 * sideE : t);
    const choice = params[`interior${index + 1}`];
    return resolveInterior(
      box,
      typeof choice === 'string' ? choice : 'auto',
      doors.types[index] ?? 'none',
      ic,
    );
  });

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
    carcassBackZMm: backStackMm,
    carcassFrontZMm: backStackMm + carcassDepthMm,
    sectionCount,
    sectionInnerWidthsMm,
    splitAfter,
    doorTypes: doors.types,
    doorTypeSource: doors.source,
    doorLeaves: doors.leaves,
    doorHeightMm: carcassHeightMm - 2 * doorGapEdgeMm - (insetDoors ? 2 * t : 0),
    insetDoors,
    // D-27: partitions standing behind inset doors (index = the section left of the partition)
    hiddenPartitions: sectionInnerWidthsMm.map(
      (_, i) =>
        insetDoors &&
        spansPartitions(template) &&
        i < sectionCount - 1 &&
        partitionHidden(i, doors.types, lowerOnlyFor(params, sectionCount), splitAfter),
    ),
    partitionBehindDoorMm:
      template.constants.insetPartitionBehindDoorMm !== undefined
        ? getNumberConstant(template, 'insetPartitionBehindDoorMm')
        : 0,
    topOverSides: template.constructionRules.some((r) => r.id === 'top-over-sides'),
    lester,
    bottomFull: lester && !hasPlinth,
    feetHeightMm,
    feetInsetMm: feetHeightMm > 0 ? getNumberConstant(template, 'feetInsetMm') : 0,
    backGrooveMm,
    backGrooveDepthMm: backGrooveMm > 0 ? getNumberConstant(template, 'backGrooveDepthMm') : 0,
    interiorBackZMm,
    sideInsetMm: sideE,
    sideFrontShortMm: sideF,
    interiorFrontZMm: backStackMm + carcassDepthMm - sideF,
    thinBand:
      template.constants.edgeBandThinId !== undefined
        ? {
            bandId: getStringConstant(template, 'edgeBandThinId'),
            thicknessMm: getNumberConstant(template, 'edgeBandThinMm'),
          }
        : null,
    lowerDoorHeightMm: ic.lowerDoorHeightMm,
    maxShelfSpanMm: getNumberConstant(template, 'maxShelfSpanMm'),
    maxSingleLeafWidthMm,
    maxDoorHeightMm: getNumberConstant(template, 'maxDoorHeightMm'),
    interior,
    drawerFrontSetbackMm: ic.drawerFrontSetbackMm,
    interiorMin: {
      railDepth: ic.railMinDepthMm,
      railHeight: ic.railMinHangingHeightMm,
      drawerWidth: ic.drawerMaxFrontWidthMm,
    },
    edgeBand: {
      bandId: getStringConstant(template, 'edgeBandId'),
      thicknessMm: getNumberConstant(template, 'edgeBandThicknessMm'),
    },
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
  // interior warnings (only for explicitly chosen presets; 'auto' never warns)
  layout.interior.forEach((plan, index) => {
    for (const code of plan.warnings) {
      const s = layout.sectionInnerWidthsMm;
      const values: Record<string, number | string> = {
        sectionIndex: index,
        sectionNumber: index + 1,
        preset: plan.preset,
      };
      if (code === 'RAIL_DEPTH_SHORT') {
        values.innerDepthMm =
          layout.carcassDepthMm -
          layout.sideFrontShortMm -
          (layout.insetDoors && layout.doorTypes[index] !== 'none' ? layout.doorThicknessMm : 0);
        values.minMm = layout.interiorMin.railDepth;
      } else if (code === 'RAIL_HEIGHT_SHORT') {
        values.clearHangingHeightMm = plan.clearHangingHeightMm ?? 0;
        values.minMm = layout.interiorMin.railHeight;
      } else if (code === 'DRAWER_SECTION_TOO_WIDE') {
        values.frontWidthMm = plan.drawers[0]?.frontWidthMm ?? s[index] ?? 0;
        values.maxMm = layout.interiorMin.drawerWidth;
      }
      issues.push(makeIssue(code, 'warning', `interior${index + 1}`, values));
    }
  });
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

function checkTemplate(template: Template): Issue | null {
  if (template.generator !== WARDROBE_GENERATOR) {
    return makeIssue('UNSUPPORTED_TEMPLATE', 'error', undefined, {
      generator: template.generator,
    });
  }
  return null;
}

/**
 * Validates untrusted parameters. Never throws; returns issues (errors and warnings).
 * D-8: other products (pedestal, desk, …) dispatch to their registered generator; the catalog
 * defaults to the one the template was released with (catalogForTemplate).
 */
export function validate(
  params: unknown,
  template: Template = wardrobeTemplate,
  catalogIn?: MaterialCatalog,
): Issue[] {
  const catalog = catalogIn ?? catalogForTemplate(template);
  const other =
    template.generator !== WARDROBE_GENERATOR ? generatorFor(template.generator) : undefined;
  if (other) return other.validate(params, template, catalog);
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
  let x = layout.sideInsetMm + t;
  layout.sectionInnerWidthsMm.forEach((w, index) => {
    sections.push({
      index,
      innerWidthMm: w,
      innerHeightMm: layout.carcassHeightMm - 2 * t,
      innerDepthMm: layout.carcassDepthMm - layout.sideFrontShortMm,
      xStartMm: x,
      doorType: layout.doorTypes[index] ?? 'none',
      preset: layout.interior[index]?.preset ?? 'empty',
      presetSource: layout.interior[index]?.source ?? 'auto',
      shelves: layout.interior[index]?.shelves ?? [],
      rails: layout.interior[index]?.rails ?? [],
      drawers: layout.interior[index]?.drawers ?? [],
      clearHangingHeightMm: layout.interior[index]?.clearHangingHeightMm ?? null,
    });
    x += w + (index === layout.splitAfter ? 2 * t + 2 * layout.sideInsetMm : t);
  });
  return sections;
}

/** Panel before the production fields are added. */
type BasePanel = Omit<Panel, 'edges' | 'grainDirection' | 'operations'>;

function buildPanels(layout: WardrobeLayout, sections: Section[]): Panel[] {
  return [...buildCarcassAndDoors(layout, sections), ...buildInterior(layout, sections)].map((p) =>
    withProductionFields(p, layout),
  );
}

function buildCarcassAndDoors(layout: WardrobeLayout, sections: Section[]): BasePanel[] {
  const t = layout.panelThicknessMm;
  const W = layout.widthMm;
  const H = layout.heightMm;
  const ph = layout.plinthHeightMm;
  const Hc = layout.carcassHeightMm;
  const Dc = layout.carcassDepthMm;
  const zC = layout.carcassBackZMm;
  const zMid = zC + Dc / 2;
  const corpus = layout.corpusMaterial.id;
  // D-51: the sides in from the carcass ends (e) and short of its front (f)
  const e = layout.sideInsetMm;
  const f = layout.sideFrontShortMm;

  // ADR-009: side panels run the full height to the floor (with or without plinth); the
  // carcass bottom rests on the plinth strips, which sit between the sides.
  // D-15: two carcasses -> each has its own sides, top, bottom, back and plinth strips.
  const split = layout.splitAfter;
  const splitSection = split === null ? null : sections[split];
  // outer face of the left carcass's right side
  const xSplit = splitSection ? splitSection.xStartMm + splitSection.innerWidthMm + t : null;
  // D-51: with inset sides the left carcass ends e beyond its right side
  const carcasses: [number, number][] =
    xSplit === null
      ? [[0, W]]
      : [
          [0, xSplit + e],
          [xSplit + e, W],
        ];
  const suffix = (i: number) => (carcasses.length > 1 ? `-${i + 1}` : '');
  // D-22: with the top on the sides, the sides end under it
  // D-26: on feet the sides stand on the full-width bottom, between bottom and top
  const sideY0 = layout.bottomFull ? ph + t : 0;
  const sideH = (layout.topOverSides ? H - t : H) - sideY0;
  const side = (id: string, x: number): BasePanel => ({
    id,
    role: 'side',
    lengthMm: sideH,
    widthMm: Dc - f,
    thicknessMm: t,
    material: corpus,
    position: [x, sideY0 + sideH / 2, zC + (Dc - f) / 2],
    rotation: ROT_VERTICAL_YZ,
  });

  const panels: BasePanel[] = [side('side-left', e + t / 2), side('side-right', W - e - t / 2)];
  if (xSplit !== null) {
    panels.push(
      side('side-split-left', xSplit - t / 2),
      side('side-split-right', xSplit + 2 * e + t / 2),
    );
  }
  carcasses.forEach(([x0, x1], i) => {
    panels.push(
      {
        id: `bottom${suffix(i)}`,
        role: 'bottom',
        lengthMm: x1 - x0 - (layout.bottomFull ? 0 : 2 * t + 2 * e),
        widthMm: Dc,
        thicknessMm: t,
        material: corpus,
        position: [(x0 + x1) / 2, ph + t / 2, zMid],
        rotation: ROT_HORIZONTAL,
      },
      {
        id: `top${suffix(i)}`,
        role: 'top',
        lengthMm: x1 - x0 - (layout.topOverSides ? 0 : 2 * t + 2 * e),
        widthMm: Dc,
        thicknessMm: t,
        material: corpus,
        position: [(x0 + x1) / 2, H - t / 2, zMid],
        rotation: ROT_HORIZONTAL,
      },
    );
  });

  // A partition stands right of every section except the last (and the D-15 split).
  for (const s of sections.slice(0, -1)) {
    if (s.index === split) continue;
    // D-26: with the back in a groove a partition stops at the back's front face
    const pz0 = layout.backGrooveMm > 0 ? layout.interiorBackZMm : zC;
    // D-27: behind inset doors the partition stops short of the doors
    const behind = layout.hiddenPartitions[s.index]
      ? layout.doorThicknessMm + layout.partitionBehindDoorMm
      : 0;
    const pDepth = Dc - f - (pz0 - zC) - behind;
    panels.push({
      id: `partition-${s.index + 1}`,
      role: 'partition',
      lengthMm: Hc - 2 * t,
      widthMm: pDepth,
      thicknessMm: t,
      material: corpus,
      position: [s.xStartMm + s.innerWidthMm + t / 2, ph + Hc / 2, pz0 + pDepth / 2],
      rotation: ROT_VERTICAL_YZ,
    });
  }

  if (layout.hasBack) {
    const tb = layout.backThicknessMm;
    // D-26: in a groove the back enters the sides, top and bottom by grooveDepth each
    const g = layout.backGrooveMm;
    const into = g > 0 ? 2 * layout.backGrooveDepthMm : 0;
    carcasses.forEach(([x0, x1], i) => {
      panels.push({
        id: `back${suffix(i)}`,
        role: 'back',
        lengthMm: g > 0 ? x1 - x0 - 2 * t - 2 * e + into : x1 - x0,
        widthMm: g > 0 ? Hc - 2 * t + into : Hc,
        thicknessMm: tb,
        material: layout.backMaterial.id,
        position: [(x0 + x1) / 2, ph + Hc / 2, g + tb / 2],
        rotation: ROT_VERTICAL_XY,
      });
    });
  }

  // D-26: four feet per carcass, 50 mm in from the corners (Bingo 20 mm, a bought part)
  if (layout.feetHeightMm > 0) {
    const f = layout.feetHeightMm;
    const inset = layout.feetInsetMm;
    carcasses.forEach(([x0, x1], i) => {
      [x0 + inset, x1 - inset].forEach((x, a) =>
        [zC + inset, zC + Dc - inset].forEach((z, b) =>
          panels.push(
            metalBox(
              `foot${suffix(i)}-${a * 2 + b + 1}`,
              FOOT_MATERIAL,
              [24, f, 24],
              [x, f / 2, z],
            ),
          ),
        ),
      );
    });
  }

  if (layout.hasPlinth) {
    carcasses.forEach(([x0, x1], i) => {
      panels.push(
        {
          id: `plinth-front${suffix(i)}`,
          role: 'plinth',
          lengthMm: x1 - x0 - 2 * t - 2 * e,
          widthMm: ph,
          thicknessMm: t,
          material: corpus,
          position: [
            (x0 + x1) / 2,
            ph / 2,
            layout.carcassFrontZMm - f - layout.plinthRecessMm - t / 2,
          ],
          rotation: ROT_VERTICAL_XY,
        },
        {
          id: `plinth-back${suffix(i)}`,
          role: 'plinth',
          lengthMm: x1 - x0 - 2 * t - 2 * e,
          widthMm: ph,
          thicknessMm: t,
          material: corpus,
          position: [(x0 + x1) / 2, ph / 2, zC + t / 2],
          rotation: ROT_VERTICAL_XY,
        },
      );
    });
  }

  const td = layout.doorThicknessMm;
  for (const leaf of layout.doorLeaves) {
    // D-14: a books_lower section's leaf covers only the lower part, from the same bottom edge
    const lower = layout.interior[leaf.sectionIndex]?.preset === 'books_lower';
    const leafH = lower ? layout.lowerDoorHeightMm : layout.doorHeightMm;
    // D-22: an inset leaf starts on the bottom board and is flush with the carcass front
    const bottomY = ph + (layout.insetDoors ? t : 0) + layout.doorGapEdgeMm;
    const leafY = lower ? bottomY + leafH / 2 : ph + Hc / 2;
    // D-51: an inset leaf is flush with the sides' front edge
    const frontZ = layout.insetDoors ? layout.interiorFrontZMm : layout.depthMm;
    panels.push({
      id: leaf.id,
      role: 'door',
      lengthMm: leaf.widthMm,
      widthMm: leafH,
      thicknessMm: td,
      material: layout.doorMaterial.id,
      position: [leaf.xStartMm + leaf.widthMm / 2, leafY, frontZ - td / 2],
      rotation: ROT_VERTICAL_XY,
      sectionIndex: leaf.sectionIndex,
      hingeSide: leaf.hingeSide,
      hingeMount: leaf.hingeMount,
    });
  }

  return panels;
}

/** Shelves and internal drawers, section by section (left to right, bottom to top). */
function buildInterior(layout: WardrobeLayout, sections: Section[]): BasePanel[] {
  const t = layout.panelThicknessMm;
  const zBack = layout.interiorBackZMm;
  const zFront = layout.interiorFrontZMm;
  const corpus = layout.corpusMaterial.id;
  const hdf = layout.backMaterial;
  const out: BasePanel[] = [];
  for (const s of sections) {
    const plan = layout.interior[s.index];
    if (!plan) continue;
    const xMid = s.xStartMm + s.innerWidthMm / 2;
    // drawers first (they are at the bottom), then shelves bottom to top
    // D-22: behind an inset door the drawer fronts are set back from the door's back face
    const doorIn = layout.insetDoors && s.doorType !== 'none' ? layout.doorThicknessMm : 0;
    for (const d of plan.drawers) {
      const frontFaceZ = zFront - doorIn - layoutDrawerSetback(layout);
      const boxBackZ = frontFaceZ - t - d.boxDepthMm;
      const boxBottomY = d.frontYMm + (d.frontHeightMm - d.boxHeightMm) / 2;
      const boxLeft = xMid - d.boxWidthMm / 2;
      const extra = { sectionIndex: s.index };
      out.push(
        {
          id: `${d.id}-front`,
          role: 'drawer_front',
          lengthMm: d.frontWidthMm,
          widthMm: d.frontHeightMm,
          thicknessMm: t,
          material: corpus,
          position: [xMid, d.frontYMm + d.frontHeightMm / 2, frontFaceZ - t / 2],
          rotation: ROT_VERTICAL_XY,
          ...extra,
        },
        {
          id: `${d.id}-side-left`,
          role: 'drawer_side',
          lengthMm: d.boxHeightMm,
          widthMm: d.boxDepthMm,
          thicknessMm: t,
          material: corpus,
          position: [boxLeft + t / 2, boxBottomY + d.boxHeightMm / 2, boxBackZ + d.boxDepthMm / 2],
          rotation: ROT_VERTICAL_YZ,
          ...extra,
        },
        {
          id: `${d.id}-side-right`,
          role: 'drawer_side',
          lengthMm: d.boxHeightMm,
          widthMm: d.boxDepthMm,
          thicknessMm: t,
          material: corpus,
          position: [
            boxLeft + d.boxWidthMm - t / 2,
            boxBottomY + d.boxHeightMm / 2,
            boxBackZ + d.boxDepthMm / 2,
          ],
          rotation: ROT_VERTICAL_YZ,
          ...extra,
        },
        {
          id: `${d.id}-back`,
          role: 'drawer_back',
          lengthMm: d.boxWidthMm - 2 * t,
          widthMm: d.boxHeightMm,
          thicknessMm: t,
          material: corpus,
          position: [xMid, boxBottomY + d.boxHeightMm / 2, boxBackZ + t / 2],
          rotation: ROT_VERTICAL_XY,
          ...extra,
        },
        {
          id: `${d.id}-bottom`,
          role: 'drawer_bottom',
          lengthMm: d.boxWidthMm,
          widthMm: d.boxDepthMm,
          thicknessMm: hdf.thicknessMm,
          material: hdf.id,
          position: [xMid, boxBottomY - hdf.thicknessMm / 2, boxBackZ + d.boxDepthMm / 2],
          rotation: ROT_HORIZONTAL,
          ...extra,
        },
      );
    }
    for (const sh of plan.shelves) {
      out.push({
        id: sh.id,
        role: 'shelf',
        // D-26: a removable shelf is 1 mm short at each side (Bazis)
        lengthMm: layout.lester && sh.kind !== 'fixed' ? sh.lengthMm - 2 : sh.lengthMm,
        widthMm: sh.depthMm,
        thicknessMm: t,
        material: corpus,
        position: [xMid, sh.yMm + t / 2, zBack + sh.depthMm / 2],
        rotation: ROT_HORIZONTAL,
        sectionIndex: s.index,
      });
    }
  }
  return out;
}

function layoutDrawerSetback(layout: WardrobeLayout): number {
  return layout.drawerFrontSetbackMm;
}

const NO_BAND = { bandId: null, thicknessMm: null };

/**
 * Production fields (data only, for a later Bazis / GibLab export):
 * - edges: visible front edges banded (ADR-005 edge rule), others null;
 * - grainDirection: 'length' for LDSP/MDF, null for HDF (placeholder);
 * - operations: always empty (no drilling in D-1b).
 */
function withProductionFields(p: BasePanel, layout: WardrobeLayout): Panel {
  const band = { bandId: layout.edgeBand.bandId, thicknessMm: layout.edgeBand.thicknessMm };
  const allBanded = p.role === 'door' || p.role === 'drawer_front';
  const frontBanded = allBanded || ['side', 'partition', 'top', 'bottom', 'shelf'].includes(p.role);
  const edges: PanelEdges = {
    front: frontBanded ? { ...band } : { ...NO_BAND },
    back: allBanded ? { ...band } : { ...NO_BAND },
    left: allBanded ? { ...band } : { ...NO_BAND },
    right: allBanded ? { ...band } : { ...NO_BAND },
  };
  // D-22: a top lying on the sides shows its ends - banded, except where two carcasses meet
  if (layout.topOverSides && p.role === 'top') {
    if (p.id !== 'top-2') edges.left = { ...band };
    if (p.id !== 'top-1') edges.right = { ...band };
  }
  if (layout.lester && layout.thinBand) lesterBands(p, edges, band, layout);
  const isHdf = p.material === layout.backMaterial.id && layout.backMaterial.kind === 'hdf';
  return { ...p, edges, grainDirection: isHdf ? null : 'length', operations: [] };
}

/**
 * D-26 edge bands as in Dafna's Bazis models: doors and fronts 1 mm all round; top / bottom
 * 1 mm at the front and the ends (not where two carcasses meet), thin at the back; sides thin
 * front and back; partitions and fixed shelves thin at the front; removable shelves thin all
 * round; back, plinth and drawer boxes none.
 */
function lesterBands(p: BasePanel, edges: PanelEdges, thick: EdgeBandLike, layout: WardrobeLayout) {
  const thin = { ...layout.thinBand! };
  const none = { ...NO_BAND };
  const set = (f: EdgeBandLike, b: EdgeBandLike, l: EdgeBandLike, r: EdgeBandLike) => {
    edges.front = { ...f };
    edges.back = { ...b };
    edges.left = { ...l };
    edges.right = { ...r };
  };
  if (p.role === 'top' || (p.role === 'bottom' && layout.bottomFull)) {
    const base = p.id.replace(/-\d$/, '');
    const left = p.id === `${base}-2` ? none : thick;
    const right = p.id === `${base}-1` ? none : thick;
    set(thick, thin, left, right);
  } else if (p.role === 'bottom') set(thick, thin, none, none);
  else if (p.role === 'side') set(thin, thin, none, none);
  else if (p.role === 'partition') set(thin, none, none, none);
  else if (p.role === 'shelf' && p.id.includes('fixed')) set(thin, none, none, none);
  else if (p.role === 'shelf') set(thin, thin, thin, thin);
}

type EdgeBandLike = { bandId: string | null; thicknessMm: number | null };

function buildRails(layout: WardrobeLayout, sections: Section[]): Rail[] {
  const rails: Rail[] = [];
  for (const s of sections) {
    for (const r of layout.interior[s.index]?.rails ?? []) {
      rails.push({
        id: r.id,
        sectionIndex: s.index,
        lengthMm: r.lengthMm,
        diameterMm: r.diameterMm,
        position: [s.xStartMm + s.innerWidthMm / 2, r.axisYMm, r.zMm],
      });
    }
  }
  return rails;
}

function buildDimensions(layout: WardrobeLayout): Dimensions {
  return {
    widthMm: layout.widthMm,
    heightMm: layout.heightMm,
    depthMm: layout.depthMm,
    carcassHeightMm: layout.carcassHeightMm,
    carcassDepthMm: layout.carcassDepthMm,
    backThicknessMm: layout.backThicknessMm,
    // D-22: the depth stack (back + carcass + gap + door); an inset door is not in it
    doorThicknessMm: layout.insetDoors ? 0 : layout.doorThicknessMm,
    doorGapFrontMm: layout.doorGapFrontMm,
    plinthHeightMm: layout.plinthHeightMm,
  };
}

/**
 * Generates the wardrobe for untrusted parameters. Never throws on user input.
 * If any error issue exists, panels and sections are empty and dimensions is null.
 * Output is deterministic: ids and ordering are stable (sides, bottom, top, partitions L→R,
 * back, plinth front/back, door leaves L→R, then per section L→R: drawer parts bottom to top,
 * shelves bottom to top). Every panel carries edges / grainDirection / operations.
 */
export function generate(
  template: Template,
  params: unknown,
  catalogIn?: MaterialCatalog,
): GenerateResult {
  const catalog = catalogIn ?? catalogForTemplate(template);
  const other =
    template.generator !== WARDROBE_GENERATOR ? generatorFor(template.generator) : undefined;
  if (other) return other.generate(template, params, catalog);
  const issues = validate(params, template, catalog);
  if (issues.some((i) => i.severity === 'error')) {
    return { panels: [], rails: [], sections: [], issues, dimensions: null };
  }
  const { params: resolved } = resolveParams(template, params);
  const layout = computeLayout(template, resolved, catalog);
  const sections = buildSections(layout);
  return {
    panels: buildPanels(layout, sections),
    rails: buildRails(layout, sections),
    sections,
    issues,
    dimensions: buildDimensions(layout),
  };
}
