import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';

/** Minimal surface of drei's OrbitControls that the rig uses. */
interface Controls {
  target: Vector3;
  minDistance: number;
  maxDistance: number;
  update: () => void;
  addEventListener: (type: 'start', fn: () => void) => void;
  removeEventListener: (type: 'start', fn: () => void) => void;
}

export interface FrameBox {
  min: [number, number, number];
  max: [number, number, number];
}

const DEFAULT_DIR = new Vector3(0.5, 0.3, 1).normalize();

function fitDistance(box: FrameBox, camera: PerspectiveCamera, aspect: number): number {
  const size = new Vector3(
    box.max[0] - box.min[0],
    box.max[1] - box.min[1],
    box.max[2] - box.min[2],
  );
  const radius = size.length() / 2;
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const fov = Math.min(vFov, hFov);
  return (radius / Math.tan(fov / 2)) * 1.04;
}

interface Goal {
  center: Vector3;
  distance: number;
  /** null = keep the user's current viewing direction */
  dir: Vector3 | null;
}

/**
 * Frames the product: jumps on first render, then animates to a new framing whenever the
 * product size or viewport changes (keeping the user's orbit direction), and resets to the
 * default direction when `resetToken` changes (double tap / button).
 */
export function CameraRig({ box, resetToken }: { box: FrameBox; resetToken: number }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const goal = useRef<Goal | null>(null);
  const initialised = useRef(false);
  const lastReset = useRef(resetToken);

  const [x0, y0, z0] = box.min;
  const [x1, y1, z1] = box.max;

  useEffect(() => {
    const b: FrameBox = { min: [x0, y0, z0], max: [x1, y1, z1] };
    const reset = lastReset.current !== resetToken;
    lastReset.current = resetToken;
    goal.current = {
      center: new Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
      distance: fitDistance(b, camera, aspect),
      dir: reset || !initialised.current ? DEFAULT_DIR.clone() : null,
    };
  }, [x0, y0, z0, x1, y1, z1, aspect, camera, resetToken]);

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
