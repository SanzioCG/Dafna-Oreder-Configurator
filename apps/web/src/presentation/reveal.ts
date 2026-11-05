/**
 * Presentation reveal (D-3a): pure timeline + director. The render loop calls `tick(dt)` and
 * applies the sample (door progress, turn angle) through refs; React only hears about the few
 * discrete events (doors closed, title, done).
 *
 * Full sequence (first time a configuration revision is presented):
 *   a) showcase  0.8 s  camera to the three-quarter showcase pose, doors open (if any)
 *   b) close     1.2 s  doors close around their real hinge pivots, ease-in-out
 *   c) turn      8.0 s  exactly ONE 360° turn of the wardrobe around its vertical axis, constant
 *                       angular velocity with 0.3 s linear-acceleration ramps, ending at the
 *                       three-quarter showcase angle (the back panel is seen once)
 * (D-4: no celebration phase and no particles — the title is shown for the whole presentation.)
 * Short version (presented again after an edit): doors close only (brief open, close, settle —
 * 1.5 s), no turn, no particles. Same revision again: no animation. prefers-reduced-motion:
 * final state directly.
 */

export type RevealKind = 'full' | 'short' | 'none' | 'instant';
export type RevealPhase = 'showcase' | 'close' | 'turn' | 'settle' | 'done';

/** One full turn (radians). */
export const TURN_RAD = 2 * Math.PI;
export const TURN_MS = 8000;
/** ease-in / ease-out ramp of the turn (linear acceleration) */
export const TURN_RAMP_MS = 300;

/**
 * Turn angle at `t` ms into the turn phase: 0 -> 2π. Constant angular velocity
 * v = 2π / (T − ramp) between two linear-acceleration ramps, so the area under the velocity
 * curve is exactly one turn and the wardrobe ends where it started (showcase angle).
 */
export function turnAngle(t: number, total = TURN_MS, ramp = TURN_RAMP_MS): number {
  const v = TURN_RAD / (total - ramp); // rad per ms at full speed
  if (t <= 0) return 0;
  if (t >= total) return TURN_RAD;
  if (t < ramp) return (v * t * t) / (2 * ramp);
  if (t > total - ramp) {
    const r = total - t;
    return TURN_RAD - (v * r * r) / (2 * ramp);
  }
  return (v * ramp) / 2 + v * (t - ramp);
}

interface Segment {
  phase: RevealPhase;
  ms: number;
}

export const TIMELINES: Record<'full' | 'short', Segment[]> = {
  full: [
    { phase: 'showcase', ms: 800 },
    { phase: 'close', ms: 1200 },
    { phase: 'turn', ms: TURN_MS },
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
  /** wardrobe rotation around its vertical axis, radians (0 = showcase angle) */
  turnRad: number;
  doorsClosed: boolean;
  title: boolean;
  done: boolean;
}

export const FINAL_SAMPLE: RevealSample = {
  phase: 'done',
  door: 0,
  turnRad: 0,
  doorsClosed: true,
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
        turnRad: 0,
        title: false,
        done: false,
        doorsClosed: closedSeen,
      };
      switch (seg.phase) {
        case 'showcase':
          return { ...base, door: startDoor + (1 - startDoor) * easeInOut(p) };
        case 'close':
          return { ...base, door: 1 - easeInOut(p) };
        case 'turn':
          return { ...base, door: 0, turnRad: turnAngle(t - t0, seg.ms) };
        case 'settle':
          return { ...base, door: 0 };
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
