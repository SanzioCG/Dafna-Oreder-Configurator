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
  fill: { height: number; width: number } = {
    height: PRODUCT_HEIGHT_FILL,
    width: PRODUCT_WIDTH_FILL,
  },
): number {
  const center = boxCenter(product);
  const productPts = corners(product);
  const extentPts = corners(extent);
  const fits = (d: number) => {
    const p = projectedSpan(productPts, fov, aspect, center, dir, d);
    const e = projectedSpan(extentPts, fov, aspect, center, dir, d);
    const lim = EXTENT_FILL;
    return (
      p.maxY - p.minY <= 2 * fill.height &&
      p.maxX - p.minX <= 2 * fill.width &&
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

// ---------------------------------------------------------------------------------------------
// Smart camera (D-3a): poses, easing, selection framing. Pure math, reused by <CameraRig>.

export type Vec3 = [number, number, number];

/** Camera pose: where the camera is and what it looks at (world metres). */
export interface Pose {
  position: Vec3;
  target: Vec3;
}

/** Default three-quarter view direction (also the showcase direction of the presentation). */
export const DEFAULT_VIEW_DIR = new Vector3(0.5, 0.3, 1).normalize();
/** A selected section / door is framed more frontally so its inside is readable. */
export const SELECTION_VIEW_DIR = new Vector3(0.22, 0.16, 1).normalize();
/** Camera animation duration for explicit moves (brief: 500–700 ms). */
export const CAMERA_ANIM_MS = 600;

export const easeInOutCubic = (t: number): number => {
  const p = Math.min(1, Math.max(0, t));
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
};

function poseAt(center: Vector3, dir: Vector3, distance: number): Pose {
  const pos = center.clone().addScaledVector(dir, distance);
  return { position: [pos.x, pos.y, pos.z], target: [center.x, center.y, center.z] };
}

/** fitToModel: the product (plus dimension annotations) framed from `dir`. */
export function fitToModelPose(
  product: FrameBox,
  extent: FrameBox,
  fov: number,
  aspect: number,
  dir: Vector3 = DEFAULT_VIEW_DIR,
  fill?: { height: number; width: number },
): Pose {
  return poseAt(boxCenter(product), dir, fitDistance(product, extent, fov, aspect, dir, fill));
}

/**
 * Presentation framing (D-4): the wardrobe fills ~50 % of the screen height (45–55 % brief),
 * three-quarter angle, so the title above and "Tasdiqlash" below have room.
 */
export const PRESENT_FILL = { height: 0.5, width: 0.55 };

/**
 * fitToSelection: a section (or its door) framed frontally, centred on the selection box.
 * The selection gets the same fill rules as the product (70% height / 80% width), so a full
 * height section is not zoomed in uncomfortably close; the camera mainly re-centres on it.
 */
export function fitToSelectionPose(
  box: FrameBox,
  fov: number,
  aspect: number,
  dir: Vector3 = SELECTION_VIEW_DIR,
): Pose {
  return poseAt(boxCenter(box), dir, fitDistance(box, box, fov, aspect, dir));
}

/** Linear blend of two poses (the caller applies the easing to `t`). */
export function interpolatePose(a: Pose, b: Pose, t: number): Pose {
  const mix = (p: Vec3, q: Vec3): Vec3 => [
    p[0] + (q[0] - p[0]) * t,
    p[1] + (q[1] - p[1]) * t,
    p[2] + (q[2] - p[2]) * t,
  ];
  return { position: mix(a.position, b.position), target: mix(a.target, b.target) };
}
