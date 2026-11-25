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

describe('D-51 wardrobe sides as in "shkaf garderob лестер" (template 0.16.0)', () => {
  const cur = (over: Params = {}): GenerateResult =>
    generate(
      wardrobeTemplate,
      resolveParams(wardrobeTemplate, { ...defaultParams(wardrobeTemplate), ...over }).params,
    );
  const edgesX = (p: Panel) => [
    p.position[0] - p.thicknessMm / 2,
    p.position[0] + p.thicknessMm / 2,
  ];

  it('the sides 2 mm in from the ends and 2 mm short at the front; back, door and shelves follow', () => {
    // one section with two inset leaves (Bazis: 492 x 1830 x 400, X 2..18 / 474..490, one leaf)
    const W = 600;
    const r = cur({ width: W, height: 2000, depth: 450, sections: 1 });
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const top = panel(r, 'top');
    const topFront = top.position[2] + top.widthMm / 2;
    expect(top.lengthMm).toBe(W);
    expect(edgesX(panel(r, 'side-left'))).toEqual([2, 18]);
    expect(edgesX(panel(r, 'side-right'))).toEqual([W - 18, W - 2]);
    const side = panel(r, 'side-left');
    expect(side.widthMm).toBe(top.widthMm - 2);
    expect(side.position[2] + side.widthMm / 2).toBe(topFront - 2);
    // the back in its groove: inner width + 2 x 8 (Bazis 492 -> 472)
    expect(panel(r, 'back').lengthMm).toBe(W - 2 * (2 + 16) + 16);
    // the inset leaves: 3 mm from the sides and between, flush with the sides' front edge
    // (Bazis, one leaf: 492 - 2 x 18 - 2 x 3 = 450)
    const leaves = r.panels
      .filter((p) => p.role === 'door')
      .sort((a, b) => a.position[0] - b.position[0]);
    expect(leaves).toHaveLength(2);
    expect(leaves[0]!.position[0] - leaves[0]!.lengthMm / 2).toBe(18 + 3);
    expect(leaves[1]!.position[0] + leaves[1]!.lengthMm / 2).toBe(W - 18 - 3);
    expect(leaves[0]!.lengthMm + leaves[1]!.lengthMm).toBe(W - 2 * (2 + 16) - 3 * 3);
    for (const d of leaves) expect(d.position[2] + d.thicknessMm / 2).toBe(topFront - 2);
    expect(r.sections[0]!.xStartMm).toBe(18);
    expect(r.sections[0]!.innerWidthMm).toBe(W - 36);
    for (const sh of r.panels.filter((p) => p.role === 'shelf'))
      expect(sh.position[2] + sh.widthMm / 2).toBeLessThanOrEqual(topFront - 2 - 16);
  });

  it('two carcasses: each has its sides 2 mm in; nothing overlaps', () => {
    const r = cur({ width: 2000, sections: 'auto', carcasses: '2' });
    const [t1, t2] = [panel(r, 'top-1'), panel(r, 'top-2')];
    const end1 = t1.position[0] + t1.lengthMm / 2;
    expect(t2.position[0] - t2.lengthMm / 2).toBe(end1);
    expect(edgesX(panel(r, 'side-split-left'))[1]).toBe(end1 - 2);
    expect(edgesX(panel(r, 'side-split-right'))[0]).toBe(end1 + 2);
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
    const boards = r.panels.filter((p) => p.role !== 'frame' && p.role !== 'back');
    for (let i = 0; i < boards.length; i++)
      for (let j = i + 1; j < boards.length; j++) {
        const [A, B] = [box(boards[i]!), box(boards[j]!)];
        const hit = [0, 1, 2].every(
          (k) => A.min[k]! < B.max[k]! - 0.01 && B.min[k]! < A.max[k]! - 0.01,
        );
        expect(hit, `${boards[i]!.id} x ${boards[j]!.id}`).toBe(false);
      }
  });

  it('a 0.15.0 application keeps its sides (stored applications regenerate exactly)', () => {
    const v15 = TEMPLATE_ARCHIVE['0.15.0']!;
    const r = generate(v15, defaultParams(v15));
    expect(edgesX(r.panels.find((p) => p.id === 'side-left')!)).toEqual([0, 16]);
  });
});

describe('D-51 pedestal drawer bottom as in "Tum mobil" (template 0.7.0)', () => {
  const r = generate(pedestalTemplate, defaultParams(pedestalTemplate));
  const by = (id: string) => r.panels.find((p) => p.id === id)!;

  it('HDF 348 x 457 in the side grooves 10 mm up, 9 mm into the front, 2 mm short of the rear', () => {
    const b = by('s1-drawer-1-bottom');
    expect([b.lengthMm, b.widthMm, b.thicknessMm]).toEqual([348, 457, 3]);
    const side = by('s1-drawer-1-side-left');
    const boxBottom = side.position[1] - 60;
    expect(b.position[1] - 1.5).toBe(boxBottom + 10);
    const front = by('s1-drawer-1-front');
    const frontBack = front.position[2] - 8;
    expect(b.position[2] + b.widthMm / 2).toBe(frontBack + 9);
    const boxRear = side.position[2] - side.widthMm / 2;
    expect(b.position[2] - b.widthMm / 2).toBe(boxRear + 2);
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
