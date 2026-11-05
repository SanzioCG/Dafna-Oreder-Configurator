import type { Section } from '@dafna/engine';

/**
 * Dimension annotations (D-3a): pure data + layout rules. Rendering is one SVG overlay
 * (DimensionOverlay.tsx) whose elements are moved through refs every frame.
 */
export type V3 = [number, number, number];

/** End-tick length in product mm (perpendicular to the dimension line). */
export const TICK_MM = 40;

/** Extra space (mm) the annotations need around the product, for camera framing. */
export const DIMENSION_MARGIN = { right: 260, top: 320 };

export type DimKind = 'primary' | 'secondary';

/** One dimension line in product mm coordinates (origin bottom-left-back, like the engine). */
export interface DimSpec {
  key: string;
  kind: DimKind;
  from: V3;
  to: V3;
  /** unit vector for the end ticks */
  tick: V3;
  label: string;
  /** extension lines from the product to each end of the dimension line */
  ext?: [V3, V3];
}

export type UnitSystem = 'cm' | 'mm';

/**
 * Units shown in the UI (D-4): customers see whole centimetres, staff millimetres. The engine
 * always works in mm.
 */
export function unitSystemFor(mode: 'customer' | 'staff'): UnitSystem {
  return mode === 'staff' ? 'mm' : 'cm';
}

/**
 * mm -> display units. cm: rounded to the nearest whole centimetre (half up), so 1365 -> 137,
 * 656 -> 66. Customer steppers move in 10 mm steps, so customer-set sizes are exact.
 */
export function toDisplay(mm: number, units: UnitSystem): number {
  return units === 'cm' ? Math.round(mm / 10) : mm;
}

/** display units -> mm (cm x 10). */
export function fromDisplay(value: number, units: UnitSystem): number {
  return units === 'cm' ? Math.round(value * 10) : value;
}

/**
 * Formats an engine length (mm). cm: whole centimetres (toDisplay rounding), e.g.
 * 1360 -> "136 sm", 656 -> "66 sm"; mm: as is (half millimetres with a decimal comma).
 */
export function formatLength(mm: number, units: UnitSystem, unitLabel: string): string {
  if (units === 'mm') return `${Math.round(mm * 2) / 2} ${unitLabel}`.replace('.', ',');
  return `${toDisplay(mm, 'cm')} ${unitLabel}`;
}

/** Overall size as one string, e.g. "136 × 190 × 60 sm". */
export function formatSize(
  w: number,
  h: number,
  d: number,
  units: UnitSystem,
  unitLabel: string,
): string {
  const n = (mm: number) => formatLength(mm, units, '').trim();
  return `${n(w)} × ${n(h)} × ${n(d)} ${unitLabel}`;
}

export interface DimVisibility {
  primary: boolean;
  secondary: boolean;
}

/**
 * Primary (overall width / height / depth) is always shown. Secondary (section widths) only
 * on the interior and doors steps, and only while the sections are visible (no doors, or doors
 * open); never in presentation mode.
 */
export function dimensionVisibility(opts: {
  step: string;
  presentation: boolean;
  hasDoors: boolean;
  doorsOpen: boolean;
}): DimVisibility {
  const sectionsVisible = !opts.hasDoors || opts.doorsOpen;
  return {
    // D-4: no dimension overlay at all in the presentation
    primary: !opts.presentation,
    secondary:
      !opts.presentation && (opts.step === 'interior' || opts.step === 'doors') && sectionsVisible,
  };
}

/**
 * Builds the dimension specs from ENGINE output only: overall `widthMm / heightMm / depthMm`
 * and each section's `innerWidthMm` / `xStartMm`.
 */
export function buildDimensions(
  size: { widthMm: number; heightMm: number; depthMm: number },
  sections: Section[],
  format: (mm: number) => string,
  visibility: DimVisibility,
): DimSpec[] {
  const { widthMm: W, heightMm: H, depthMm: D } = size;
  const sectionY = H + 90;
  const widthY = H + 230;
  const sideX = W + 140;
  const out: DimSpec[] = [];
  if (visibility.secondary) {
    for (const s of sections) {
      out.push({
        key: `section-${s.index}`,
        kind: 'secondary',
        from: [s.xStartMm, sectionY, D],
        to: [s.xStartMm + s.innerWidthMm, sectionY, D],
        tick: [0, 1, 0],
        label: format(s.innerWidthMm),
      });
    }
  }
  if (visibility.primary) {
    out.push(
      {
        key: 'width',
        kind: 'primary',
        from: [0, widthY, D],
        to: [W, widthY, D],
        tick: [0, 1, 0],
        label: format(W),
        ext: [
          [0, H, D],
          [W, H, D],
        ],
      },
      {
        key: 'height',
        kind: 'primary',
        from: [sideX, 0, D],
        to: [sideX, H, D],
        tick: [1, 0, 0],
        label: format(H),
        ext: [
          [W, 0, D],
          [W, H, D],
        ],
      },
      {
        key: 'depth',
        kind: 'primary',
        from: [sideX, H, 0],
        to: [sideX, H, D],
        tick: [1, 0, 0],
        label: format(D),
        ext: [
          [W, H, 0],
          [W, H, D],
        ],
      },
    );
  }
  return out;
}

export function midpoint(d: DimSpec): V3 {
  return [(d.from[0] + d.to[0]) / 2, (d.from[1] + d.to[1]) / 2, (d.from[2] + d.to[2]) / 2];
}

/** End points of the two ticks: [fromA, fromB, toA, toB]. */
export function tickPoints(d: DimSpec, len = TICK_MM): [V3, V3, V3, V3] {
  const at = (p: V3, s: number): V3 => [
    p[0] + d.tick[0] * s,
    p[1] + d.tick[1] * s,
    p[2] + d.tick[2] * s,
  ];
  return [at(d.from, -len / 2), at(d.from, len / 2), at(d.to, -len / 2), at(d.to, len / 2)];
}

/** Label pill size in px: a width estimate from the text (no DOM measuring per frame). */
export function labelSize(text: string, fontPx: number): { w: number; h: number } {
  return { w: Math.ceil(text.length * fontPx * 0.58 + fontPx * 1.3), h: Math.ceil(fontPx * 1.75) };
}

/** A label's screen box, centred on (x, y). */
export interface LabelBox {
  key: string;
  kind: DimKind;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

export interface LabelPlacement {
  dx: number;
  dy: number;
  visible: boolean;
}

function overlaps(a: LabelBox, ax: number, ay: number, b: LabelBox, bx: number, by: number) {
  return Math.abs(ax - bx) * 2 < a.w + b.w && Math.abs(ay - by) * 2 < a.h + b.h;
}

/**
 * Label collision avoidance: primary labels never move. Each secondary label that overlaps an
 * already placed label is offset (up, then down) by its height + gap; if it still overlaps, it
 * is hidden. Order of secondaries is stable (left to right as built).
 */
export function resolveLabelOverlaps(boxes: LabelBox[], gap = 4): Map<string, LabelPlacement> {
  const out = new Map<string, LabelPlacement>();
  const placed: { box: LabelBox; x: number; y: number }[] = [];
  for (const b of boxes) {
    if (b.kind === 'primary') {
      out.set(b.key, { dx: 0, dy: 0, visible: b.visible });
      if (b.visible) placed.push({ box: b, x: b.x, y: b.y });
    }
  }
  for (const b of boxes) {
    if (b.kind !== 'secondary') continue;
    if (!b.visible) {
      out.set(b.key, { dx: 0, dy: 0, visible: false });
      continue;
    }
    const step = b.h + gap;
    let chosen: LabelPlacement | null = null;
    for (const dy of [0, -step, step]) {
      const free = placed.every((p) => !overlaps(b, b.x, b.y + dy, p.box, p.x, p.y));
      if (free) {
        chosen = { dx: 0, dy, visible: true };
        break;
      }
    }
    if (chosen) placed.push({ box: b, x: b.x, y: b.y + chosen.dy });
    out.set(b.key, chosen ?? { dx: 0, dy: 0, visible: false });
  }
  return out;
}
