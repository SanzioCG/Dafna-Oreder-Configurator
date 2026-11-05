import type { Pose, Vec3 } from '../viewer/framing';

/**
 * Camera tour of the presentation (D-4.1): after the turn the camera visits 2–3 viewpoints
 * (zoom in / zoom out) and returns to the showcase pose. Each shot is defined RELATIVE to the
 * showcase pose, so it works for every wardrobe size. Pure math (no three.js), unit-tested.
 */
export interface TourShot {
  /** orbit around the showcase target, degrees (+ = towards the viewer's right) */
  azimuthDeg: number;
  /** camera distance relative to the showcase distance (< 1 = zoom in) */
  distanceScale: number;
  /** target moves up (+) / down (−) by this fraction of the product height */
  lift: number;
}

/** keyframe 0 = showcase; 1..3 = the shots below (unconfirmed, designer to review) */
export const TOUR_SHOTS: TourShot[] = [
  // zoom stays moderate and the target stays put, so the wardrobe never runs under the title
  // above or the platform under "Tasdiqlash" below
  { azimuthDeg: -30, distanceScale: 0.8, lift: 0 }, // closer, from the left
  { azimuthDeg: 32, distanceScale: 0.8, lift: 0 }, // closer, from the right
  { azimuthDeg: 0, distanceScale: 1.1, lift: 0 }, // zoom out: the whole wardrobe
];

const rad = (d: number) => (d * Math.PI) / 180;

/** Pose of a tour shot, derived from the showcase pose and the product height (metres). */
export function shotPose(base: Pose, shot: TourShot, productHeightM: number): Pose {
  const [tx, ty, tz] = base.target;
  const ox = base.position[0] - tx;
  const oy = base.position[1] - ty;
  const oz = base.position[2] - tz;
  const a = rad(shot.azimuthDeg);
  // rotate the offset around the vertical axis, then scale it
  const rx = (ox * Math.cos(a) + oz * Math.sin(a)) * shot.distanceScale;
  const rz = (-ox * Math.sin(a) + oz * Math.cos(a)) * shot.distanceScale;
  const ry = oy * shot.distanceScale;
  const target: Vec3 = [tx, ty + shot.lift * productHeightM, tz];
  return { target, position: [target[0] + rx, target[1] + ry, target[2] + rz] };
}

/** All tour keyframes: index 0 = showcase, then TOUR_SHOTS. */
export function tourKeyframes(base: Pose, productHeightM: number): Pose[] {
  return [base, ...TOUR_SHOTS.map((s) => shotPose(base, s, productHeightM))];
}
