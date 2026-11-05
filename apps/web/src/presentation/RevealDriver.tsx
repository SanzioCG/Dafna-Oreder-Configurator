import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { CameraApi } from '../viewer/CameraRig';
import { PRESENT_FILL } from '../viewer/framing';
import type { RevealDirector, RevealEvent } from './reveal';

/**
 * Inside the <Canvas>: drives the reveal from the existing render loop. Writes the door
 * progress into `doorOverride` (read by every door leaf, which swings around its real hinge
 * pivot) and the turn angle into `turn` (the wardrobe group and the dimension overlay read it,
 * so the overlay stays attached while the wardrobe turns and the key light reaches the back
 * panel). The camera stays at the showcase pose. React is told only about discrete events.
 */
export function RevealDriver({
  director,
  generation,
  cameraApi,
  doorOverride,
  turn,
  onEvents,
}: {
  director: RevealDirector;
  /** changes when a new reveal starts (or is skipped): re-applies the showcase pose */
  generation: number;
  cameraApi: MutableRefObject<CameraApi | null>;
  doorOverride: MutableRefObject<number | null>;
  /** wardrobe turn angle (radians), read by the turntable group and the overlay */
  turn: MutableRefObject<number>;
  onEvents: (events: RevealEvent[]) => void;
}) {
  const onEventsRef = useRef(onEvents);
  onEventsRef.current = onEvents;
  const applied = useRef(-1);

  useEffect(
    () => () => {
      // unmount (leaving the presentation): release the doors, reset the turn. The
      // director itself is owned (started / cancelled) by <Viewer>: StrictMode re-mounts this
      // component in development, which must not stop a reveal that just started.
      doorOverride.current = null;
      turn.current = 0;
    },
    [doorOverride, turn],
  );

  useFrame((_, dt) => {
    const api = cameraApi.current;
    if (!api) return;
    if (applied.current !== generation) {
      applied.current = generation;
      // showcase (presentation framing) pose, computed once per run from the current viewport
      api.fitToModel(director.isRunning ? undefined : 0, PRESENT_FILL);
      if (!director.isRunning) {
        // none / instant / skipped: final state directly
        doorOverride.current = 0;
        turn.current = 0;
      }
    }
    if (!director.isRunning) return;
    // real time (clamped to 0.25 s per frame): a slow device skips frames, not seconds
    const { sample, events } = director.tick(Math.min(dt, 0.25) * 1000);
    doorOverride.current = sample.door;
    turn.current = sample.turnRad % (2 * Math.PI);
    if (events.length > 0) onEventsRef.current(events);
  });

  return null;
}
