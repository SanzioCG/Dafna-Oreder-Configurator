import type {
  DoorType,
  DrawerSummary,
  InteriorPreset,
  RailSummary,
  ShelfSummary,
} from './types.js';

/**
 * Interior fill per section (ADR-005). Pure functions; wardrobe.ts passes template numbers.
 * All y values are product coordinates (mm, floor = 0); a section's inner box is
 * x ∈ [xStart, xStart + innerW], y ∈ [yBottom, yTop], z ∈ [zBack, zBack + innerDepth].
 */

export const INTERIOR_PRESETS: InteriorPreset[] = [
  'empty',
  'shelves',
  'rail',
  'rail_shelf',
  'drawers_shelves',
  'rail_drawers',
];

export interface InteriorConstants {
  shelfPitchTargetMm: number;
  shelfFrontSetbackMm: number;
  railTopShelfDropMm: number;
  railAxisDropMm: number;
  railDiameterMm: number;
  drawerFrontHeightMm: number;
  drawerCount: number;
  drawerGapMm: number;
  drawerFrontSetbackMm: number;
  drawerSlideClearanceMm: number;
  drawerBoxHeightReductionMm: number;
  drawerBackClearanceMm: number;
  drawerSlideMinMm: number;
  drawerSlideMaxMm: number;
  drawerSlideStepMm: number;
  railMinDepthMm: number;
  railMinHangingHeightMm: number;
  drawerMaxFrontWidthMm: number;
}

export interface SectionBox {
  index: number;
  xStart: number;
  innerW: number;
  yBottom: number;
  yTop: number;
  zBack: number;
  innerDepth: number;
  /** corpus board thickness (shelves, drawer fronts and box sides) */
  t: number;
}

export interface InteriorPlan {
  preset: InteriorPreset;
  shelves: ShelfSummary[];
  rails: RailSummary[];
  drawers: DrawerSummary[];
  /** rail axis to the top of whatever is below it; null without a rail */
  clearHangingHeightMm: number | null;
  /** warning codes this plan produces (RAIL_DEPTH_SHORT, RAIL_HEIGHT_SHORT, ...) */
  warnings: string[];
}

/** Template default rule: single door -> shelves, double door -> rail_shelf, no door -> shelves. */
export function defaultPresetFor(doorType: DoorType): InteriorPreset {
  return doorType === 'double' ? 'rail_shelf' : 'shelves';
}

const half = (v: number) => Math.round(v * 2) / 2;

/**
 * Shelves evenly spaced between yFrom (top face of what is below) and yTo (underside of what is
 * above): compartments c = max(1, round(available / pitch)), shelves = c - 1, equal clear
 * openings; shelf bottom faces rounded to 0.5 mm.
 */
export function evenShelfBottoms(yFrom: number, yTo: number, t: number, pitch: number): number[] {
  const available = yTo - yFrom;
  if (available <= 0) return [];
  const c = Math.max(1, Math.round(available / pitch));
  const k = c - 1;
  const h = (available - k * t) / c;
  return Array.from({ length: k }, (_, i) => half(yFrom + (i + 1) * h + i * t));
}

/** Largest slide length (step, min..max) that fits the given depth. */
export function slideLength(depthAvailable: number, c: InteriorConstants): number {
  const fit = Math.floor(depthAvailable / c.drawerSlideStepMm) * c.drawerSlideStepMm;
  return Math.max(c.drawerSlideMinMm, Math.min(c.drawerSlideMaxMm, fit));
}

export function planInterior(
  box: SectionBox,
  preset: InteriorPreset,
  c: InteriorConstants,
): InteriorPlan {
  const { t, yBottom, yTop } = box;
  const n = box.index + 1;
  const shelfDepth = box.innerDepth - c.shelfFrontSetbackMm;
  const shelves: ShelfSummary[] = [];
  const rails: RailSummary[] = [];
  const drawers: DrawerSummary[] = [];
  const addShelf = (yMm: number, kind: ShelfSummary['kind'], id: string) =>
    shelves.push({ id, yMm, kind, lengthMm: box.innerW, depthMm: shelfDepth });

  const hasDrawers = preset === 'drawers_shelves' || preset === 'rail_drawers';
  const hasRail = preset === 'rail' || preset === 'rail_shelf' || preset === 'rail_drawers';
  const hasTopShelf = preset === 'rail_shelf' || preset === 'rail_drawers';

  // bottom: drawer stack + fixed shelf directly above it
  let floorY = yBottom; // top face of whatever is at the bottom of the free space
  if (hasDrawers) {
    const boxW = box.innerW - 2 * c.drawerSlideClearanceMm;
    const depth = slideLength(
      box.innerDepth - c.drawerFrontSetbackMm - t - c.drawerBackClearanceMm,
      c,
    );
    for (let i = 0; i < c.drawerCount; i++) {
      drawers.push({
        id: `s${n}-drawer-${i + 1}`,
        frontYMm: yBottom + c.drawerGapMm + i * (c.drawerFrontHeightMm + c.drawerGapMm),
        frontHeightMm: c.drawerFrontHeightMm,
        frontWidthMm: boxW,
        boxWidthMm: boxW,
        boxDepthMm: depth,
        boxHeightMm: c.drawerFrontHeightMm - c.drawerBoxHeightReductionMm,
      });
    }
    const zone = c.drawerGapMm + c.drawerCount * (c.drawerFrontHeightMm + c.drawerGapMm);
    addShelf(yBottom + zone, 'fixed', `s${n}-shelf-fixed`);
    floorY = yBottom + zone + t;
  }

  // top: shelf 400 below the top inner face, rail 60 below the shelf (or the top)
  let ceilingY = yTop; // underside of whatever is at the top of the free space
  if (hasTopShelf) {
    const shelfBottom = yTop - c.railTopShelfDropMm - t;
    addShelf(shelfBottom, 'top', `s${n}-shelf-top`);
    ceilingY = shelfBottom;
  }
  let clearHangingHeightMm: number | null = null;
  if (hasRail) {
    const axisY = ceilingY - c.railAxisDropMm;
    rails.push({
      id: `s${n}-rail`,
      axisYMm: axisY,
      lengthMm: box.innerW,
      diameterMm: c.railDiameterMm,
      zMm: box.zBack + box.innerDepth / 2,
    });
    clearHangingHeightMm = axisY - floorY;
  }

  // free space without a rail: evenly spaced removable shelves
  if (preset === 'shelves' || preset === 'drawers_shelves') {
    evenShelfBottoms(floorY, ceilingY, t, c.shelfPitchTargetMm).forEach((y, i) =>
      addShelf(y, 'removable', `s${n}-shelf-${i + 1}`),
    );
  }
  shelves.sort((a, b) => a.yMm - b.yMm);

  const warnings: string[] = [];
  if (hasRail && box.innerDepth < c.railMinDepthMm) warnings.push('RAIL_DEPTH_SHORT');
  if (hasRail && (clearHangingHeightMm ?? 0) < c.railMinHangingHeightMm) {
    warnings.push('RAIL_HEIGHT_SHORT');
  }
  if (hasDrawers && (drawers[0]?.frontWidthMm ?? 0) > c.drawerMaxFrontWidthMm) {
    warnings.push('DRAWER_SECTION_TOO_WIDE');
  }
  return { preset, shelves, rails, drawers, clearHangingHeightMm, warnings };
}

/**
 * Resolve a section's preset: an explicit choice is kept (warnings are reported); 'auto' uses
 * the default rule and falls back to 'shelves' if that would produce a warning, so 'auto' is
 * always valid (customer reset target).
 */
export function resolveInterior(
  box: SectionBox,
  choice: string,
  doorType: DoorType,
  c: InteriorConstants,
): InteriorPlan & { source: 'auto' | 'chosen' } {
  if (choice !== 'auto' && (INTERIOR_PRESETS as string[]).includes(choice)) {
    return { ...planInterior(box, choice as InteriorPreset, c), source: 'chosen' };
  }
  const preferred = planInterior(box, defaultPresetFor(doorType), c);
  if (preferred.warnings.length === 0) return { ...preferred, source: 'auto' };
  return { ...planInterior(box, 'shelves', c), source: 'auto' };
}
