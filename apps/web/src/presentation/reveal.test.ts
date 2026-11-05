import { describe, expect, it } from 'vitest';
import {
  FINAL_SAMPLE,
  RevealDirector,
  SWAY_DEG,
  planReveal,
  sampleReveal,
  totalMs,
  type RevealEvent,
} from './reveal';
import { swayPose } from './RevealDriver';

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

  it('showcase -> close -> sway -> celebrate -> done; total ~8 s', () => {
    expect(phaseAt(0)).toBe('showcase');
    expect(phaseAt(900)).toBe('close');
    expect(phaseAt(2100)).toBe('sway');
    expect(phaseAt(6600)).toBe('celebrate');
    expect(phaseAt(totalMs('full'))).toBe('done');
    expect(totalMs('full')).toBe(8000);
  });

  it('doors: open during the showcase, closed (~1.2 s, eased) before the sway', () => {
    expect(sampleReveal('full', 0, 0).door).toBe(0);
    expect(sampleReveal('full', 799, 0).door).toBeGreaterThan(0.99);
    expect(sampleReveal('full', 800 + 600).door).toBeCloseTo(0.5, 5);
    expect(sampleReveal('full', 800 + 1199).door).toBeLessThan(0.01);
    expect(sampleReveal('full', 2001).doorsClosed).toBe(true);
    expect(sampleReveal('full', 1999).doorsClosed).toBe(false);
  });

  it('sway stays within ±35° and returns to the showcase angle', () => {
    let max = 0;
    let min = 0;
    for (let t = 2000; t < 6500; t += 25) {
      const a = sampleReveal('full', t).swayDeg;
      max = Math.max(max, a);
      min = Math.min(min, a);
    }
    expect(max).toBeLessThanOrEqual(SWAY_DEG + 1e-9);
    expect(max).toBeGreaterThan(SWAY_DEG - 0.5);
    expect(min).toBeGreaterThanOrEqual(-SWAY_DEG - 1e-9);
    expect(Math.abs(sampleReveal('full', 6499).swayDeg)).toBeLessThan(0.1);
    expect(sampleReveal('full', 6500).swayDeg).toBe(0);
  });

  it('confetti only in the celebration (~1.5 s), with the title', () => {
    expect(sampleReveal('full', 6000).confettiMs).toBeNull();
    expect(sampleReveal('full', 6000).title).toBe(false);
    const c = sampleReveal('full', 7000);
    expect(c.confettiMs).toBe(500);
    expect(c.title).toBe(true);
  });

  it('short version: ≤ 1.5 s, doors close, no sway, no confetti', () => {
    expect(totalMs('short')).toBeLessThanOrEqual(1500);
    for (let t = 0; t < totalMs('short'); t += 20) {
      const s = sampleReveal('short', t, 1);
      expect(s.swayDeg).toBe(0);
      expect(s.confettiMs).toBeNull();
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
    expect(run(d, 9000)).toEqual(['doorsClosed', 'title', 'done']);
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

describe('turntable sway pose', () => {
  it('rotates the camera around the vertical axis through the target, same distance', () => {
    const base = {
      position: [0, 1, 5] as [number, number, number],
      target: [0, 1, 0] as [number, number, number],
    };
    const p = swayPose(base, 90);
    expect(p.position[0]).toBeCloseTo(5, 6);
    expect(p.position[1]).toBeCloseTo(1, 6);
    expect(p.position[2]).toBeCloseTo(0, 6);
    expect(swayPose(base, 0).position).toEqual(base.position);
  });
});
