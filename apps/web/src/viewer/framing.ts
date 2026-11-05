import { PerspectiveCamera, Vector3 } from 'three';

export interface FrameBox {
  min: [number, number, number];
  max: [number, number, number];
}

/** Fraction of the 3D zone height the product should fill (layout brief: ~70%). */
export const PRODUCT_HEIGHT_FILL = 0.7;
/** Product may not be wider than this fraction of the zone (wide, low wardrobes). */
export const PRODUCT_WIDTH_FILL = 0.8;
/** Product + dimension annotations must stay inside this fraction of the zone. */
export const EXTENT_FILL = 0.94;

function corners(b: FrameBox): Vector3[] {
  const out: Vector3[] = [];
  for (const x of [b.min[0], b.max[0]])
    for (const y of [b.min[1], b.max[1]])
      for (const z of [b.min[2], b.max[2]]) out.push(new Vector3(x, y, z));
  return out;
}

export function boxCenter(b: FrameBox): Vector3 {
  return new Vector3(
    (b.min[0] + b.max[0]) / 2,
    (b.min[1] + b.max[1]) / 2,
    (b.min[2] + b.max[2]) / 2,
  );
}

/** Projected extent of `points` in NDC (-1..1) for a camera at `center + dir * distance`. */
export function projectedSpan(
  points: Vector3[],
  fov: number,
  aspect: number,
  center: Vector3,
  dir: Vector3,
  distance: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const cam = new PerspectiveCamera(fov, aspect, 0.01, 1000);
  cam.position.copy(center).addScaledVector(dir, distance);
  cam.lookAt(center);
  cam.updateMatrixWorld();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const v = new Vector3();
  for (const p of points) {
    v.copy(p).project(cam);
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Camera distance (along `dir`, looking at the product centre) at which the product fills
 * ~70% of the zone height — unless that would make it wider than 80% of the zone or push the
 * dimension annotations (`extent`) out of view, in which case the camera backs off.
 * Found by bisection on the real projection, so it holds for any orbit direction.
 */
export function fitDistance(
  product: FrameBox,
  extent: FrameBox,
  fov: number,
  aspect: number,
  dir: Vector3,
): number {
  const center = boxCenter(product);
  const productPts = corners(product);
  const extentPts = corners(extent);
  const fits = (d: number) => {
    const p = projectedSpan(productPts, fov, aspect, center, dir, d);
    const e = projectedSpan(extentPts, fov, aspect, center, dir, d);
    const lim = EXTENT_FILL;
    return (
      p.maxY - p.minY <= 2 * PRODUCT_HEIGHT_FILL &&
      p.maxX - p.minX <= 2 * PRODUCT_WIDTH_FILL &&
      e.minX >= -lim &&
      e.maxX <= lim &&
      e.minY >= -lim &&
      e.maxY <= lim
    );
  };
  let lo = 0.3;
  let hi = 60;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
