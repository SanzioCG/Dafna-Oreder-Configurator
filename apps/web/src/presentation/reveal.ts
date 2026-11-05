/**
 * Presentation reveal (D-3a): pure timeline + director. The render loop calls `tick(dt)` and
 * applies the sample (door progress, sway angle) through refs; React only hears about the few
 * discrete events (doors closed, title, done).
 *
 * Full sequence (first time a configuration revision is presented):
 *   a) showcase  0.8 s  camera to the three-quarter showcase pose, doors open (if any)
 *   b) close     1.2 s  doors close around their real hinge pivots, ease-in-out
 *   c) sway      4.5 s  turntable sway ±35° and back to the showcase angle (not a full 360°)
 *   d) celebrate 1.5 s  short confetti + title "Ajoyib tanlov!"
 * Short version (presented again after an edit): doors open briefly, close, settle — 1.5 s,
 * no confetti. Same revision again: no animation. prefers-reduced-motion: final state directly.
 */

export type RevealKind = 'full' | 'short' | 'none' | 'instant';
export type RevealPhase = 'showcase' | 'close' | 'sway' | 'settle' | 'celebrate' | 'done';

export const SWAY_DEG = 35;

interface Segment {
  phase: RevealPhase;
  ms: number;
}

export const TIMELINES: Record<'full' | 'short', Segment[]> = {
  full: [
    { phase: 'showcase', ms: 800 },
    { phase: 'close', ms: 1200 },
    { phase: 'sway', ms: 4500 },
    { phase: 'celebrate', ms: 1500 },
  ],
  short: [
    { phase: 'showcase', ms: 300 },
    { phase: 'close', ms: 900 },
    { phase: 'settle', ms: 300 },
  ],
};

export function totalMs(kind: 'full' | 'short'): number {
  return TIMELINES[kind].reduce((s, x) => s + x.ms, 0);
}

/**
 * Which reveal to play when entering the presentation.
 * - same configuration revision as last time: none
 * - prefers-reduced-motion: instant (final state, no motion)
 * - never presented in this session: full; presented before (then edited): short
 */
export function planReveal(opts: {
  revision: string;
  lastRevealed: string | null;
  reducedMotion: boolean;
}): RevealKind {
  if (opts.lastRevealed === opts.revision) return 'none';
  if (opts.reducedMotion) return 'instant';
  return opts.lastRevealed === null ? 'full' : 'short';
}

export const easeInOut = (t: number): number => {
  const p = Math.min(1, Math.max(0, t));
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
};

export interface RevealSample {
  phase: RevealPhase;
  /** door progress: 1 = open, 0 = closed */
  door: number;
  /** turntable sway around the showcase angle, degrees */
  swayDeg: number;
  doorsClosed: boolean;
  /** ms since the celebration started (confetti), null outside it */
  confettiMs: number | null;
  title: boolean;
  done: boolean;
}

export const FINAL_SAMPLE: RevealSample = {
  phase: 'done',
  door: 0,
  swayDeg: 0,
  doorsClosed: true,
  confettiMs: null,
  title: true,
  done: true,
};

/** State of the reveal `t` ms after it started. `startDoor` = door progress at the start. */
export function sampleReveal(kind: RevealKind, t: number, startDoor = 0): RevealSample {
  if (kind === 'none' || kind === 'instant') return FINAL_SAMPLE;
  const segs = TIMELINES[kind];
  let t0 = 0;
  let closedSeen = false;
  for (const seg of segs) {
    const p = (t - t0) / seg.ms;
    if (p < 1) {
      const base = {
        phase: seg.phase,
        swayDeg: 0,
        confettiMs: null,
        title: false,
        done: false,
        doorsClosed: closedSeen,
      };
      switch (seg.phase) {
        case 'showcase':
          return { ...base, door: startDoor + (1 - startDoor) * easeInOut(p) };
        case 'close':
          return { ...base, door: 1 - easeInOut(p) };
        case 'sway':
          return { ...base, door: 0, swayDeg: SWAY_DEG * Math.sin(2 * Math.PI * easeInOut(p)) };
        case 'settle':
          return { ...base, door: 0 };
        case 'celebrate':
          return { ...base, door: 0, confettiMs: t - t0, title: true };
        default:
          return { ...base, door: 0 };
      }
    }
    if (seg.phase === 'close') closedSeen = true;
    t0 += seg.ms;
  }
  return FINAL_SAMPLE;
}

export type RevealEvent = 'doorsClosed' | 'title' | 'done';

/**
 * Runs one reveal at a time. `start` while running is ignored (no duplicate triggers);
 * `skip` jumps to the final state. Events fire exactly once per run.
 */
export class RevealDirector {
  kind: RevealKind = 'none';
  private t = 0;
  private startDoor = 0;
  private running = false;
  private fired = new Set<RevealEvent>();
  private skipped = false;

  /** returns false if a reveal is already running (the call is ignored) */
  start(kind: RevealKind, startDoor = 0): boolean {
    if (this.running) return false;
    this.kind = kind;
    this.t = 0;
    this.startDoor = startDoor;
    this.fired = new Set();
    this.skipped = false;
    this.running = kind === 'full' || kind === 'short';
    return true;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get wasSkipped(): boolean {
    return this.skipped;
  }

  /** current sample (final state when not running) */
  sample(): RevealSample {
    if (!this.running) return FINAL_SAMPLE;
    return sampleReveal(this.kind, this.t, this.startDoor);
  }

  /** advance by `dtMs`; returns the sample and the events that happened in this step */
  tick(dtMs: number): { sample: RevealSample; events: RevealEvent[] } {
    if (this.running) this.t += dtMs;
    const sample = this.sample();
    if (sample.done) this.running = false;
    return { sample, events: this.collect(sample) };
  }

  /** jump to the final state (doors closed, showcase angle, title); fires pending events */
  skip(): RevealEvent[] {
    this.skipped = this.running;
    this.running = false;
    return this.collect(FINAL_SAMPLE);
  }

  /** stop without firing anything (unmount) */
  cancel(): void {
    this.running = false;
  }

  private collect(s: RevealSample): RevealEvent[] {
    const out: RevealEvent[] = [];
    const fire = (e: RevealEvent, cond: boolean) => {
      if (cond && !this.fired.has(e)) {
        this.fired.add(e);
        out.push(e);
      }
    };
    fire('doorsClosed', s.doorsClosed);
    fire('title', s.title);
    fire('done', s.done);
    return out;
  }
}
