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
