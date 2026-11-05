import type { DoorType, HingeSide } from './types.js';

/**
 * Door planning (ADR-006). Pure functions, no template access: wardrobe.ts passes the numbers.
 *
 * Rules (D-1b, supersede D-1a):
 * - A section's door coverage runs between the centre lines of its partitions (outer carcass
 *   edge at the ends). Gaps: `gapEdge` at outer edges and next to a section without a door,
 *   `gapBetween` between neighbouring leaves (also across a partition).
 * - Leaf-width rule (single source): the SINGLE-leaf width of a section is its coverage minus
 *   its gaps. doors=auto: single if that width <= maxSingleLeafWidth, else double.
 *   DOOR_TOO_WIDE is checked on the same (rounded) leaf width.
 * - Hinge rule: no two leaves may hinge on the same partition. A single hinged right followed
 *   by a single hinged left would share the partition; so would a double next to a double.
 *   Within a run of doored sections the valid patterns are  L* D? R*  (at most one double).
 *   Free singles get L for the first max(1, floor(m/2)) sections of a run, R for the rest:
 *   1: L · 2: L,R · 3: L,R,R · 4: L,L,R,R  (adjacent singles meet in the middle).
 *   A run of one section in the right half of the wardrobe hinges right instead.
 * - Leaf widths are rounded to `rounding` (0.5 mm); the remainder goes to the leaves that lost
 *   the most by rounding (ties: leftmost), so leaves + gaps = covered width exactly.
 */

export type DoorKind = 'single' | 'double';
type Slot = 'L' | 'R' | 'D' | 'F'; // fixed left/right single, double, free (preset) single

export interface DoorLeaf {
  id: string;
  sectionIndex: number;
  hingeSide: HingeSide;
  xStartMm: number;
  widthMm: number;
}

export interface HingeConflict {
  /** 1-based partition number (partition k is between section k and k+1) */
  partitionNumber: number;
  /** override param that caused it, or null when the preset/section count did */
  source: string | null;
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
  conflicts: HingeConflict[];
  /** nominal (unrounded) single-leaf width per section, for the auto rule */
  singleLeafWidths: number[];
}

/** doors=auto for one section, on the single-leaf width. */
export function doorKindForLeaf(singleLeafWidthMm: number, maxSingleLeafWidthMm: number): DoorKind {
  return singleLeafWidthMm <= maxSingleLeafWidthMm ? 'single' : 'double';
}

/** Default split of a run of m free singles: first max(1, floor(m/2)) hinge left. */
export function defaultLeftCount(m: number): number {
  return m <= 0 ? 0 : Math.max(1, Math.floor(m / 2));
}

/**
 * Assign hinge sides to one run of doored sections; null if the hinge rule cannot be met.
 * `leftCount` = preferred number of left-hinged free singles (default split).
 */
export function assignRun(
  slots: Slot[],
  leftCount: number = defaultLeftCount(slots.length),
): ('L' | 'R' | 'D')[] | null {
  const doubles = slots.map((s, i) => (s === 'D' ? i : -1)).filter((i) => i >= 0);
  if (doubles.length > 1) return null;
  if (doubles.length === 1) {
    const p = doubles[0] as number;
    const out: ('L' | 'R' | 'D')[] = [];
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (i === p) out.push('D');
      else if (i < p) {
        if (s === 'R') return null;
        out.push('L');
      } else {
        if (s === 'L') return null;
        out.push('R');
      }
    }
    return out;
  }
  const m = slots.length;
  const a0 = leftCount;
  const candidates = Array.from({ length: m + 1 }, (_, a) => a).sort(
    (x, y) => Math.abs(x - a0) - Math.abs(y - a0) || x - y,
  );
  for (const a of candidates) {
    const ok = slots.every((s, i) => (s === 'L' ? i < a : s === 'R' ? i >= a : true));
    if (ok) return slots.map((s, i) => (s === 'F' ? (i < a ? 'L' : 'R') : (s as 'L' | 'R')));
  }
  return null;
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

  // slot per section
  const slots: (Slot | null)[] = innerWidths.map((_, i) => {
    const f = fixed[i];
    if (f === 'none' || (!f && !hasDoor[i])) return null;
    if (f === 'single_left') return 'L';
    if (f === 'single_right') return 'R';
    if (f === 'double') return 'D';
    if (input.preset === 'all_single') return 'F';
    return doorKindForLeaf(singleLeafWidths[i] as number, input.maxSingleLeafWidth) === 'single'
      ? 'F'
      : 'D';
  });

  // hinge assignment per run of consecutive doored sections
  const assigned: ('L' | 'R' | 'D' | null)[] = slots.map(() => null);
  const conflicts: HingeConflict[] = [];
  for (let i = 0; i < n;) {
    if (!slots[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && slots[j]) j++;
    const run = slots.slice(i, j) as Slot[];
    // a lone doored section in the right half of the wardrobe hinges right (symmetric front)
    const leftCount = run.length === 1 && i > (n - 1) / 2 ? 0 : defaultLeftCount(run.length);
    const ok = assignRun(run, leftCount);
    // infeasible: keep fixed sides, free singles by the default split, then report conflicts
    const result =
      ok ?? run.map((s, k) => (s === 'F' ? (k < leftCount ? 'L' : 'R') : (s as 'L' | 'R' | 'D')));
    result.forEach((r, k) => (assigned[i + k] = r));
    if (!ok) {
      for (let k = i; k < j - 1; k++) {
        const a = assigned[k];
        const b = assigned[k + 1];
        const aRight = a === 'R' || a === 'D';
        const bLeft = b === 'L' || b === 'D';
        if (aRight && bLeft) {
          conflicts.push({
            partitionNumber: k + 1,
            source: source[k + 1] ?? source[k] ?? null,
          });
        }
      }
    }
    i = j;
  }

  const types: DoorType[] = assigned.map((a) =>
    a === 'L' ? 'single_left' : a === 'R' ? 'single_right' : a === 'D' ? 'double' : 'none',
  );

  // leaves per run, rounded so that leaves + gaps = covered width exactly
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
        xStartMm: x,
        widthMm: w,
      });
      x += w + gapBetween;
    });
    i = j;
  }

  return { types, source, leaves, conflicts, singleLeafWidths };
}
