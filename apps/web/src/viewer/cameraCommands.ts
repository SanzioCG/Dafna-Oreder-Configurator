import type { FrameBox } from './framing';

/**
 * Explicit camera moves requested by the UI (D-3a). Only explicit selections produce them:
 * a section picked (tab or 3D tap), the size/colour steps (full model), the reset button.
 * `seq` makes every request distinct, even for the same target.
 */
export type CameraRequest =
  { kind: 'model' } | { kind: 'reset' } | { kind: 'selection'; box: FrameBox; id: string };

export type CameraCommand = CameraRequest & { seq: number };

/**
 * Never move the camera while the user is touching the 3D zone: a command submitted during a
 * gesture waits and starts after release. Only the latest pending command is kept.
 */
export class DeferredCommand<T> {
  private pending: T | null = null;

  submit(command: T): void {
    this.pending = command;
  }

  /** Returns the command to start now, or null (nothing pending, or pointer still down). */
  take(pointerDown: boolean): T | null {
    if (pointerDown || this.pending === null) return null;
    const c = this.pending;
    this.pending = null;
    return c;
  }

  get hasPending(): boolean {
    return this.pending !== null;
  }

  clear(): void {
    this.pending = null;
  }
}

/**
 * Timed camera move (ease-in-out). Only one runs at a time: start() while another is running
 * replaces it, starting from wherever the camera is now (the running move is cancelled, no
 * jump). Pure: the caller passes the clock and applies the returned pose.
 */
export class CameraAnimator<P> {
  private anim: { from: P; to: P; start: number; ms: number } | null = null;

  constructor(
    private readonly lerp: (a: P, b: P, t: number) => P,
    private readonly ease: (t: number) => number,
  ) {}

  start(from: P, to: P, now: number, ms: number): void {
    this.anim = { from, to, start: now, ms: Math.max(1, ms) };
  }

  /** pose at `now`, or null when idle; finishes exactly on the target */
  sample(now: number): P | null {
    const a = this.anim;
    if (!a) return null;
    const t = (now - a.start) / a.ms;
    if (t >= 1) {
      this.anim = null;
      return a.to;
    }
    return this.lerp(a.from, a.to, this.ease(t));
  }

  cancel(): void {
    this.anim = null;
  }

  get running(): boolean {
    return this.anim !== null;
  }
}
