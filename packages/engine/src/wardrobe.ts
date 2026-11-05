import { getMaterial, materialsV0 } from './catalog.js';
import { makeIssue, resolveParams } from './params.js';
import { getNumberConstant, getParamDef, getStringConstant, wardrobeTemplate } from './template.js';
import type {
  Dimensions,
  DoorType,
  GenerateResult,
  HingeSide,
  Issue,
  Material,
  MaterialCatalog,
  Panel,
  Params,
  Section,
  Template,
  Vec3,
} from './types.js';

export const WARDROBE_GENERATOR = 'wardrobe-carcass-v1';

/** Rotations (degrees, XYZ) from the panel local frame (L→X, T→Y, W→Z) to product axes. */
const ROT_HORIZONTAL: Vec3 = [0, 0, 0]; // length X, thickness Y, width Z
const ROT_VERTICAL_YZ: Vec3 = [0, 0, 90]; // length Y, thickness X, width Z  (sides, partitions)
const ROT_VERTICAL_XY: Vec3 = [90, 0, 0]; // length X, width Y, thickness Z  (back, plinth, doors)

export const SAME_AS_CORPUS = 'same_as_corpus';

export interface DoorLeaf {
  id: string;
  sectionIndex: number;
  hingeSide: HingeSide;
  xStartMm: number;
  widthMm: number;
}

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
  doorTypes: DoorType[];
  /** which doorSectionN override produced each section's door type (null = preset) */
  doorTypeSource: (string | null)[];
  doorLeaves: DoorLeaf[];
  doorHeightMm: number;
  maxShelfSpanMm: number;
  maxSingleDoorWidthMm: number;
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
 * inner width <= maxShelfSpanMm. Falls back to the largest option.
 */
export function autoSectionCount(template: Template, widthMm: number, t: number): number {
  const maxSpan = getNumberConstant(template, 'maxShelfSpanMm');
  const counts = (getParamDef(template, 'sections')?.options ?? [])
    .filter((o): o is number => typeof o === 'number')
    .sort((a, b) => a - b);
  for (const n of counts) {
    if (maxSectionInnerWidth(widthMm, t, n) <= maxSpan) return n;
  }
  return counts[counts.length - 1] ?? 1;
}

/** doors=auto rule for one section: opening <= maxSingleDoorWidth -> single, wider -> double. */
export function autoDoorKind(
  innerWidthMm: number,
  maxSingleDoorWidthMm: number,
): 'single' | 'double' {
  return innerWidthMm <= maxSingleDoorWidthMm ? 'single' : 'double';
}

/**
 * Resolves the door type of every section: staff override (doorSectionN) wins, otherwise the
 * preset. Preset single doors alternate hinge side left, right, left, ... from the left.
 */
export function resolveDoorTypes(
  params: Params,
  innerWidths: number[],
  maxSingleDoorWidthMm: number,
): { types: DoorType[]; source: (string | null)[] } {
  const types: DoorType[] = [];
  const source: (string | null)[] = [];
  let singles = 0;
  innerWidths.forEach((w, i) => {
    const key = `doorSection${i + 1}`;
    const override = params[key];
    if (typeof override === 'string' && override !== 'preset') {
      types.push(override as DoorType);
      source.push(key);
      return;
    }
    source.push(null);
    const kind =
      params.doors === 'none'
        ? 'none'
        : params.doors === 'all_single'
          ? 'single'
          : autoDoorKind(w, maxSingleDoorWidthMm);
    if (kind === 'single') {
      types.push(singles % 2 === 0 ? 'single_left' : 'single_right');
      singles += 1;
    } else {
      types.push(kind);
    }
  });
  return { types, source };
}

function buildDoorLeaves(
  W: number,
  t: number,
  innerWidths: number[],
  types: DoorType[],
  gapEdge: number,
  gapBetween: number,
): DoorLeaf[] {
  const leaves: DoorLeaf[] = [];
  const n = innerWidths.length;
  let xStart = t;
  innerWidths.forEach((inner, i) => {
    // Coverage of section i: from the centre line of the partition on its left (or the outer
    // edge) to the centre line of the partition on its right (or the outer edge).
    const left = i === 0 ? 0 : xStart - t / 2;
    const right = i === n - 1 ? W : xStart + inner + t / 2;
    const gapAt = (neighbour: number) =>
      neighbour < 0 || neighbour >= n || types[neighbour] === 'none' ? gapEdge : gapBetween / 2;
    const gL = gapAt(i - 1);
    const gR = gapAt(i + 1);
    const type = types[i];
    const num = i + 1;
    if (type === 'single_left' || type === 'single_right') {
      leaves.push({
        id: `door-${num}`,
        sectionIndex: i,
        hingeSide: type === 'single_left' ? 'left' : 'right',
        xStartMm: left + gL,
        widthMm: right - gR - (left + gL),
      });
    } else if (type === 'double') {
      const mid = (left + right) / 2;
      leaves.push(
        {
          id: `door-${num}-left`,
          sectionIndex: i,
          hingeSide: 'left',
          xStartMm: left + gL,
          widthMm: mid - gapBetween / 2 - (left + gL),
        },
        {
          id: `door-${num}-right`,
          sectionIndex: i,
          hingeSide: 'right',
          xStartMm: mid + gapBetween / 2,
          widthMm: right - gR - (mid + gapBetween / 2),
        },
      );
    }
    xStart += inner + t;
  });
  return leaves;
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
  const sectionCount =
    params.sections === 'auto' ? autoSectionCount(template, widthMm, t) : Number(params.sections);
  const sectionInnerWidthsMm = distributeEvenly(innerTotal(widthMm, t, sectionCount), sectionCount);

  const maxSingleDoorWidthMm = getNumberConstant(template, 'maxSingleDoorWidthMm');
  const doors = resolveDoorTypes(params, sectionInnerWidthsMm, maxSingleDoorWidthMm);
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
    sectionInnerWidthsMm,
    doorTypes: doors.types,
    doorTypeSource: doors.source,
    doorLeaves: buildDoorLeaves(
      widthMm,
      t,
      sectionInnerWidthsMm,
      doors.types,
      doorGapEdgeMm,
      doorGapBetweenMm,
    ),
    doorHeightMm: carcassHeightMm - 2 * doorGapEdgeMm,
    maxShelfSpanMm: getNumberConstant(template, 'maxShelfSpanMm'),
    maxSingleDoorWidthMm,
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
  layout.doorTypes.forEach((type, index) => {
    const inner = layout.sectionInnerWidthsMm[index] ?? 0;
    if (
      (type === 'single_left' || type === 'single_right') &&
      inner > layout.maxSingleDoorWidthMm
    ) {
      const leaf = layout.doorLeaves.find((l) => l.sectionIndex === index);
      issues.push(
        makeIssue('DOOR_TOO_WIDE', 'error', layout.doorTypeSource[index] ?? 'doors', {
          sectionIndex: index,
          sectionNumber: index + 1,
          innerWidthMm: inner,
          leafWidthMm: leaf?.widthMm ?? 0,
          maxMm: layout.maxSingleDoorWidthMm,
        }),
      );
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
