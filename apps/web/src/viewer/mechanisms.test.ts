import { defaultParams, generate, pedestalTemplate, wardrobeTemplate } from '@dafna/engine';
import { describe, expect, it } from 'vitest';
import { demoProgress, drawerGroups, hingeOffsets, panelBox } from './mechanisms';
import { slideBars } from './Wardrobe3D';

describe('D-10 mechanisms in 3D', () => {
  it('hinges: 100 mm from each end, the rest evenly', () => {
    expect(hingeOffsets(700, 2)).toEqual([100, 600]);
    expect(hingeOffsets(2100, 5)).toEqual([100, 575, 1050, 1525, 2000]);
  });

  it('closing demo: Strax slams shut, Hettich brakes to a slow stop; both reopen and end', () => {
    // Strax is shut by 0.5 s; Hettich is still closing then, and slowly
    expect(demoProgress('strax', 0.5)).toBeCloseTo(0);
    const soft = demoProgress('hettich', 0.5)!;
    expect(soft).toBeGreaterThan(0);
    expect(soft).toBeLessThan(0.15);
    // the soft end moves much slower than the free close
    const slow = demoProgress('hettich', 1.0)! - demoProgress('hettich', 1.1)!;
    const fast = demoProgress('strax', 0.3)! - demoProgress('strax', 0.4)!;
    expect(slow).toBeLessThan(fast / 5);
    expect(demoProgress('hettich', 2.0)).toBe(0);
    expect(demoProgress('strax', 2.19)).toBeGreaterThan(0.9);
    expect(demoProgress('strax', 3)).toBeNull();
    expect(demoProgress('hettich', 4)).toBeNull();
  });

  it('drawers group their panels; slides: Strax on the sides, Hettich under the bottom', () => {
    const r = generate(pedestalTemplate, defaultParams(pedestalTemplate));
    const groups = drawerGroups(r.panels);
    expect(groups.size).toBe(3);
    const parts = groups.get('s1-drawer-1')!;
    expect(parts.map((p) => p.role).sort()).toContain('drawer_front');
    const sides = parts.filter((p) => p.role === 'drawer_side').map(panelBox);
    const bottom = panelBox(parts.find((p) => p.role === 'drawer_bottom')!);
    const xMin = Math.min(...sides.map((b) => b.min[0]));
    const xMax = Math.max(...sides.map((b) => b.max[0]));

    const strax = slideBars(parts, 'strax');
    expect(strax.moving).toHaveLength(2);
    for (const b of strax.moving) {
      // outside the drawer box, beside its sides
      expect(b.position[0] < xMin || b.position[0] > xMax).toBe(true);
    }
    const hettich = slideBars(parts, 'hettich');
    for (const b of hettich.moving) {
      expect(b.position[1]).toBeLessThan(Math.min(bottom.min[1], ...sides.map((s) => s.min[1])));
      expect(b.position[0]).toBeGreaterThanOrEqual(xMin);
      expect(b.position[0]).toBeLessThanOrEqual(xMax);
    }
  });

  it('a wardrobe door is a vertical board: its box height is the leaf height', () => {
    const r = generate(wardrobeTemplate, defaultParams(wardrobeTemplate));
    const door = r.panels.find((p) => p.role === 'door')!;
    const b = panelBox(door);
    expect(b.max[1] - b.min[1]).toBeCloseTo(door.widthMm);
    expect(b.max[2] - b.min[2]).toBeCloseTo(door.thicknessMm);
  });
});

describe('D-13 doors and drawers never pass through each other', () => {
  it('a wardrobe with inner drawers: the doors in front of them cover them', async () => {
    const { doorCoverage } = await import('./mechanisms');
    const { resolveParams } = await import('@dafna/engine');
    const params = resolveParams(wardrobeTemplate, {
      ...defaultParams(wardrobeTemplate),
      interior1: 'drawers_shelves',
    }).params;
    const r = generate(wardrobeTemplate, params);
    const drawers = drawerGroups(r.panels);
    const cov = doorCoverage(r.panels);
    const covered = new Set([...cov.values()].flat());
    expect(drawers.size).toBeGreaterThan(0);
    // every inner drawer is behind at least one door
    for (const id of drawers.keys()) expect(covered.has(id)).toBe(true);
    // a door never covers a drawer of another section's height band it does not overlap
    for (const [, list] of cov) for (const id of list) expect(drawers.has(id)).toBe(true);
  });

  it('a pedestal: its drawers have their own fronts, no door covers them', async () => {
    const { doorCoverage } = await import('./mechanisms');
    const r = generate(pedestalTemplate, defaultParams(pedestalTemplate));
    expect([...doorCoverage(r.panels).values()].flat()).toEqual([]);
  });
});
