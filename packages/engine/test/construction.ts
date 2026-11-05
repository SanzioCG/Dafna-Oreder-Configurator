import type { Panel } from '../src/index.js';

/**
 * ADR-009 (template 0.5.0): what an OLD panel list (sides on the plinth, plinth strips over
 * the full width) becomes with the new construction — sides to the floor, strips between the
 * sides. Every other panel is unchanged. Used to compare migrated drafts with old fixtures.
 */
export function toAdr009(old: Panel[]): Panel[] {
  const t = old.find((p) => p.id === 'side-left')?.thicknessMm ?? 16;
  return old.map((p) => {
    if (p.id === 'side-left' || p.id === 'side-right') {
      const top = p.position[1] + p.lengthMm / 2;
      return { ...p, lengthMm: top, position: [p.position[0], top / 2, p.position[2]] };
    }
    if (p.role === 'plinth') return { ...p, lengthMm: p.lengthMm - 2 * t };
    return p;
  });
}
