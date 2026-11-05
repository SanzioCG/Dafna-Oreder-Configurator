import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { CameraApi } from '../viewer/CameraRig';
import type { ConfettiHandle } from './Confetti';
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
  confetti,
  onEvents,
}: {
  director: RevealDirector;
  /** changes when a new reveal starts (or is skipped): re-applies the showcase pose */
  generation: number;
  cameraApi: MutableRefObject<CameraApi | null>;
  doorOverride: MutableRefObject<number | null>;
  /** wardrobe turn angle (radians), read by the turntable group and the overlay */
  turn: MutableRefObject<number>;
  confetti: MutableRefObject<ConfettiHandle | null>;
  onEvents: (events: RevealEvent[]) => void;
}) {
  const onEventsRef = useRef(onEvents);
  onEventsRef.current = onEvents;
  const applied = useRef(-1);

  useEffect(
    () => () => {
      // unmount (leaving the presentation): release the doors, clear the confetti. The
      // director itself is owned (started / cancelled) by <Viewer>: StrictMode re-mounts this
      // component in development, which must not stop a reveal that just started.
      doorOverride.current = null;
      turn.current = 0;
      confetti.current?.draw(null);
    },
    [doorOverride, turn, confetti],
  );

  useFrame((_, dt) => {
    const api = cameraApi.current;
    if (!api) return;
    if (applied.current !== generation) {
      applied.current = generation;
      // showcase (presentation framing) pose, computed once per run from the current viewport
      api.fitToModel(director.isRunning ? undefined : 0);
      if (!director.isRunning) {
        // none / instant / skipped: final state directly
        doorOverride.current = 0;
        turn.current = 0;
        confetti.current?.draw(null);
      }
    }
    if (!director.isRunning) return;
    // real time (clamped to 0.25 s per frame): a slow device skips frames, not seconds
    const { sample, events } = director.tick(Math.min(dt, 0.25) * 1000);
    doorOverride.current = sample.door;
    turn.current = sample.turnRad % (2 * Math.PI);
    confetti.current?.draw(sample.confettiMs);
    if (events.length > 0) onEventsRef.current(events);
  });

  return null;
}
