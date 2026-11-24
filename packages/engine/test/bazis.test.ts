import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_ARCHIVE,
  computeBom,
  defaultParams,
  deskTemplate,
  generate,
  migrateOrderDraft,
  pedestalTemplate,
  regenerateApplication,
  resolveParams,
  wardrobeTemplate,
  type GenerateResult,
  type Panel,
  type Params,
} from '../src/index.js';

/**
 * D-26: wardrobe template 0.13.0 follows Dafna's Bazis models (docs/production/bazis/ANALIZ.md):
 * feet, full-width top and bottom with the sides between them, the back in a groove, inset
 * doors with 3 mm gaps, shelves 17 / 5 mm from the front, two edge bands.
 */
/** D-26 values on template 0.13.0 (0.14.0: inset doors span the partitions, D-27) */
const T = TEMPLATE_ARCHIVE['0.13.0']!;
const gen = (over: Params = {}): GenerateResult =>
  generate(T, resolveParams(T, { ...defaultParams(T), ...over }).params);
const panel = (r: GenerateResult, id: string) => r.panels.find((p) => p.id === id)!;
const bands = (p: Panel) =>
  Object.fromEntries(Object.entries(p.edges).map(([k, e]) => [k, e.thicknessMm]));

describe('D-26 wardrobe as in the Bazis models (template 0.13.0)', () => {
  it('feet 20 mm; full-width top and bottom, the sides between them', () => {
    const r = gen({ width: 1500, height: 2100 });
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(T.parameters.find((p) => p.key === 'base')?.default).toBe('feet');
    expect(panel(r, 'bottom').lengthMm).toBe(1500);
    expect(panel(r, 'top').lengthMm).toBe(1500);
    expect(panel(r, 'bottom').position[1]).toBe(20 + 8);
    expect(panel(r, 'side-left').lengthMm).toBe(2100 - 20 - 2 * 16);
    const feet = r.panels.filter((p) => p.id.startsWith('foot'));
    expect(feet).toHaveLength(4);
    expect(feet.every((f) => f.thicknessMm === 20 && f.role === 'frame')).toBe(true);
    expect(r.panels.some((p) => p.role === 'plinth')).toBe(false);
  });

  it('the back sits in a groove 12 mm from the rear, 8 mm into every panel', () => {
    const r = gen({ width: 1500, height: 2100, depth: 600 });
    const back = panel(r, 'back');
    expect([back.lengthMm, back.widthMm]).toEqual([1500 - 32 + 16, 2080 - 32 + 16]);
    expect(back.position[2]).toBe(12 + 1.5);
    // partitions stop at the back's front face; the depth stack has no back behind the carcass
    expect(panel(r, 'partition-1').widthMm).toBe(600 - 15);
    expect(r.dimensions?.carcassDepthMm).toBe(600);
  });

  it('inset doors by default, 3 mm all round; shelves 1 mm behind the door (17 from the front)', () => {
    const r = gen({ width: 1500 });
    const doors = r.panels.filter((p) => p.role === 'door');
    expect(doors.every((d) => d.hingeMount === 'inset')).toBe(true);
    const s = r.sections[0]!;
    const left = doors[0]!.position[0] - doors[0]!.lengthMm / 2;
    expect(left).toBe(s.xStartMm + 3);
    const shelf = r.panels.find((p) => p.role === 'shelf' && p.sectionIndex === 0)!;
    expect(shelf.position[2] + shelf.widthMm / 2).toBe(600 - 17);
    expect(shelf.lengthMm).toBe(s.innerWidthMm - 2); // removable: 1 mm each side
  });

  it('an open section (no door) has its shelves 5 mm from the front', () => {
    const r = gen({ width: 1500, doorSection2: 'none', interior2: 'shelves' });
    const shelf = r.panels.find((p) => p.role === 'shelf' && p.sectionIndex === 1)!;
    expect(shelf.position[2] + shelf.widthMm / 2).toBe(600 - 5);
  });

  it('edge bands: 1 mm on doors and the top / bottom front and ends, 0.4 mm elsewhere', () => {
    const r = gen({ width: 1500 });
    expect(bands(panel(r, 'door-1-left'))).toEqual({ front: 1, back: 1, left: 1, right: 1 });
    expect(bands(panel(r, 'top'))).toEqual({ front: 1, back: 0.4, left: 1, right: 1 });
    expect(bands(panel(r, 'side-left'))).toEqual({
      front: 0.4,
      back: 0.4,
      left: null,
      right: null,
    });
    expect(bands(panel(r, 'partition-1'))).toEqual({
      front: 0.4,
      back: null,
      left: null,
      right: null,
    });
    const bom = computeBom(T, defaultParams(T), r);
    expect(
      bom
        .filter((l) => l.kind === 'edge')
        .map((l) => l.ref)
        .sort(),
    ).toEqual(['pvc_0_4_19', 'pvc_1_19']);
    // two carcasses: the top ends where they meet are not banded
    const two = gen({ width: 2000 });
    expect(bands(panel(two, 'top-1')).right).toBeNull();
    expect(bands(panel(two, 'top-2')).left).toBeNull();
  });

  it('boards never overlap except the back in its grooves; feet stand on the floor', () => {
    const variants: Params[] = [{}, { width: 2000 }, { base: 'plinth', doorMount: 'overlay' }];
    for (const over of variants) {
      const r = gen(over);
      const box = (p: Panel) => {
        const r0 = p.rotation.join(',');
        const e =
          r0 === '0,0,90'
            ? [p.thicknessMm, p.lengthMm, p.widthMm]
            : r0 === '90,0,0'
              ? [p.lengthMm, p.widthMm, p.thicknessMm]
              : [p.lengthMm, p.thicknessMm, p.widthMm];
        return {
          min: p.position.map((c, k) => c - e[k]! / 2),
          max: p.position.map((c, k) => c + e[k]! / 2),
        };
      };
      const boards = r.panels.filter((p) => p.role !== 'frame');
      for (let i = 0; i < boards.length; i++)
        for (let j = i + 1; j < boards.length; j++) {
          const [a, b] = [boards[i]!, boards[j]!];
          if (a.role === 'back' || b.role === 'back') continue; // the groove is a planned overlap
          const A = box(a);
          const B = box(b);
          const hit = [0, 1, 2].every(
            (k) => A.min[k]! < B.max[k]! - 0.01 && B.min[k]! < A.max[k]! - 0.01,
          );
          expect(hit, `${a.id} x ${b.id}`).toBe(false);
        }
    }
  });

  it('a draft before 0.13.0 migrates (no plinth -> feet) and reports the construction change', () => {
    const v12 = TEMPLATE_ARCHIVE['0.12.0']!;
    const r = regenerateApplication({ ...defaultParams(v12), base: 'none' }, '0.12.0');
    if (!r.ok) throw new Error(r.code);
    const { draft, issues } = migrateOrderDraft(r.draft);
    expect(draft?.templateVersion).toBe(wardrobeTemplate.templateVersion);
    expect(draft?.params.base).toBe('feet');
    expect(issues.map((i) => i.code)).toContain('MIGRATION_CONSTRUCTION_CHANGED');
  });
});

describe('D-26 mobile pedestal as in "Tum mobil" (template 0.5.0)', () => {
  const r = generate(pedestalTemplate, defaultParams(pedestalTemplate));
  const by = (id: string) => r.panels.find((p) => p.id === id)!;

  it('top and bottom full size on 55 mm castors; sides between them, 5 mm in, 15 mm from the rear', () => {
    expect(r.issues).toEqual([]);
    expect([by('top').lengthMm, by('top').widthMm, by('bottom').position[1]]).toEqual([
      430, 550, 63,
    ]);
    expect([by('side-left').lengthMm, by('side-left').widthMm]).toEqual([463, 515]);
    expect(by('side-left').position[0]).toBe(5 + 8);
    expect(by('castor-1').thicknessMm).toBe(55);
    // a board back of the carcass decor, between the sides, 16 mm from the rear
    expect([by('back').lengthMm, by('back').thicknessMm, by('back').position[2]]).toEqual([
      388, 16, 24,
    ]);
  });

  it('fronts 416 x 150 between bottom and top; the top reaches 4 mm past them', () => {
    const fronts = r.panels.filter((p) => p.role === 'drawer_front');
    expect(fronts.map((f) => [f.lengthMm, f.widthMm, f.position[1] - f.widthMm / 2])).toEqual([
      [416, 150, 75],
      [416, 150, 228],
      [416, 150, 381],
    ]);
    expect(fronts[0]!.position[2] + 8).toBe(550 - 4);
  });

  it('drawer box 120 mm high, 14 mm above the front edge, 13 mm slide clearance', () => {
    const d = r.sections[0]!.drawers[0]!;
    expect([d.boxHeightMm, d.boxWidthMm, d.boxDepthMm]).toEqual([120, 388 - 26, 450]);
    const side = by('s1-drawer-1-side-left');
    expect(side.position[1] - 60).toBe(75 + 14);
  });
});

describe('D-26 / D-36 desk as in "stol 1500" (template 0.5.0)', () => {
  const r = generate(deskTemplate, { ...defaultParams(deskTemplate), width: 1500 });
  const by = (id: string) => r.panels.find((p) => p.id === id)!;

  it('two full top sheets, the lower one banded 1 mm x 35 over both', () => {
    expect(r.issues).toEqual([]);
    expect([by('worktop').position[1], by('worktop-under').position[1]]).toEqual([742, 726]);
    expect(by('worktop').edges.front.bandId).toBeNull();
    expect(by('worktop-under').edges.front).toEqual({ bandId: 'pvc_1_35', thicknessMm: 1 });
  });

  it('legs of two boards, 5 mm in, on 5 mm pads; three stepped modesty layers', () => {
    const legs = r.panels.filter((p) => p.role === 'leg');
    expect(legs.map((l) => [l.id, l.lengthMm, l.widthMm, l.position[0]])).toEqual([
      ['leg-left', 713, 690, 13],
      ['leg-left-2', 713, 690, 29],
      ['leg-right', 713, 690, 1487],
      ['leg-right-2', 713, 690, 1471],
    ]);
    const m = r.panels.filter((p) => p.role === 'modesty');
    expect(m.map((x) => [x.lengthMm, x.widthMm, x.position[1] + x.widthMm / 2])).toEqual([
      [1426, 466, 718],
      [1426, 316, 718],
      [1426, 166, 718],
    ]);
    // D-36: on the front side as in Bazis (Z 617..665), the shortest layer outermost
    expect(m.map((x) => [x.widthMm, x.position[2] - 8, x.position[2] + 8])).toEqual([
      [466, 617, 633],
      [316, 633, 649],
      [166, 649, 665],
    ]);
  });
});
