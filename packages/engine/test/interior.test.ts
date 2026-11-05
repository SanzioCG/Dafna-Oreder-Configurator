import { describe, expect, it } from 'vitest';
import {
  defaultParams,
  evenShelfBottoms,
  generate,
  validate,
  wardrobeTemplate as T,
  type GenerateResult,
  type Params,
} from '../src/index.js';

/** D-1b reference configuration (3 sections, depth 516) so the exact mm below stay comparable. */
const gen = (overrides: Partial<Params> = {}) =>
  generate(T, { ...defaultParams(T), sections: 3, depth: 516, ...overrides });
const sec = (r: GenerateResult, i: number) => {
  const s = r.sections[i];
  if (!s) throw new Error(`section ${i} missing`);
  return s;
};
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

describe('evenShelfBottoms: count from the 334 mm pitch target, equal openings, 0.5 mm', () => {
  it.each([
    // available height, expected shelf bottom faces (relative to the floor of the space), t = 16
    [1600, [307, 630.5, 953.5, 1277]],
    [1766, [340.5, 697, 1053, 1409.5]],
    [2200, [300.5, 617, 933.5, 1250.5, 1567, 1883.5]],
  ])('available %i mm -> %j', (available, expected) => {
    expect(evenShelfBottoms(0, available, 16, 334)).toEqual(expected);
  });

  it('no room or less than one pitch -> no shelves', () => {
    expect(evenShelfBottoms(100, 100, 16, 334)).toEqual([]);
    expect(evenShelfBottoms(0, 200, 16, 334)).toEqual([]);
  });
});

describe('default interior (auto)', () => {
  it('single doors -> shelves: 4 removable shelves per section on 1768 mm', () => {
    const r = gen();
    expect(r.issues).toEqual([]);
    for (const i of [0, 1, 2]) {
      const s = sec(r, i);
      expect([s.preset, s.presetSource]).toEqual(['shelves', 'auto']);
      expect(s.shelves.map((x) => [x.kind, x.yMm, x.lengthMm, x.depthMm])).toEqual([
        ['removable', 457, 432, 491],
        ['removable', 813.5, 432, 491],
        ['removable', 1170.5, 432, 491],
        ['removable', 1527, 432, 491],
      ]);
    }
    const shelf = r.panels.find((p) => p.id === 's1-shelf-1');
    expect(
      shelf && [shelf.role, shelf.lengthMm, shelf.widthMm, shelf.thicknessMm, ...shelf.position],
    ).toEqual(['shelf', 432, 491, 16, 232, 465, 3 + 491 / 2]);
  });

  it('double door -> rail_shelf when deep enough, otherwise falls back to shelves (never warns)', () => {
    const deep = gen({ width: 1207, sections: 2, depth: 600 });
    expect(sec(deep, 0).doorType).toBe('double');
    expect([sec(deep, 0).preset, sec(deep, 0).presetSource]).toEqual(['rail_shelf', 'auto']);
    const shallow = gen({ width: 1207, sections: 2 }); // carcass depth 495 < 530
    expect([sec(shallow, 0).preset, sec(shallow, 0).presetSource]).toEqual(['shelves', 'auto']);
    expect(shallow.issues).toEqual([]);
  });
});

describe('rail presets', () => {
  it('rail_shelf: top shelf 400 below the top inner face, rail axis 60 below it', () => {
    const r = gen({ depth: 600, interior1: 'rail_shelf' });
    const s = sec(r, 0);
    // yTop = 1900 - 16 = 1884: shelf top face 1484 -> bottom 1468; rail 1408; floor 116
    expect(s.shelves.map((x) => [x.kind, x.yMm])).toEqual([['top', 1468]]);
    expect(s.rails).toEqual([
      { id: 's1-rail', axisYMm: 1408, lengthMm: 432, diameterMm: 25, zMm: 3 + 579 / 2 },
    ]);
    expect(s.clearHangingHeightMm).toBe(1408 - 116);
    expect(r.rails).toEqual([
      {
        id: 's1-rail',
        sectionIndex: 0,
        lengthMm: 432,
        diameterMm: 25,
        position: [232, 1408, 292.5],
      },
    ]);
  });

  it('rail (no shelf): axis 60 below the top inner face', () => {
    const s = sec(gen({ depth: 600, interior1: 'rail' }), 0);
    expect(s.rails[0]?.axisYMm).toBe(1884 - 60);
    expect(s.shelves).toEqual([]);
  });

  it('RAIL_DEPTH_SHORT: carcass inner depth < 530 (warning, geometry kept)', () => {
    // depth 551 -> carcass 530: no warning; 550 -> 529: warning
    expect(codes(gen({ depth: 551, interior1: 'rail_shelf' }))).toEqual([]);
    const r = gen({ depth: 550, interior1: 'rail_shelf' });
    expect(r.issues).toEqual([
      {
        code: 'RAIL_DEPTH_SHORT',
        severity: 'warning',
        paramKey: 'interior1',
        messageKey: 'issue.RAIL_DEPTH_SHORT',
        values: {
          sectionIndex: 0,
          sectionNumber: 1,
          preset: 'rail_shelf',
          innerDepthMm: 529,
          minMm: 530,
        },
      },
    ]);
    expect(r.rails.length).toBe(1);
  });

  it('RAIL_HEIGHT_SHORT: clear hanging height < 900', () => {
    // rail_drawers: hanging = rail axis - fixed shelf top = (yTop - 476) - 481
    // height 1857 -> yTop 1841 -> hang 884 (warn); 1873 -> yTop 1857 -> hang 900 (ok)
    expect(
      sec(gen({ depth: 600, height: 1873, interior1: 'rail_drawers' }), 0).clearHangingHeightMm,
    ).toBe(900);
    expect(codes(gen({ depth: 600, height: 1873, interior1: 'rail_drawers' }))).toEqual([]);
    const r = gen({ depth: 600, height: 1857, interior1: 'rail_drawers' });
    expect(
      r.issues.map((i) => [i.code, i.paramKey, i.values.clearHangingHeightMm, i.values.minMm]),
    ).toEqual([['RAIL_HEIGHT_SHORT', 'interior1', 884, 900]]);
  });
});

describe('internal drawers', () => {
  it('2 drawers at the bottom, fixed shelf above, box sized from the section width', () => {
    const r = gen({ depth: 600, interior3: 'drawers_shelves' });
    const s = sec(r, 2);
    // zone = 3 + 2 x (170 + 3) = 349 above the bottom (116): fixed shelf bottom 465
    expect(s.drawers).toEqual([
      {
        id: 's3-drawer-1',
        frontYMm: 119,
        frontHeightMm: 170,
        frontWidthMm: 406,
        boxWidthMm: 406,
        boxDepthMm: 500,
        boxHeightMm: 130,
      },
      {
        id: 's3-drawer-2',
        frontYMm: 292,
        frontHeightMm: 170,
        frontWidthMm: 406,
        boxWidthMm: 406,
        boxDepthMm: 500,
        boxHeightMm: 130,
      },
    ]);
    expect(s.shelves.map((x) => [x.kind, x.yMm])).toEqual([
      ['fixed', 465],
      ['removable', 820],
      ['removable', 1174.5],
      ['removable', 1529.5],
    ]);
    const part = (suffix: string) => {
      const p = r.panels.find((x) => x.id === `s3-drawer-1-${suffix}`);
      if (!p) throw new Error(suffix);
      return [p.role, p.lengthMm, p.widthMm, p.thicknessMm, p.material];
    };
    expect(part('front')).toEqual(['drawer_front', 406, 170, 16, 'ldsp_white_16']);
    expect(part('side-left')).toEqual(['drawer_side', 130, 500, 16, 'ldsp_white_16']);
    expect(part('side-right')).toEqual(['drawer_side', 130, 500, 16, 'ldsp_white_16']);
    expect(part('back')).toEqual(['drawer_back', 406 - 32, 130, 16, 'ldsp_white_16']);
    expect(part('bottom')).toEqual(['drawer_bottom', 406, 500, 3, 'hdf_white_3']);
  });

  it('box depth = longest 50 mm slide that fits (carcass 495 -> 450)', () => {
    expect(sec(gen({ interior1: 'drawers_shelves' }), 0).drawers[0]?.boxDepthMm).toBe(450);
  });

  it('DRAWER_SECTION_TOO_WIDE when the front would exceed 900 mm', () => {
    // front = inner - 2 x 13: inner 926 -> 900 ok, 927 -> 901 warn (1 section, no doors)
    const ok = validate({
      ...defaultParams(T),
      width: 958,
      sections: 1,
      doors: 'none',
      interior1: 'drawers_shelves',
    });
    expect(ok.map((i) => i.code)).toEqual(['SHELF_SPAN']);
    const wide = validate({
      ...defaultParams(T),
      width: 959,
      sections: 1,
      doors: 'none',
      interior1: 'drawers_shelves',
    });
    expect(wide.map((i) => [i.code, i.values.frontWidthMm ?? i.values.innerWidthMm])).toEqual([
      ['SHELF_SPAN', 927],
      ['DRAWER_SECTION_TOO_WIDE', 901],
    ]);
  });
});

describe('production-ready panel fields', () => {
  it('every generated panel has edges, grainDirection and operations', () => {
    for (const input of [
      {},
      { depth: 600, interior1: 'rail_drawers', interior2: 'drawers_shelves' },
      { doors: 'none', backPanel: 'none', base: 'none' },
    ]) {
      const r = gen(input);
      expect(r.panels.length).toBeGreaterThan(0);
      for (const p of r.panels) {
        expect(Object.keys(p.edges).sort(), p.id).toEqual(['back', 'front', 'left', 'right']);
        expect(['length', 'width', null]).toContain(p.grainDirection);
        expect(p.operations).toEqual([]);
      }
    }
  });

  it('visible front edges are banded with the 0.8 mm placeholder, others are null', () => {
    const r = gen({ depth: 600, interior1: 'drawers_shelves' });
    const band = { bandId: 'abs_0_8_placeholder', thicknessMm: 0.8 };
    const none = { bandId: null, thicknessMm: null };
    const edgesOf = (id: string) => r.panels.find((p) => p.id === id)?.edges;
    for (const id of ['side-left', 'partition-1', 'top', 'bottom', 's1-shelf-fixed']) {
      expect(edgesOf(id), id).toEqual({ front: band, back: none, left: none, right: none });
    }
    for (const id of ['door-1', 's1-drawer-1-front']) {
      expect(edgesOf(id), id).toEqual({ front: band, back: band, left: band, right: band });
    }
    for (const id of ['back', 'plinth-front', 's1-drawer-1-side-left', 's1-drawer-1-bottom']) {
      expect(edgesOf(id), id).toEqual({ front: none, back: none, left: none, right: none });
    }
    expect(r.panels.find((p) => p.id === 'back')?.grainDirection).toBeNull();
    expect(r.panels.find((p) => p.id === 'door-1')?.grainDirection).toBe('length');
  });
});

describe('interior determinism and ordering', () => {
  it('same input -> deep-equal output; interior panels after doors, per section L->R', () => {
    const input = { depth: 600, interior1: 'rail_drawers', interior3: 'drawers_shelves' };
    expect(JSON.stringify(gen(input))).toBe(JSON.stringify(gen(input)));
    const ids = gen(input).panels.map((p) => p.id);
    expect(ids.indexOf('door-3')).toBeLessThan(ids.indexOf('s1-drawer-1-front'));
    expect(ids.indexOf('s1-shelf-top')).toBeLessThan(ids.indexOf('s2-shelf-1'));
    expect(ids.indexOf('s2-shelf-4')).toBeLessThan(ids.indexOf('s3-drawer-1-front'));
  });

  it('interior params of sections that do not exist are ignored', () => {
    expect(gen({ interior4: 'rail' })).toEqual(gen());
  });
});
