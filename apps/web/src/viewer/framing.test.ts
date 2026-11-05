import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { boxCenter, fitDistance, projectedSpan, type FrameBox } from './framing';

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
