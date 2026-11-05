import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type MutableRefObject } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { CameraAnimator, DeferredCommand, type CameraCommand } from './cameraCommands';
import {
  CAMERA_ANIM_MS,
  DEFAULT_VIEW_DIR,
  boxCenter,
  easeInOutCubic,
  fitDistance,
  fitToModelPose,
  fitToSelectionPose,
  interpolatePose,
  type FrameBox,
  type Pose,
} from './framing';

export type { FrameBox } from './framing';

/** Minimal surface of drei's OrbitControls that the rig uses. */
interface Controls {
  target: Vector3;
  minDistance: number;
  maxDistance: number;
  enabled: boolean;
  update: () => void;
  addEventListener: (type: 'start', fn: () => void) => void;
  removeEventListener: (type: 'start', fn: () => void) => void;
}

interface Goal {
  center: Vector3;
  distance: number;
  /** null = keep the user's current viewing direction */
  dir: Vector3 | null;
}

/**
 * Imperative camera API for code inside the canvas (the presentation reveal uses it).
 * fitToModel / fitToSelection / resetCamera compute a pose and call animateCameraTo.
 */
export interface CameraApi {
  animateCameraTo: (pose: Pose, ms?: number) => void;
  fitToModel: (ms?: number) => Pose;
  fitToSelection: (box: FrameBox, ms?: number) => Pose;
  resetCamera: () => void;
  /** current pose (for scripted moves around it) */
  currentPose: () => Pose;
  /** jump without animation */
  setPose: (pose: Pose) => void;
  /** true while a timed move is running */
  isAnimating: () => boolean;
  /** outline a selection (section / door id, null clears) with --primary-strong */
  highlightSelection: (id: string | null) => void;
}

const v3 = (p: Vector3): [number, number, number] => [p.x, p.y, p.z];

/**
 * Frames the product to ~70% of the zone height, centred (see framing.ts): jumps on first
 * render, then follows size / viewport changes keeping the user's orbit direction (smooth
 * exponential approach), and runs explicit camera commands (D-3a smart camera) as timed
 * ease-in-out moves of 600 ms. A new move cancels the running one (CameraAnimator). The
 * camera never moves while the user touches the 3D zone (`pointerDown`): a command waits for
 * release, and a pointer coming down stops a move in progress. Orbit / zoom stay available.
 */
export function CameraRig({
  product,
  extent,
  resetToken,
  command = null,
  pointerDown,
  apiRef,
  locked = false,
  onHighlight,
}: {
  /** the product itself (world metres) */
  product: FrameBox;
  /** product + dimension annotations: must stay in view */
  extent: FrameBox;
  resetToken: number;
  command?: CameraCommand | null;
  pointerDown?: MutableRefObject<boolean>;
  apiRef?: MutableRefObject<CameraApi | null>;
  /** presentation reveal: user orbit off, automatic re-framing paused */
  locked?: boolean;
  /** highlightSelection(id) reports here (the viewer draws the outline) */
  onHighlight?: (id: string | null) => void;
}) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const goal = useRef<Goal | null>(null);
  const animator = useRef(new CameraAnimator<Pose>(interpolatePose, easeInOutCubic));
  const initialised = useRef(false);
  const lastReset = useRef(resetToken);
  const deferred = useRef(new DeferredCommand<CameraCommand>());
  const lastSeq = useRef<number | null>(null);
  const clock = useRef(0);

  const key = JSON.stringify([product, extent]);

  // size / viewport change (and the legacy reset token): smooth re-frame
  useEffect(() => {
    const [p, e] = JSON.parse(key) as [FrameBox, FrameBox];
    const reset = lastReset.current !== resetToken;
    lastReset.current = resetToken;
    const keepDir = !reset && initialised.current && controls;
    const dir = keepDir
      ? camera.position.clone().sub(controls.target).normalize()
      : DEFAULT_VIEW_DIR.clone();
    goal.current = {
      center: boxCenter(p),
      distance: fitDistance(p, e, camera.fov, aspect, dir),
      dir: keepDir ? null : DEFAULT_VIEW_DIR.clone(),
    };
  }, [key, aspect, camera, controls, resetToken]);

  // explicit commands: queued; started in the frame loop once no pointer is down
  useEffect(() => {
    if (!command || command.seq === lastSeq.current) return;
    lastSeq.current = command.seq;
    deferred.current.submit(command);
  }, [command]);

  // A user gesture cancels an automatic re-frame / camera move in progress.
  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      if (!initialised.current) return;
      goal.current = null;
      animator.current.cancel();
    };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  useEffect(() => {
    if (controls) controls.enabled = !locked;
  }, [controls, locked]);

  const currentPose = (): Pose => ({
    position: v3(camera.position),
    target: controls ? v3(controls.target) : [0, 0, 0],
  });

  const setPose = (pose: Pose) => {
    camera.position.set(...pose.position);
    controls?.target.set(...pose.target);
    controls?.update();
  };

  const animateCameraTo = (pose: Pose, ms = CAMERA_ANIM_MS) => {
    goal.current = null;
    if (ms <= 0) {
      animator.current.cancel();
      setPose(pose);
      return;
    }
    // replaces (cancels) a running move, continuing from the current pose
    animator.current.start(currentPose(), pose, clock.current, ms);
  };

  const [pMin, pMax] = [product.min, product.max];
  const productBox: FrameBox = { min: pMin, max: pMax };
  const api: CameraApi = {
    animateCameraTo,
    fitToModel: (ms) => {
      const pose = fitToModelPose(productBox, extent, camera.fov, aspect);
      animateCameraTo(pose, ms);
      return pose;
    },
    fitToSelection: (box, ms) => {
      const pose = fitToSelectionPose(box, camera.fov, aspect);
      animateCameraTo(pose, ms);
      return pose;
    },
    resetCamera: () => {
      animateCameraTo(fitToModelPose(productBox, extent, camera.fov, aspect));
    },
    currentPose,
    setPose,
    isAnimating: () => animator.current.running,
    highlightSelection: (id) => onHighlight?.(id),
  };
  if (apiRef) apiRef.current = api;

  useFrame((_, dt) => {
    clock.current += Math.min(dt, 0.1) * 1000;
    if (!controls) return;

    // start a queued command only when no finger / mouse is on the 3D zone
    if (initialised.current && !locked) {
      const c = deferred.current.take(pointerDown?.current ?? false);
      if (c?.kind === 'model' || c?.kind === 'reset') {
        api.highlightSelection(null);
        api.fitToModel();
      } else if (c?.kind === 'selection') {
        api.highlightSelection(c.id);
        api.fitToSelection(c.box);
      }
    }

    // a finger / mouse on the 3D zone stops an automatic move (the user is in control)
    if (pointerDown?.current && !locked) animator.current.cancel();
    const pose = animator.current.sample(clock.current);
    if (pose) {
      setPose(pose);
      return;
    }

    const g = goal.current;
    if (!g || locked) return;
    controls.minDistance = g.distance * 0.35;
    controls.maxDistance = g.distance * 2.5;
    const target = controls.target;

    if (!initialised.current) {
      target.copy(g.center);
      camera.position.copy(g.center).addScaledVector(g.dir ?? DEFAULT_VIEW_DIR, g.distance);
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
