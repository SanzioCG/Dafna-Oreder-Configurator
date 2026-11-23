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
  /**
   * D-15: two carcasses side by side; the boundary after this section (0-based) is two side
   * panels (2t) instead of one partition. Leaves next to it hinge on a carcass side (full overlay).
   */
  splitAfter?: number | null;
  /**
   * D-27 (inset doors, template 0.14.0+): the leaves of neighbouring doored sections close them
   * as one opening, across the partitions (which stand behind the doors).
   */
  spanPartitions?: boolean;
  /** D-27: sections whose door covers only the lower part (books_lower) never join a run */
  lowerOnly?: boolean[];
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
export function hingeMountFor(
  sectionIndex: number,
  side: HingeSide,
  count: number,
  splitAfter: number | null = null,
): HingeMount {
  const outer =
    (side === 'left' && sectionIndex === 0) ||
    (side === 'right' && sectionIndex === count - 1) ||
    // D-15: a carcass side at the split
    (splitAfter !== null && side === 'right' && sectionIndex === splitAfter) ||
    (splitAfter !== null && side === 'left' && sectionIndex === splitAfter + 1);
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

/**
 * D-22: inset doors (vkladnoy, template 0.12.0+). Each section's leaves sit inside its opening
 * (between its side panels / partitions), `gapEdge` all round and between the two leaves of a
 * double door. Door types follow the same rule as overlay doors, on the inset single-leaf width
 * (opening - 2 x gap). Hinge sides as planDoors; hingeMount 'inset'.
 */
export function planInsetDoors(input: DoorPlanInput): DoorPlan {
  const { t, innerWidths, gapEdge: g } = input;
  const n = innerWidths.length;
  const splitAfter = input.splitAfter ?? null;
  const source: (string | null)[] = [];
  const singleLeafWidths = innerWidths.map((inner) => inner - 2 * g);
  const types: DoorType[] = innerWidths.map((_, i) => {
    const o = input.overrides[i];
    if (o && o !== 'preset') {
      source.push(`doorSection${i + 1}`);
      return o as DoorType;
    }
    source.push(null);
    if (input.preset === 'none') return 'none';
    const kind =
      input.preset === 'all_single'
        ? 'single'
        : doorKindForLeaf(singleLeafWidths[i] as number, input.maxSingleLeafWidth);
    if (kind === 'double') return 'double';
    return hingeSideFor(i, n) === 'left' ? 'single_left' : 'single_right';
  });
  if (input.spanPartitions) {
    return { types, source, leaves: spanInsetLeaves(input, types), singleLeafWidths };
  }
  const leaves: DoorLeaf[] = [];
  let xStart = t;
  innerWidths.forEach((inner, i) => {
    const type = types[i] as DoorType;
    const num = i + 1;
    const x0 = xStart + g;
    if (type === 'double') {
      const total = inner - 3 * g;
      const [a, b] = roundLeaves([total / 2, total / 2], total, input.rounding) as [number, number];
      leaves.push(
        {
          id: `door-${num}-left`,
          sectionIndex: i,
          hingeSide: 'left',
          hingeMount: 'inset',
          xStartMm: x0,
          widthMm: a,
        },
        {
          id: `door-${num}-right`,
          sectionIndex: i,
          hingeSide: 'right',
          hingeMount: 'inset',
          xStartMm: x0 + a + g,
          widthMm: b,
        },
      );
    } else if (type !== 'none') {
      leaves.push({
        id: `door-${num}`,
        sectionIndex: i,
        hingeSide: type === 'single_left' ? 'left' : 'right',
        hingeMount: 'inset',
        xStartMm: x0,
        widthMm: inner - 2 * g,
      });
    }
    xStart += inner + (i === splitAfter ? 2 * t : t);
  });
  return { types, source, leaves, singleLeafWidths };
}

/**
 * D-27: true if the partition after section `i` stands behind inset doors: both neighbours have
 * a full-height door, and it is not a D-15 carcass split.
 */
export function partitionHidden(
  i: number,
  types: readonly DoorType[],
  lowerOnly: readonly boolean[],
  splitAfter: number | null,
): boolean {
  const full = (k: number) => (types[k] ?? 'none') !== 'none' && !lowerOnly[k];
  return i !== splitAfter && full(i) && full(i + 1);
}

/**
 * D-27: inset leaves over runs of doored sections (Bazis: two leaves meet with one gap, no
 * partition between them). A run is bounded by the inner faces of the side panels or of the
 * partitions that stay visible; inside it each section's share runs to the partition centre
 * lines, gapBetween between all leaves. A leaf hinging on a hidden partition is half overlay.
 */
function spanInsetLeaves(input: DoorPlanInput, types: readonly DoorType[]): DoorLeaf[] {
  const { t, innerWidths, gapEdge: g } = input;
  const n = innerWidths.length;
  const splitAfter = input.splitAfter ?? null;
  const lowerOnly = input.lowerOnly ?? [];
  const hidden = (i: number) => partitionHidden(i, types, lowerOnly, splitAfter);
  const x0: number[] = [];
  let xs = t;
  innerWidths.forEach((inner, i) => {
    x0.push(xs);
    xs += inner + (i === splitAfter ? 2 * t : t);
  });
  const left = (i: number) =>
    i > 0 && hidden(i - 1) ? (x0[i] as number) - t / 2 : (x0[i] as number);
  const right = (i: number) =>
    hidden(i)
      ? (x0[i] as number) + (innerWidths[i] as number) + t / 2
      : (x0[i] as number) + (innerWidths[i] as number);
  const leaves: DoorLeaf[] = [];
  for (let i = 0; i < n;) {
    if (types[i] === 'none') {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < n && hidden(j - 1)) j++;
    const meta: { sectionIndex: number; hingeSide: HingeSide; id: string; nominal: number }[] = [];
    for (let k = i; k < j; k++) {
      const share = right(k) - left(k);
      const num = k + 1;
      if (types[k] === 'double') {
        meta.push({
          sectionIndex: k,
          hingeSide: 'left',
          id: `door-${num}-left`,
          nominal: share / 2,
        });
        meta.push({
          sectionIndex: k,
          hingeSide: 'right',
          id: `door-${num}-right`,
          nominal: share / 2,
        });
      } else {
        meta.push({
          sectionIndex: k,
          hingeSide: types[k] === 'single_left' ? 'left' : 'right',
          id: `door-${num}`,
          nominal: share,
        });
      }
    }
    const startX = left(i) + g;
    const total = right(j - 1) - g - startX - (meta.length - 1) * g;
    const widths = roundLeaves(
      meta.map((m) => m.nominal - g),
      total,
      input.rounding,
    );
    let x = startX;
    meta.forEach((m, k) => {
      const w = widths[k] as number;
      // a hinge edge is on a section boundary: the run's end (inset in the opening) or a
      // hidden partition (half overlay on it)
      const atRunEnd =
        (m.hingeSide === 'left' && k === 0) || (m.hingeSide === 'right' && k === meta.length - 1);
      leaves.push({
        id: m.id,
        sectionIndex: m.sectionIndex,
        hingeSide: m.hingeSide,
        hingeMount: atRunEnd ? 'inset' : 'half_overlay',
        xStartMm: x,
        widthMm: w,
      });
      x += w + g;
    });
    i = j;
  }
  return leaves;
}

export function planDoors(input: DoorPlanInput): DoorPlan {
  const { widthMm: W, t, innerWidths, gapEdge, gapBetween } = input;
  const n = innerWidths.length;
  const splitAfter = input.splitAfter ?? null;
  // boundary after section i: one partition (t) or, at a D-15 split, two carcass sides (2t)
  const bt = (i: number) => (i === splitAfter ? 2 * t : t);

  // coverage of each section (boundary centre lines / outer edges)
  const left: number[] = [];
  const right: number[] = [];
  let xStart = t;
  innerWidths.forEach((inner, i) => {
    left.push(i === 0 ? 0 : xStart - bt(i - 1) / 2);
    right.push(i === n - 1 ? W : xStart + inner + bt(i) / 2);
    xStart += inner + bt(i);
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
        hingeMount: hingeMountFor(m.sectionIndex, m.hingeSide, n, splitAfter),
        xStartMm: x,
        widthMm: w,
      });
      x += w + gapBetween;
    });
    i = j;
  }

  return { types, source, leaves, singleLeafWidths };
}
