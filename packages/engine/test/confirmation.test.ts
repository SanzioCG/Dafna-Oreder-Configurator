import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_ARCHIVE,
  defaultParams,
  generate,
  migrateOrderDraft,
  regenerateApplication,
  resolveParams,
  wardrobeTemplate,
  type GenerateResult,
  type Params,
} from '../src/index.js';

/**
 * D-22: the Dafna technologist's confirmation table (2026-11-23) in wardrobe template 0.12.0 -
 * top on the side panels, overlay or inset doors, confirmed gaps and setbacks.
 */
const T = wardrobeTemplate;
const gen = (over: Params = {}): GenerateResult =>
  generate(T, resolveParams(T, { ...defaultParams(T), ...over }).params);
const panel = (r: GenerateResult, id: string) => r.panels.find((p) => p.id === id)!;
const banded = (r: GenerateResult, id: string) =>
  Object.entries(panel(r, id).edges)
    .filter(([, e]) => e.bandId)
    .map(([k]) => k);

describe('D-22 confirmed values (template 0.12.0)', () => {
  it('confirmed constants: gaps 2 / 3 / 3, leaf <= 500, whole mm, setbacks 20, rail shelf 200', () => {
    const c = (k: string) => T.constants[k]!;
    expect(
      [
        'doorGapFrontMm',
        'doorGapBetweenMm',
        'doorGapEdgeMm',
        'maxSingleLeafWidthMm',
        'doorLeafRoundingMm',
        'insetDoorGapMm',
        'shelfFrontSetbackMm',
        'railTopShelfDropMm',
        'drawerFrontSetbackMm',
      ].map((k) => [k, c(k).value, c(k).unconfirmed]),
    ).toEqual([
      ['doorGapFrontMm', 2, false],
      ['doorGapBetweenMm', 3, false],
      ['doorGapEdgeMm', 3, false],
      ['maxSingleLeafWidthMm', 500, false],
      ['doorLeafRoundingMm', 1, false],
      ['insetDoorGapMm', 2, false],
      ['shelfFrontSetbackMm', 20, false],
      ['railTopShelfDropMm', 200, false],
      ['drawerFrontSetbackMm', 20, false],
    ]);
    // slide-dependent values wait for the hardware list
    expect(c('drawerSlideClearanceMm').unconfirmed).toBe(true);
  });

  it('the top lies on the sides (ends banded); the bottom stays between them', () => {
    const r = gen({ width: 1500, height: 2100 });
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(panel(r, 'top').lengthMm).toBe(1500);
    expect(panel(r, 'bottom').lengthMm).toBe(1500 - 2 * 16);
    expect(panel(r, 'side-left').lengthMm).toBe(2100 - 16);
    expect(banded(r, 'top')).toEqual(['front', 'left', 'right']);
    expect(banded(r, 'bottom')).toEqual(['front']);
    // two carcasses: the ends where they meet are not banded
    const two = gen({ width: 1800 });
    expect(banded(two, 'top-1')).toEqual(['front', 'left']);
    expect(banded(two, 'top-2')).toEqual(['front', 'right']);
    expect(panel(two, 'top-1').lengthMm + panel(two, 'top-2').lengthMm).toBe(1800);
  });

  it('overlay doors: 3 mm at the edges, leaves at most 500 mm, whole millimetres', () => {
    const r = gen({ width: 1500 });
    const doors = r.panels.filter((p) => p.role === 'door');
    expect(doors.every((d) => d.lengthMm <= 500 && Number.isInteger(d.lengthMm))).toBe(true);
    expect(doors[0]!.position[0] - doors[0]!.lengthMm / 2).toBe(3);
    expect(doors[0]!.widthMm).toBe(2000 - 2 * 3); // carcass height - 2 x edge gap
    // shelves 20 mm behind the carcass front
    const s = r.sections[0]!;
    expect(s.shelves[0]!.depthMm).toBe(s.innerDepthMm - 20);
  });

  it('inset doors: inside the openings, flush with the carcass front, 2 mm all round', () => {
    const over = gen({ width: 1200, doorMount: 'overlay' });
    const r = gen({ width: 1200, doorMount: 'inset', interior1: 'drawers_shelves' });
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const d = r.dimensions!;
    // the door adds nothing to the depth: carcass = depth - back
    expect(d.carcassDepthMm).toBe(600 - 3);
    expect(over.dimensions!.carcassDepthMm).toBe(600 - 3 - 16 - 2);
    const sec = r.sections[0]!;
    const leaves = r.panels.filter((p) => p.role === 'door' && p.sectionIndex === 0);
    expect(leaves.every((l) => l.hingeMount === 'inset')).toBe(true);
    const left = leaves[0]!.position[0] - leaves[0]!.lengthMm / 2;
    const right = leaves.at(-1)!.position[0] + leaves.at(-1)!.lengthMm / 2;
    expect(left).toBe(sec.xStartMm + 2);
    expect(right).toBe(sec.xStartMm + sec.innerWidthMm - 2);
    expect(leaves[0]!.widthMm).toBe(sec.innerHeightMm - 2 * 2);
    // front face flush with the carcass front edge
    expect(leaves[0]!.position[2] + 16 / 2).toBe(3 + 597);
    // drawer fronts 20 mm behind the door's back face; shelves likewise
    const front = r.panels.find((p) => p.role === 'drawer_front')!;
    expect(front.position[2] + 16 / 2).toBe(3 + 597 - 16 - 20);
    const shelf = sec.shelves[0]!;
    expect(shelf.depthMm).toBe(597 - 16 - 20);
  });

  it('older templates keep their construction; migrating reports the change', () => {
    const v11 = TEMPLATE_ARCHIVE['0.11.0']!;
    const old = generate(v11, defaultParams(v11));
    expect(old.panels.find((p) => p.id === 'top')?.lengthMm).toBe(1500 - 2 * 16);
    const r = regenerateApplication(defaultParams(v11), '0.11.0');
    if (!r.ok) throw new Error(r.code);
    const { draft, issues } = migrateOrderDraft(r.draft);
    expect(draft?.templateVersion).toBe('0.12.0');
    expect(issues.map((i) => i.code)).toContain('MIGRATION_CONSTRUCTION_CHANGED');
    expect(draft?.panels.find((p) => p.id === 'top')?.lengthMm).toBe(1500);
  });

  it('an old staff door choice now wider than 500 mm is dropped and reported', () => {
    const old = {
      ...defaultParams(TEMPLATE_ARCHIVE['0.11.0']!),
      width: 2400,
      sections: 4,
      doorSection2: 'single_left',
    };
    const r = regenerateApplication(old, '0.11.0');
    if (!r.ok) throw new Error(r.code);
    const { draft, issues } = migrateOrderDraft(r.draft);
    expect(draft).not.toBeNull();
    expect(issues.find((i) => i.code === 'MIGRATION_DOORS_CHANGED')?.values).toMatchObject({
      sectionNumber: 2,
      from: 'single_left',
      to: 'double',
    });
  });
});
