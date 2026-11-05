import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, type MutableRefObject } from 'react';
import { Vector3 } from 'three';
import type { CameraApi } from '../viewer/CameraRig';
import type { Pose } from '../viewer/framing';
import type { ConfettiHandle } from './Confetti';
import type { RevealDirector, RevealEvent } from './reveal';

const DEG = Math.PI / 180;

/** Rotates the camera offset of `pose` around the vertical axis through its target. */
export function swayPose(pose: Pose, deg: number): Pose {
  const target = new Vector3(...pose.target);
  const off = new Vector3(...pose.position).sub(target);
  off.applyAxisAngle(new Vector3(0, 1, 0), deg * DEG);
  const p = target.clone().add(off);
  return { position: [p.x, p.y, p.z], target: pose.target };
}

/**
 * Inside the <Canvas>: drives the reveal from the existing render loop. Writes the door
 * progress into `doorOverride` (read by every door leaf, which swings around its real hinge
 * pivot) and the turntable sway into the camera (orbit around the showcase target, so the
 * dimension overlay stays attached). React is told only about discrete events.
 */
export function RevealDriver({
  director,
  generation,
  cameraApi,
  doorOverride,
  confetti,
  onEvents,
}: {
  director: RevealDirector;
  /** changes when a new reveal starts (or is skipped): re-applies the showcase pose */
  generation: number;
  cameraApi: MutableRefObject<CameraApi | null>;
  doorOverride: MutableRefObject<number | null>;
  confetti: MutableRefObject<ConfettiHandle | null>;
  onEvents: (events: RevealEvent[]) => void;
}) {
  const showcase = useRef<Pose | null>(null);
  const phase = useRef<string | null>(null);
  const onEventsRef = useRef(onEvents);
  onEventsRef.current = onEvents;
  const applied = useRef(-1);

  useEffect(
    () => () => {
      // unmount (leaving the presentation): release the doors, clear the confetti. The
      // director itself is owned (started / cancelled) by <Viewer>: StrictMode re-mounts this
      // component in development, which must not stop a reveal that just started.
      doorOverride.current = null;
      confetti.current?.draw(null);
    },
    [doorOverride, confetti],
  );

  useFrame((_, dt) => {
    const api = cameraApi.current;
    if (!api) return;
    if (applied.current !== generation) {
      applied.current = generation;
      phase.current = null;
      // showcase pose computed once per run, from the current viewport
      showcase.current = api.fitToModel(director.isRunning ? undefined : 0);
      if (!director.isRunning) {
        // none / instant / skipped: final state directly
        doorOverride.current = 0;
        confetti.current?.draw(null);
      }
    }
    if (!director.isRunning) return;
    // real time (clamped to 0.25 s per frame): a slow device skips frames, not seconds
    const { sample, events } = director.tick(Math.min(dt, 0.25) * 1000);
    doorOverride.current = sample.door;
    const base = showcase.current;
    if (base && sample.phase === 'sway') api.setPose(swayPose(base, sample.swayDeg));
    if (base && phase.current === 'sway' && sample.phase !== 'sway') api.setPose(base);
    phase.current = sample.phase;
    confetti.current?.draw(sample.confettiMs);
    if (events.length > 0) onEventsRef.current(events);
  });

  return null;
}
