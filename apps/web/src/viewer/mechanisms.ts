import { brandItem, type Panel } from '@dafna/engine';
import { Euler, Vector3 } from 'three';

/**
 * D-10: the "Mexanizmlar" step shows the chosen mechanisms in 3D: doors open with their cup
 * hinges highlighted, drawers pulled out with their slides highlighted; "Ko'rish" plays how
 * the door / drawer closes (standard vs soft close). Pure helpers (tested without WebGL).
 */

export type MechanismKind = 'hinge' | 'slide';

export interface MechanismDemo {
  kind: MechanismKind;
  brand: string;
  /** bumps on every "Ko'rish" (replays the same brand) */
  seq: number;
}

export interface MechanismView {
  /** the hardware step: open, pull out, highlight */
  show: boolean;
  hingeBrand: string;
  slideBrand: string;
  demo: MechanismDemo | null;
}

/** Highlight colour of the mechanism glyphs (the legend dot uses the same). */
export const MECH_COLOR = '#ffad1f';
/** Drawers come out by this share of their box depth on the hardware step. */
export const DRAWER_SHOW_PULL = 0.6;

/** Cup-hinge centres from the bottom of the leaf: 100 mm from each end, the rest evenly. */
export function hingeOffsets(heightMm: number, count: number, endMm = 100): number[] {
  if (count <= 1) return [heightMm / 2];
  const span = heightMm - 2 * endMm;
  return Array.from({ length: count }, (_, i) => endMm + (span * i) / (count - 1));
}

/** Drawer id ("s1-drawer-2") -> its panels (front, sides, back, bottom). */
export function drawerGroups(panels: Panel[]): Map<string, Panel[]> {
  const groups = new Map<string, Panel[]>();
  for (const p of panels) {
    const m = /^(.+-drawer-\d+)-/.exec(p.id);
    if (!m || !p.role.startsWith('drawer_')) continue;
    const list = groups.get(m[1]!) ?? [];
    list.push(p);
    groups.set(m[1]!, list);
  }
  return groups;
}

export interface Box3mm {
  min: [number, number, number];
  max: [number, number, number];
}

/** Axis-aligned box of a board in product mm (rotations are multiples of 90°). */
export function panelBox(p: Panel): Box3mm {
  const DEG = Math.PI / 180;
  const e = new Euler(p.rotation[0] * DEG, p.rotation[1] * DEG, p.rotation[2] * DEG, 'XYZ');
  const half = [p.lengthMm / 2, p.thicknessMm / 2, p.widthMm / 2];
  const ext = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    const v = new Vector3(
      axis === 0 ? half[0] : 0,
      axis === 1 ? half[1] : 0,
      axis === 2 ? half[2] : 0,
    );
    v.applyEuler(e);
    ext[0]! += Math.abs(v.x);
    ext[1]! += Math.abs(v.y);
    ext[2]! += Math.abs(v.z);
  }
  const [x, y, z] = p.position;
  return {
    min: [x - ext[0]!, y - ext[1]!, z - ext[2]!],
    max: [x + ext[0]!, y + ext[1]!, z + ext[2]!],
  };
}

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));

/**
 * Closing demo, progress 1 = open … 0 = closed, at `t` seconds; null = finished.
 * - standard (Strax): speeds up all the way and hits the carcass (a small bounce);
 * - soft close (Hettich): closes fast to ~15 %, then the damper brakes it to a slow stop.
 * Then it stays closed for a moment and opens again.
 */
export function demoProgress(brand: string, t: number): number | null {
  if (t < 0) return 1;
  // D-28: soft close from the hardware catalog (Hettich, Samet Master, Samet soft slides, …)
  const soft = ['hinge', 'slide'].some((k) => brandItem(k, brand)?.softClose === true);
  if (soft) {
    if (t < 0.35) return 1 - 0.85 * (t / 0.35) ** 2;
    if (t < 1.75) return 0.15 * (1 - (1 - (1 - (t - 0.35) / 1.4) ** 3));
    if (t < 2.5) return 0;
    if (t < 3.2) return easeInOut(clamp01((t - 2.5) / 0.7));
    return null;
  }
  if (t < 0.5) return 1 - (t / 0.5) ** 2;
  if (t < 0.7) return 0.04 * Math.sin(Math.PI * ((t - 0.5) / 0.2));
  if (t < 1.5) return 0;
  if (t < 2.2) return easeInOut(clamp01((t - 1.5) / 0.7));
  return null;
}

/**
 * Which drawers sit behind which door: a door covers a drawer when their boxes overlap across
 * the front (X) and in height (Y). Such a drawer may only come out once its doors are open, and
 * those doors may only close once it is back in (no board ever passes through another).
 */
export function doorCoverage(panels: Panel[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const groups = drawerGroups(panels);
  const boxes = [...groups].map(([id, parts]) => {
    const bs = parts.map(panelBox);
    return {
      id,
      min: [0, 1].map((k) => Math.min(...bs.map((b) => b.min[k]!))),
      max: [0, 1].map((k) => Math.max(...bs.map((b) => b.max[k]!))),
    };
  });
  for (const door of panels.filter((p) => p.role === 'door')) {
    const d = panelBox(door);
    const eps = 1;
    out.set(
      door.id,
      boxes
        .filter((b) =>
          [0, 1].every((k) => d.min[k]! < b.max[k]! - eps && b.min[k]! < d.max[k]! - eps),
        )
        .map((b) => b.id),
    );
  }
  return out;
}

/** Shared animation state of one product: door progress (0..1) and drawer offset (mm). */
export interface MotionState {
  door: Map<string, number>;
  drawer: Map<string, number>;
  /** the hinge demo is waiting / playing: drawers behind doors stay in */
  holdDrawers: boolean;
}

/** a door counts as open for a drawer from this progress on */
export const DOOR_CLEAR = 0.98;
/** a drawer counts as in (doors may close) below this offset, mm */
export const DRAWER_IN_MM = 1;
