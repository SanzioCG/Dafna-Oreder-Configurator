import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { boxCenter, fitDistance, type FrameBox } from './framing';

export type { FrameBox } from './framing';

/** Minimal surface of drei's OrbitControls that the rig uses. */
interface Controls {
  target: Vector3;
  minDistance: number;
  maxDistance: number;
  update: () => void;
  addEventListener: (type: 'start', fn: () => void) => void;
  removeEventListener: (type: 'start', fn: () => void) => void;
}

const DEFAULT_DIR = new Vector3(0.5, 0.3, 1).normalize();

interface Goal {
  center: Vector3;
  distance: number;
  /** null = keep the user's current viewing direction */
  dir: Vector3 | null;
}

/**
 * Frames the product to ~70% of the zone height, centred (see framing.ts): jumps on first
 * render, then animates to a new framing whenever the product size or viewport changes
 * (keeping the user's orbit direction), and resets to the default direction when
 * `resetToken` changes (double tap / button).
 */
export function CameraRig({
  product,
  extent,
  resetToken,
}: {
  /** the product itself (world metres) */
  product: FrameBox;
  /** product + dimension annotations: must stay in view */
  extent: FrameBox;
  resetToken: number;
}) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const goal = useRef<Goal | null>(null);
  const initialised = useRef(false);
  const lastReset = useRef(resetToken);

  const key = JSON.stringify([product, extent]);

  useEffect(() => {
    const [p, e] = JSON.parse(key) as [FrameBox, FrameBox];
    const reset = lastReset.current !== resetToken;
    lastReset.current = resetToken;
    const keepDir = !reset && initialised.current && controls;
    const dir = keepDir
      ? camera.position.clone().sub(controls.target).normalize()
      : DEFAULT_DIR.clone();
    goal.current = {
      center: boxCenter(p),
      distance: fitDistance(p, e, camera.fov, aspect, dir),
      dir: keepDir ? null : DEFAULT_DIR.clone(),
    };
  }, [key, aspect, camera, controls, resetToken]);

  // A user gesture cancels an automatic re-frame in progress.
  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      if (initialised.current) goal.current = null;
    };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g || !controls) return;
    controls.minDistance = g.distance * 0.35;
    controls.maxDistance = g.distance * 2.5;
    const target = controls.target;

    if (!initialised.current) {
      target.copy(g.center);
      camera.position.copy(g.center).addScaledVector(g.dir ?? DEFAULT_DIR, g.distance);
      controls.update();
      initialised.current = true;
      goal.current = null;
      return;
    }

    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 8);
    const dir = camera.position.clone().sub(target).normalize();
    if (g.dir) dir.lerp(g.dir, k).normalize();
    const dist = camera.position.distanceTo(target);
    target.lerp(g.center, k);
    camera.position.copy(target).addScaledVector(dir, dist + (g.distance - dist) * k);
    controls.update();

    const done =
      target.distanceTo(g.center) < 0.002 &&
      Math.abs(dist - g.distance) < 0.002 &&
      (!g.dir || dir.angleTo(g.dir) < 0.002);
    if (done) goal.current = null;
  });

  return null;
}
