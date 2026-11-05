import { describe, expect, it } from 'vitest';
import {
  CANDY_MS,
  FINAL_SAMPLE,
  RevealDirector,
  TURN_MS,
  TURN_RAD,
  TURN_RAMP_MS,
  turnAngle,
  planReveal,
  sampleReveal,
  totalMs,
  type RevealEvent,
} from './reveal';
import { CONFETTI_MS, LOGO_EVERY, makePieces, piecePosition } from './Confetti';
import { TOUR_SHOTS, shotPose, tourKeyframes } from './tour';

describe('planReveal: once per configuration revision', () => {
  it('first time full, same revision none, after an edit short, reduced motion instant', () => {
    expect(planReveal({ revision: 'a', lastRevealed: null, reducedMotion: false })).toBe('full');
    expect(planReveal({ revision: 'a', lastRevealed: 'a', reducedMotion: false })).toBe('none');
    expect(planReveal({ revision: 'b', lastRevealed: 'a', reducedMotion: false })).toBe('short');
    expect(planReveal({ revision: 'b', lastRevealed: null, reducedMotion: true })).toBe('instant');
    expect(planReveal({ revision: 'a', lastRevealed: 'a', reducedMotion: true })).toBe('none');
  });
});

describe('sequence order (full)', () => {
  const phaseAt = (t: number) => sampleReveal('full', t).phase;

  it('8 s in total: showcase -> close -> turn -> tour -> settle -> done', () => {
    expect(totalMs('full')).toBe(8000);
    expect(phaseAt(0)).toBe('showcase');
    expect(phaseAt(700)).toBe('close');
    expect(phaseAt(1700)).toBe('turn');
    expect(phaseAt(4599)).toBe('turn');
    expect(phaseAt(4600)).toBe('tour');
    expect(phaseAt(7399)).toBe('tour');
    expect(phaseAt(7400)).toBe('settle');
    expect(phaseAt(8000)).toBe('done');
  });

  it('doors: open during the showcase, closed (1.0 s, eased) before the turn', () => {
    expect(sampleReveal('full', 0, 0).door).toBe(0);
    expect(sampleReveal('full', 599, 0).door).toBeGreaterThan(0.99);
    expect(sampleReveal('full', 600 + 500).door).toBeCloseTo(0.5, 5);
    expect(sampleReveal('full', 600 + 999).door).toBeLessThan(0.01);
    expect(sampleReveal('full', 1601).doorsClosed).toBe(true);
    expect(sampleReveal('full', 1599).doorsClosed).toBe(false);
  });

  it('exactly one 360° turn in 3 s: monotonic, constant velocity between 0.3 s ramps', () => {
    expect(TURN_MS).toBe(3000);
    expect(turnAngle(0)).toBe(0);
    expect(turnAngle(TURN_MS)).toBeCloseTo(TURN_RAD, 12);
    let prev = 0;
    for (let t = 10; t <= TURN_MS; t += 10) {
      const angle = turnAngle(t);
      expect(angle).toBeGreaterThanOrEqual(prev); // never turns back
      prev = angle;
    }
    const v = TURN_RAD / (TURN_MS - TURN_RAMP_MS);
    expect(turnAngle(1010) - turnAngle(1000)).toBeCloseTo(v * 10, 9);
    expect(turnAngle(2010) - turnAngle(2000)).toBeCloseTo(v * 10, 9);
    expect(turnAngle(20) - turnAngle(10)).toBeLessThan(v * 10);
    expect(turnAngle(TURN_MS) - turnAngle(TURN_MS - 10)).toBeLessThan(v * 10);
    expect(turnAngle(TURN_RAMP_MS - 1e-6)).toBeCloseTo(turnAngle(TURN_RAMP_MS + 1e-6), 6);
  });

  it('the reveal turns the wardrobe once and ends at the showcase angle', () => {
    expect(sampleReveal('full', 1599).turnRad).toBe(0);
    expect(sampleReveal('full', 1600 + TURN_MS / 2).turnRad).toBeCloseTo(Math.PI, 6);
    expect(sampleReveal('full', 1600 + TURN_MS - 1).turnRad).toBeGreaterThan(TURN_RAD - 0.001);
    expect(sampleReveal('full', 1600 + TURN_MS).turnRad).toBe(0); // tour: showcase angle
    expect(sampleReveal('full', totalMs('full')).turnRad).toBe(0);
  });

  it('camera tour: 3 legs (showcase -> 1 -> 2 -> 3), then back to the showcase pose', () => {
    expect(sampleReveal('full', 4000).shot).toBeNull(); // during the turn: showcase pose
    const legs = [4600, 4600 + 934, 4600 + 1867].map((t) => sampleReveal('full', t).shot);
    expect(legs.map((l) => l && [l.from, l.to])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    const back = sampleReveal('full', 7700).shot;
    expect(back && [back.from, back.to]).toEqual([3, 0]);
    expect(back?.t).toBeCloseTo(0.5, 5);
    expect(sampleReveal('full', 8000).shot).toBeNull();
    expect(sampleReveal('short', 1300, 1).shot).toBeNull(); // short version: no tour
  });

  it('tour shots: 2 close-ups (left, right) and 1 wide shot, relative to the showcase pose', () => {
    const base = {
      position: [0, 1, 5] as [number, number, number],
      target: [0, 1, 0] as [number, number, number],
    };
    const dist = (p: { position: number[]; target: number[] }) =>
      Math.hypot(...p.position.map((v, i) => v - (p.target[i] ?? 0)));
    const [k0, k1, k2, k3] = tourKeyframes(base, 2);
    expect(k0).toEqual(base);
    expect(TOUR_SHOTS).toHaveLength(3);
    expect(dist(k1 as typeof base)).toBeLessThan(dist(base)); // zoom in
    expect(dist(k2 as typeof base)).toBeLessThan(dist(base)); // zoom in
    expect(dist(k3 as typeof base)).toBeGreaterThan(dist(base)); // zoom out
    expect(k1?.position[0]).toBeLessThan(k2?.position[0] ?? 0); // from the left, then the right
    expect(k1?.target).toEqual(base.target); // target stays: no overlap with title / button
    expect(shotPose(base, { azimuthDeg: 0, distanceScale: 1, lift: 0 }, 2)).toEqual(base);
  });

  it('candy shower: during the 360° turn, from 0.3 s into it, full reveal only (D-4.1)', () => {
    expect(sampleReveal('full', 1899).confettiMs).toBeNull();
    expect(sampleReveal('full', 1900).phase).toBe('turn');
    expect(sampleReveal('full', 1900).confettiMs).toBe(0);
    expect(sampleReveal('full', 3000).confettiMs).toBe(1100);
    expect(sampleReveal('full', 4499).phase).toBe('turn');
    expect(sampleReveal('full', 4500).confettiMs).toBeNull();
    expect(CANDY_MS).toBe(CONFETTI_MS);
    for (let t = 0; t < totalMs('short'); t += 50) {
      expect(sampleReveal('short', t, 1).confettiMs).toBeNull();
    }
  });

  it('candies: rectangles mixed with DAFNA logo candies (every 4th)', () => {
    const pieces = makePieces();
    expect(pieces.filter((p) => p.logo).length).toBe(Math.ceil(pieces.length / LOGO_EVERY));
    expect(pieces.some((p) => !p.logo)).toBe(true);
  });

  it('candies: spread across the whole screen width, falling down', () => {
    const pieces = makePieces();
    expect(pieces.some((p) => p.x > 0.4 && p.x < 0.6)).toBe(true);
    expect(pieces.some((p) => p.x < 0.1)).toBe(true);
    expect(pieces.some((p) => p.x > 0.9)).toBe(true);
    for (const p of pieces) {
      expect(p.y).toBeLessThan(0);
      expect(piecePosition(p, CONFETTI_MS / 1000).y).toBeGreaterThan(p.y);
    }
  });

  it('short version: ≤ 1.5 s, doors close only, no turn', () => {
    expect(totalMs('short')).toBeLessThanOrEqual(1500);
    for (let t = 0; t < totalMs('short'); t += 20) {
      const s = sampleReveal('short', t, 1);
      expect(s.turnRad).toBe(0);
    }
    expect(sampleReveal('short', 1250).doorsClosed).toBe(true);
    expect(sampleReveal('short', totalMs('short'))).toEqual(FINAL_SAMPLE);
  });

  it('none / instant: the final state directly', () => {
    expect(sampleReveal('none', 0)).toEqual(FINAL_SAMPLE);
    expect(sampleReveal('instant', 0)).toEqual(FINAL_SAMPLE);
  });
});

describe('RevealDirector', () => {
  const run = (d: RevealDirector, ms: number, step = 16) => {
    const events: RevealEvent[] = [];
    for (let t = 0; t < ms; t += step) events.push(...d.tick(step).events);
    return events;
  };

  it('events fire once, in order: doorsClosed, title, done', () => {
    const d = new RevealDirector();
    d.start('full');
    expect(run(d, 12000)).toEqual(['doorsClosed', 'title', 'done']);
    expect(d.isRunning).toBe(false);
    expect(run(d, 1000)).toEqual([]);
  });

  it('no duplicate trigger: start while running is ignored', () => {
    const d = new RevealDirector();
    expect(d.start('full')).toBe(true);
    run(d, 1000);
    expect(d.start('full')).toBe(false);
    expect(d.sample().phase).toBe('close'); // not restarted
  });

  it('skip ends in the stable state and fires the pending events once', () => {
    const d = new RevealDirector();
    d.start('full', 1);
    run(d, 500);
    expect(d.skip()).toEqual(['doorsClosed', 'title', 'done']);
    expect(d.wasSkipped).toBe(true);
    expect(d.isRunning).toBe(false);
    expect(d.sample()).toEqual(FINAL_SAMPLE);
    expect(d.skip()).toEqual([]);
  });

  it('skip after the doors closed only fires the rest', () => {
    const d = new RevealDirector();
    d.start('full');
    expect(run(d, 2100)).toEqual(['doorsClosed']);
    expect(d.skip()).toEqual(['title', 'done']);
  });

  it('instant (reduced motion) is not running; skip gives the final events', () => {
    const d = new RevealDirector();
    d.start('instant');
    expect(d.isRunning).toBe(false);
    expect(d.skip()).toEqual(['doorsClosed', 'title', 'done']);
  });
});
