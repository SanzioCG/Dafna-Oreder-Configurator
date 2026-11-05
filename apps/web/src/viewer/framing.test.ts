import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DeferredCommand } from './cameraCommands';
import {
  CAMERA_ANIM_MS,
  SELECTION_VIEW_DIR,
  boxCenter,
  easeInOutCubic,
  fitDistance,
  fitToModelPose,
  fitToSelectionPose,
  interpolatePose,
  projectedSpan,
  type FrameBox,
  type Pose,
} from './framing';

const FOV = 32;
const DIR = new Vector3(0.5, 0.3, 1).normalize();
const box = (W: number, H: number, D: number, right = 0, top = 0): FrameBox => ({
  min: [-W / 2000, 0, -D / 2000],
  max: [(W / 2 + right) / 1000, (H + top) / 1000, D / 2000],
});
const pts = (b: FrameBox) => {
  const out: Vector3[] = [];
  for (const x of [b.min[0], b.max[0]])
    for (const y of [b.min[1], b.max[1]])
      for (const z of [b.min[2], b.max[2]]) out.push(new Vector3(x, y, z));
  return out;
};

describe('fitDistance (product ~70% of the 3D zone height, centred)', () => {
  // 3D zone at 1080p: 60% of 1920 x 1080
  const aspect = 1152 / 1080;

  it.each([
    [1360, 1900, 516],
    [600, 2600, 350],
    [2400, 2600, 650],
  ])('%i x %i x %i: product height fills 70%, centred', (W, H, D) => {
    const product = box(W, H, D);
    const extent = box(W, H, D, 260, 320);
    const d = fitDistance(product, extent, FOV, aspect, DIR);
    const s = projectedSpan(pts(product), FOV, aspect, boxCenter(product), DIR, d);
    expect((s.maxY - s.minY) / 2).toBeCloseTo(0.7, 2);
    // centred: equal space above and below / left and right (within 5% of the zone)
    expect(Math.abs(s.maxY + s.minY) / 2).toBeLessThan(0.05);
    expect(Math.abs(s.maxX + s.minX) / 2).toBeLessThan(0.05);
    const e = projectedSpan(pts(extent), FOV, aspect, boxCenter(product), DIR, d);
    expect(Math.max(-e.minX, e.maxX, -e.minY, e.maxY)).toBeLessThanOrEqual(0.94 + 1e-6);
  });

  it('a wide, low wardrobe is limited by width (80%) instead of height', () => {
    const product = box(2400, 1200, 650);
    const d = fitDistance(product, box(2400, 1200, 650, 260, 320), FOV, 1.6, DIR);
    const s = projectedSpan(pts(product), FOV, 1.6, boxCenter(product), DIR, d);
    expect((s.maxX - s.minX) / 2).toBeLessThanOrEqual(0.8 + 1e-6);
    expect((s.maxY - s.minY) / 2).toBeLessThan(0.7);
  });
});

describe('smart camera poses', () => {
  const aspect = 1152 / 1080;
  // 3-section wardrobe 1800 x 2000 x 600 (world metres, centred), sections 584 mm wide
  const W = 1.8;
  const H = 2.0;
  const D = 0.6;
  const t = 0.016;
  const sw = (W - 4 * t) / 3;
  const section = (i: number): FrameBox => ({
    min: [-W / 2 + t + i * (sw + t), 0.1 + t, -D / 2],
    max: [-W / 2 + t + i * (sw + t) + sw, H - t, D / 2],
  });

  it('fitToSelection centres each of 3 sections, same distance, frontal view', () => {
    const poses = [0, 1, 2].map((i) => fitToSelectionPose(section(i), FOV, aspect));
    const cx = [0, 1, 2].map((i) => {
      const b = section(i);
      return (b.min[0] + b.max[0]) / 2;
    });
    poses.forEach((p, i) => {
      expect(p.target[0]).toBeCloseTo(cx[i] ?? NaN, 6);
      expect(p.target[1]).toBeCloseTo((0.1 + t + H - t) / 2, 6);
      const off = new Vector3(...p.position).sub(new Vector3(...p.target));
      expect(off.clone().normalize().angleTo(SELECTION_VIEW_DIR)).toBeLessThan(1e-6);
    });
    const dist = poses.map((p) => new Vector3(...p.position).distanceTo(new Vector3(...p.target)));
    expect(dist[0]).toBeCloseTo(dist[1] ?? NaN, 6);
    expect(dist[2]).toBeCloseTo(dist[1] ?? NaN, 6);
    // the middle section is centred on the wardrobe's centre line
    expect(poses[1]?.target[0]).toBeCloseTo(0, 6);
    // a section is narrower than the product: framed closer than the full model
    const full = fitToModelPose(box(1800, 2000, 600), box(1800, 2000, 600, 260, 320), FOV, aspect);
    const fullDist = new Vector3(...full.position).distanceTo(new Vector3(...full.target));
    expect(dist[1]).toBeLessThanOrEqual(fullDist);
  });

  it('easing and interpolation: ends exactly on the poses, symmetric ease-in-out', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1, 10);
    expect(easeInOutCubic(2)).toBe(1);
    const a: Pose = { position: [0, 0, 5], target: [0, 1, 0] };
    const b: Pose = { position: [2, 0, 3], target: [1, 1, 0] };
    expect(interpolatePose(a, b, 0)).toEqual(a);
    expect(interpolatePose(a, b, 1)).toEqual(b);
    expect(interpolatePose(a, b, 0.5).position).toEqual([1, 0, 4]);
    expect(CAMERA_ANIM_MS).toBeGreaterThanOrEqual(500);
    expect(CAMERA_ANIM_MS).toBeLessThanOrEqual(700);
  });
});

describe('camera command deferral (never move while the pointer is down)', () => {
  it('a command submitted mid-gesture starts only after release; latest wins', () => {
    const q = new DeferredCommand<string>();
    expect(q.take(false)).toBeNull();
    q.submit('section-1');
    expect(q.take(true)).toBeNull(); // finger still on the 3D zone
    q.submit('section-2');
    expect(q.take(true)).toBeNull();
    expect(q.take(false)).toBe('section-2'); // after release
    expect(q.take(false)).toBeNull(); // started once
  });
});
