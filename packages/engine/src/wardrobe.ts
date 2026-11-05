import { makeIssue, resolveParams } from './params.js';
import {
  getNumberConstant,
  getParamDef,
  getStringConstant,
  wardrobeTemplateV0,
} from './template.js';
import type { GenerateResult, Issue, Panel, Params, Section, Template, Vec3 } from './types.js';

export const WARDROBE_GENERATOR = 'wardrobe-carcass-v0';

/** Rotations (degrees, XYZ) from the panel local frame (L→X, T→Y, W→Z) to product axes. */
const ROT_HORIZONTAL: Vec3 = [0, 0, 0]; // length X, thickness Y, width Z
const ROT_VERTICAL_YZ: Vec3 = [0, 0, 90]; // length Y, thickness X, width Z  (sides, partitions)
const ROT_VERTICAL_XY: Vec3 = [90, 0, 0]; // length X, width Y, thickness Z  (back, plinth)

export interface WardrobeLayout {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  panelThicknessMm: number;
  hasPlinth: boolean;
  plinthHeightMm: number;
  plinthRecessMm: number;
  hasBack: boolean;
  backThicknessMm: number;
  /** height - plinth height */
  carcassHeightMm: number;
  /** depth - back thickness */
  carcassDepthMm: number;
  /** Z of the carcass back face */
  carcassBackZMm: number;
  sectionCount: number;
  sectionInnerWidthsMm: number[];
  maxShelfSpanMm: number;
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

/** Derives all carcass dimensions from a complete, valid parameter set. */
export function computeLayout(template: Template, params: Params): WardrobeLayout {
  const widthMm = Number(params.width);
  const heightMm = Number(params.height);
  const depthMm = Number(params.depth);
  const t = Number(params.panelThickness);
  const hasPlinth = params.base === 'plinth';
  const plinthHeightMm = hasPlinth ? Number(params.plinthHeight) : 0;
  const plinthRecessMm = hasPlinth ? Number(params.plinthRecess) : 0;
  const hasBack = params.backPanel === 'hdf_overlay';
  const backThicknessMm = hasBack ? getNumberConstant(template, 'backPanelThicknessMm') : 0;
  const sectionCount =
    params.sections === 'auto' ? autoSectionCount(template, widthMm, t) : Number(params.sections);

  return {
    widthMm,
    heightMm,
    depthMm,
    panelThicknessMm: t,
    hasPlinth,
    plinthHeightMm,
    plinthRecessMm,
    hasBack,
    backThicknessMm,
    carcassHeightMm: heightMm - plinthHeightMm,
    carcassDepthMm: depthMm - backThicknessMm,
    carcassBackZMm: backThicknessMm,
    sectionCount,
    sectionInnerWidthsMm: distributeEvenly(innerTotal(widthMm, t, sectionCount), sectionCount),
    maxShelfSpanMm: getNumberConstant(template, 'maxShelfSpanMm'),
  };
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
export function validate(params: unknown, template: Template = wardrobeTemplateV0): Issue[] {
  const templateIssue = checkTemplate(template);
  if (templateIssue) return [templateIssue];
  const resolved = resolveParams(template, params);
  if (resolved.issues.some((i) => i.severity === 'error')) return resolved.issues;
  return [...resolved.issues, ...layoutIssues(computeLayout(template, resolved.params))];
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
    });
    x += w + t;
  });
  return sections;
}

function buildPanels(template: Template, layout: WardrobeLayout, sections: Section[]): Panel[] {
  const t = layout.panelThicknessMm;
  const W = layout.widthMm;
  const H = layout.heightMm;
  const D = layout.depthMm;
  const ph = layout.plinthHeightMm;
  const Hc = layout.carcassHeightMm;
  const Dc = layout.carcassDepthMm;
  const zC = layout.carcassBackZMm;
  const zMid = zC + Dc / 2;
  const carcass = getStringConstant(template, 'carcassMaterial');

  const panels: Panel[] = [
    {
      id: 'side-left',
      role: 'side',
      lengthMm: Hc,
      widthMm: Dc,
      thicknessMm: t,
      material: carcass,
      position: [t / 2, ph + Hc / 2, zMid],
      rotation: ROT_VERTICAL_YZ,
    },
    {
      id: 'side-right',
      role: 'side',
      lengthMm: Hc,
      widthMm: Dc,
      thicknessMm: t,
      material: carcass,
      position: [W - t / 2, ph + Hc / 2, zMid],
      rotation: ROT_VERTICAL_YZ,
    },
    {
      id: 'bottom',
      role: 'bottom',
      lengthMm: W - 2 * t,
      widthMm: Dc,
      thicknessMm: t,
      material: carcass,
      position: [W / 2, ph + t / 2, zMid],
      rotation: ROT_HORIZONTAL,
    },
    {
      id: 'top',
      role: 'top',
      lengthMm: W - 2 * t,
      widthMm: Dc,
      thicknessMm: t,
      material: carcass,
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
      material: carcass,
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
      material: getStringConstant(template, 'backMaterial'),
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
        material: carcass,
        position: [W / 2, ph / 2, D - layout.plinthRecessMm - t / 2],
        rotation: ROT_VERTICAL_XY,
      },
      {
        id: 'plinth-back',
        role: 'plinth',
        lengthMm: W,
        widthMm: ph,
        thicknessMm: t,
        material: carcass,
        position: [W / 2, ph / 2, zC + t / 2],
        rotation: ROT_VERTICAL_XY,
      },
    );
  }

  return panels;
}

/**
 * Generates the carcass for untrusted parameters. Never throws on user input.
 * If any error issue exists, panels and sections are empty. Output is deterministic:
 * ids and ordering are stable (sides, bottom, top, partitions L→R, back, plinth front/back).
 */
export function generate(template: Template, params: unknown): GenerateResult {
  const issues = validate(params, template);
  if (issues.some((i) => i.severity === 'error')) return { panels: [], sections: [], issues };
  const { params: resolved } = resolveParams(template, params);
  const layout = computeLayout(template, resolved);
  const sections = buildSections(layout);
  return { panels: buildPanels(template, layout, sections), sections, issues };
}
