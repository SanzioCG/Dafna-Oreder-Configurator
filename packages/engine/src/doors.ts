import type { DoorType, HingeMount, HingeSide } from './types.js';

/**
 * Door planning (ADR-006, revised in D-1c). Pure functions, no template access: wardrobe.ts
 * passes the numbers.
 *
 * Rules:
 * - A section's door coverage runs between the centre lines of its partitions (outer carcass
 *   edge at the ends). Gaps: `gapEdge` at outer edges and next to a section without a door,
 *   `gapBetween` between neighbouring leaves (also across a partition).
 * - Leaf-width rule (single source): the SINGLE-leaf width of a section is its coverage minus
 *   its gaps. doors=auto: single if that width <= maxSingleLeafWidth, else double.
 *   DOOR_TOO_WIDE is checked on the same (rounded) leaf width.
 * - Two leaves MAY hinge on the same partition (standard practice: half-overlay hinges on both
 *   partition faces, each leaf covers half the partition). They just cannot both be fully open
 *   at once. There is no hinge conflict any more (the D-1b rule was wrong).
 * - Single doors hinge toward the outer side of their half of the wardrobe (symmetric front):
 *   1: L · 2: L,R · 3: L,L,R · 4: L,L,R,R  — the middle section of an odd count hinges left.
 *   Staff overrides (doorSectionN) are taken as given.
 * - hingeMount: 'full_overlay' if the leaf hinges on an outer side panel, 'half_overlay' if it
 *   hinges on a partition (data only, for later hardware / export).
 * - Leaf widths are rounded to `rounding` (0.5 mm); the remainder goes to the leaves that lost
 *   the most by rounding (ties: leftmost), so leaves + gaps = covered width exactly.
 */

export type DoorKind = 'single' | 'double';

export interface DoorLeaf {
  id: string;
  sectionIndex: number;
  hingeSide: HingeSide;
  hingeMount: HingeMount;
  xStartMm: number;
  widthMm: number;
}

export interface DoorPlanInput {
  widthMm: number;
  /** corpus board thickness */
  t: number;
  innerWidths: number[];
  preset: string; // 'none' | 'all_single' | 'auto'
  /** per section: staff override value ('preset' or missing = follow preset) */
  overrides: (string | undefined)[];
  gapEdge: number;
  gapBetween: number;
  maxSingleLeafWidth: number;
  rounding: number;
}

export interface DoorPlan {
  types: DoorType[];
  /** which doorSectionN override produced each section's type (null = preset) */
  source: (string | null)[];
  leaves: DoorLeaf[];
  /** nominal (unrounded) single-leaf width per section, for the auto rule */
  singleLeafWidths: number[];
}

/** doors=auto for one section, on the single-leaf width. */
export function doorKindForLeaf(singleLeafWidthMm: number, maxSingleLeafWidthMm: number): DoorKind {
  return singleLeafWidthMm <= maxSingleLeafWidthMm ? 'single' : 'double';
}

/** Hinge side of a preset single door in section `index` of `count` (outer side of its half). */
export function hingeSideFor(index: number, count: number): HingeSide {
  return index > (count - 1) / 2 ? 'right' : 'left';
}

/** Outer side panel -> full overlay; partition -> half overlay. */
export function hingeMountFor(sectionIndex: number, side: HingeSide, count: number): HingeMount {
  const outer =
    (side === 'left' && sectionIndex === 0) || (side === 'right' && sectionIndex === count - 1);
  return outer ? 'full_overlay' : 'half_overlay';
}

/** Round to `step`, distributing the remainder so the sum stays exactly `total`. */
export function roundLeaves(nominal: number[], total: number, step: number): number[] {
  const floored = nominal.map((w) => Math.floor(w / step + 1e-9) * step);
  let remainder = Math.round((total - floored.reduce((a, b) => a + b, 0)) / step);
  const order = nominal
    .map((w, i) => ({ i, loss: w - (floored[i] as number) }))
    .sort((x, y) => y.loss - x.loss || x.i - y.i);
  const out = [...floored];
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) {
    const idx = (order[k] as { i: number }).i;
    out[idx] = (out[idx] as number) + step;
  }
  for (let k = order.length - 1; remainder < 0; k = (k - 1 + order.length) % order.length) {
    const idx = (order[k] as { i: number }).i;
    out[idx] = (out[idx] as number) - step;
    remainder++;
  }
  return out;
}

export function planDoors(input: DoorPlanInput): DoorPlan {
  const { widthMm: W, t, innerWidths, gapEdge, gapBetween } = input;
  const n = innerWidths.length;

  // coverage of each section (partition centre lines / outer edges)
  const left: number[] = [];
  const right: number[] = [];
  let xStart = t;
  innerWidths.forEach((inner, i) => {
    left.push(i === 0 ? 0 : xStart - t / 2);
    right.push(i === n - 1 ? W : xStart + inner + t / 2);
    xStart += inner + t;
  });

  // which sections have a door at all
  const source: (string | null)[] = [];
  const fixed: (DoorType | null)[] = [];
  innerWidths.forEach((_, i) => {
    const o = input.overrides[i];
    if (o && o !== 'preset') {
      fixed.push(o as DoorType);
      source.push(`doorSection${i + 1}`);
    } else {
      fixed.push(null);
      source.push(null);
    }
  });
  const hasDoor = fixed.map((f) => (f ? f !== 'none' : input.preset !== 'none'));
  const gapL = (i: number) => (i === 0 || !hasDoor[i - 1] ? gapEdge : gapBetween / 2);
  const gapR = (i: number) => (i === n - 1 || !hasDoor[i + 1] ? gapEdge : gapBetween / 2);
  const singleLeafWidths = innerWidths.map(
    (_, i) => (right[i] as number) - gapR(i) - ((left[i] as number) + gapL(i)),
  );

  const types: DoorType[] = innerWidths.map((_, i) => {
    const f = fixed[i];
    if (f) return f;
    if (!hasDoor[i]) return 'none';
    const kind =
      input.preset === 'all_single'
        ? 'single'
        : doorKindForLeaf(singleLeafWidths[i] as number, input.maxSingleLeafWidth);
    if (kind === 'double') return 'double';
    return hingeSideFor(i, n) === 'left' ? 'single_left' : 'single_right';
  });

  // leaves per run of doored sections, rounded so that leaves + gaps = covered width exactly
  const leaves: DoorLeaf[] = [];
  for (let i = 0; i < n;) {
    if (types[i] === 'none') {
      i++;
      continue;
    }
    let j = i;
    while (j < n && types[j] !== 'none') j++;
    const startX = (left[i] as number) + gapL(i);
    const endX = (right[j - 1] as number) - gapR(j - 1);
    const meta: { sectionIndex: number; hingeSide: HingeSide; id: string; nominal: number }[] = [];
    for (let k = i; k < j; k++) {
      const w = singleLeafWidths[k] as number;
      const num = k + 1;
      if (types[k] === 'double') {
        const half = (w - gapBetween) / 2;
        meta.push({ sectionIndex: k, hingeSide: 'left', id: `door-${num}-left`, nominal: half });
        meta.push({ sectionIndex: k, hingeSide: 'right', id: `door-${num}-right`, nominal: half });
      } else {
        meta.push({
          sectionIndex: k,
          hingeSide: types[k] === 'single_left' ? 'left' : 'right',
          id: `door-${num}`,
          nominal: w,
        });
      }
    }
    const total = endX - startX - (meta.length - 1) * gapBetween;
    const widths = roundLeaves(
      meta.map((m) => m.nominal),
      total,
      input.rounding,
    );
    let x = startX;
    meta.forEach((m, k) => {
      const w = widths[k] as number;
      leaves.push({
        id: m.id,
        sectionIndex: m.sectionIndex,
        hingeSide: m.hingeSide,
        hingeMount: hingeMountFor(m.sectionIndex, m.hingeSide, n),
        xStartMm: x,
        widthMm: w,
      });
      x += w + gapBetween;
    });
    i = j;
  }

  return { types, source, leaves, singleLeafWidths };
}
