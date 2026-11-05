import type { Panel } from '@dafna/engine';

/** Opening angles of the door animation (duration: DOOR_ANIM_SECONDS in Wardrobe3D). */
export const DOOR_OPEN_DEG = 100;
/** Leaves hinged on the same partition stop here so they never cross each other (D-1c). */
export const DOOR_OPEN_SHARED_DEG = 85;

/**
 * Partition (or outer side) a door leaf hinges on: 0 = left side panel, k = partition between
 * section k and k+1, n = right side panel.
 */
function hingeLine(p: Panel): number {
  const s = p.sectionIndex ?? 0;
  return p.hingeSide === 'right' ? s + 1 : s;
}

/** Open angle per leaf: 85° when another leaf hinges on the same partition, else 100°. */
export function openAngles(panels: Panel[]): Map<string, number> {
  const doors = panels.filter((p) => p.role === 'door');
  const count = new Map<number, number>();
  for (const d of doors) count.set(hingeLine(d), (count.get(hingeLine(d)) ?? 0) + 1);
  return new Map(
    doors.map((d) => [
      d.id,
      (count.get(hingeLine(d)) ?? 0) > 1 ? DOOR_OPEN_SHARED_DEG : DOOR_OPEN_DEG,
    ]),
  );
}
