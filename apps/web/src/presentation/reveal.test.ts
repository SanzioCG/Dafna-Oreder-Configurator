import { describe, expect, it } from 'vitest';
import {
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

  it('showcase -> close -> turn -> done; total 10 s (no celebration phase)', () => {
    expect(phaseAt(0)).toBe('showcase');
    expect(phaseAt(900)).toBe('close');
    expect(phaseAt(2100)).toBe('turn');
    expect(phaseAt(9999)).toBe('turn');
    expect(phaseAt(10000)).toBe('done');
    expect(totalMs('full')).toBe(10000);
  });

  it('doors: open during the showcase, closed (1.2 s, eased) before the turn', () => {
    expect(sampleReveal('full', 0, 0).door).toBe(0);
    expect(sampleReveal('full', 799, 0).door).toBeGreaterThan(0.99);
    expect(sampleReveal('full', 800 + 600).door).toBeCloseTo(0.5, 5);
    expect(sampleReveal('full', 800 + 1199).door).toBeLessThan(0.01);
    expect(sampleReveal('full', 2001).doorsClosed).toBe(true);
    expect(sampleReveal('full', 1999).doorsClosed).toBe(false);
  });

  it('exactly one 360° turn: monotonic, constant velocity between 0.3 s ramps', () => {
    expect(turnAngle(0)).toBe(0);
    expect(turnAngle(TURN_MS)).toBeCloseTo(TURN_RAD, 12);
    let prev = 0;
    for (let t = 10; t <= TURN_MS; t += 10) {
      const a = turnAngle(t);
      expect(a).toBeGreaterThanOrEqual(prev); // never turns back
      prev = a;
    }
    const v = TURN_RAD / (TURN_MS - TURN_RAMP_MS);
    // constant angular velocity in the middle
    expect(turnAngle(4010) - turnAngle(4000)).toBeCloseTo(v * 10, 9);
    expect(turnAngle(7010) - turnAngle(7000)).toBeCloseTo(v * 10, 9);
    // ramps: slower at the very start and end
    expect(turnAngle(20) - turnAngle(10)).toBeLessThan(v * 10);
    expect(turnAngle(TURN_MS) - turnAngle(TURN_MS - 10)).toBeLessThan(v * 10);
    // continuous at the ramp joints
    expect(turnAngle(TURN_RAMP_MS - 1e-6)).toBeCloseTo(turnAngle(TURN_RAMP_MS + 1e-6), 6);
  });

  it('the reveal turns the wardrobe once and ends at the showcase angle', () => {
    expect(sampleReveal('full', 1999).turnRad).toBe(0);
    expect(sampleReveal('full', 2000 + TURN_MS / 2).turnRad).toBeCloseTo(Math.PI, 6);
    expect(sampleReveal('full', 2000 + TURN_MS - 1).turnRad).toBeGreaterThan(TURN_RAD - 0.001);
    expect(sampleReveal('full', 2000 + TURN_MS).turnRad).toBe(0); // done: showcase angle
    expect(sampleReveal('full', totalMs('full')).turnRad).toBe(0);
  });

  it('no particles and no confetti field in the sample (D-4)', () => {
    for (let t = 0; t <= totalMs('full'); t += 250) {
      expect('confettiMs' in sampleReveal('full', t)).toBe(false);
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
