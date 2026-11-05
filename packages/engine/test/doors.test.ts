import { describe, expect, it } from 'vitest';
import {
  autoDoorKind,
  defaultParams,
  generate,
  validate,
  wardrobeTemplate as T,
  type GenerateResult,
  type Panel,
  type Params,
} from '../src/index.js';

const gen = (overrides: Partial<Params> = {}) => generate(T, { ...defaultParams(T), ...overrides });
const doors = (r: GenerateResult) => r.panels.filter((p) => p.role === 'door');
const byId = (panels: Panel[], id: string): Panel => {
  const p = panels.find((x) => x.id === id);
  if (!p) throw new Error(`panel ${id} not found`);
  return p;
};
const left = (p: Panel) => p.position[0] - p.lengthMm / 2;
const right = (p: Panel) => p.position[0] + p.lengthMm / 2;
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

describe('default wardrobe (doors=auto)', () => {
  const r = gen();

  it('has 2 sections with double doors and the full panel list', () => {
    expect(r.issues).toEqual([]);
    expect(r.sections.map((s) => [s.innerWidthMm, s.doorType])).toEqual([
      [656, 'double'],
      [656, 'double'],
    ]);
    expect(r.panels.map((p) => p.id)).toEqual([
      'side-left',
      'side-right',
      'bottom',
      'top',
      'partition-1',
      'back',
      'plinth-front',
      'plinth-back',
      'door-1-left',
      'door-1-right',
      'door-2-left',
      'door-2-right',
    ]);
  });

  it('has exact door leaves (overlay, gaps 1.5 edge / 3 between, z flush with depth)', () => {
    expect(
      doors(r).map((p) => [
        p.id,
        p.lengthMm,
        p.widthMm,
        p.thicknessMm,
        p.material,
        ...p.position,
        ...p.rotation,
        p.sectionIndex,
        p.hingeSide,
      ]),
    ).toEqual([
      ['door-1-left', 337, 1797, 16, 'ldsp_white_16', 170, 1000, 508, 90, 0, 0, 0, 'left'],
      ['door-1-right', 337, 1797, 16, 'ldsp_white_16', 510, 1000, 508, 90, 0, 0, 0, 'right'],
      ['door-2-left', 337, 1797, 16, 'ldsp_white_16', 850, 1000, 508, 90, 0, 0, 1, 'left'],
      ['door-2-right', 337, 1797, 16, 'ldsp_white_16', 1190, 1000, 508, 90, 0, 0, 1, 'right'],
    ]);
  });

  it('carcass panels use carcassDepth 495 and the plinth stays under the carcass', () => {
    expect(byId(r.panels, 'side-left').widthMm).toBe(495);
    expect(byId(r.panels, 'side-left').position[2]).toBe(3 + 495 / 2);
    expect(byId(r.panels, 'plinth-front').position[2]).toBe(3 + 495 - 8);
    expect(r.sections[0]?.innerDepthMm).toBe(495);
    expect(r.dimensions).toEqual({
      widthMm: 1360,
      heightMm: 1900,
      depthMm: 516,
      carcassHeightMm: 1800,
      carcassDepthMm: 495,
      backThicknessMm: 3,
      doorThicknessMm: 16,
      doorGapFrontMm: 2,
      plinthHeightMm: 100,
    });
  });
});

describe('depth definition: carcassDepth = depth - back - (doors ? door + gap : 0)', () => {
  it.each([
    // corpus, door material, doors, backPanel, expected carcassDepth
    ['ldsp_white_16', 'same_as_corpus', 'auto', 'hdf_overlay', 516 - 3 - 16 - 2],
    ['ldsp_white_16', 'same_as_corpus', 'none', 'hdf_overlay', 516 - 3],
    ['ldsp_white_18', 'same_as_corpus', 'auto', 'hdf_overlay', 516 - 3 - 18 - 2],
    ['ldsp_white_18', 'same_as_corpus', 'none', 'hdf_overlay', 516 - 3],
    ['ldsp_white_18', 'ldsp_white_16', 'auto', 'hdf_overlay', 516 - 3 - 16 - 2],
    ['ldsp_white_16', 'ldsp_white_18', 'auto', 'hdf_overlay', 516 - 3 - 18 - 2],
    ['ldsp_white_16', 'same_as_corpus', 'auto', 'none', 516 - 16 - 2],
    ['ldsp_white_16', 'same_as_corpus', 'none', 'none', 516],
  ])(
    '%s / door %s / doors %s / back %s -> %i',
    (corpusMaterial, doorMaterial, d, backPanel, cd) => {
      const r = gen({ corpusMaterial, doorMaterial, doors: d, backPanel });
      expect(r.issues).toEqual([]);
      expect(r.dimensions?.carcassDepthMm).toBe(cd);
      for (const p of r.panels.filter((x) =>
        ['side', 'top', 'bottom', 'partition'].includes(x.role),
      )) {
        expect(p.widthMm).toBe(cd);
      }
      r.sections.forEach((s) => expect(s.innerDepthMm).toBe(cd));
      const dims = r.dimensions;
      if (!dims) throw new Error('no dimensions');
      // the parts add up to the overall depth
      expect(
        dims.backThicknessMm + dims.carcassDepthMm + dims.doorGapFrontMm + dims.doorThicknessMm,
      ).toBe(516);
      const side = byId(r.panels, 'side-left');
      const carcassFront = side.position[2] + side.widthMm / 2;
      expect(carcassFront).toBe(dims.backThicknessMm + cd);
      for (const door of doors(r)) {
        expect(door.position[2] - door.thicknessMm / 2).toBe(carcassFront + 2); // door gap front
        expect(door.position[2] + door.thicknessMm / 2).toBe(516); // flush with overall depth
      }
    },
  );

  it('holds across the whole depth range', () => {
    for (let depth = 350; depth <= 650; depth += 1) {
      expect(gen({ depth }).dimensions?.carcassDepthMm).toBe(depth - 21);
      expect(gen({ depth, doors: 'none' }).dimensions?.carcassDepthMm).toBe(depth - 3);
    }
  });
});

describe('doors=auto rule (section inner width vs maxSingleDoorWidth 600)', () => {
  it.each([
    [450, 948, ['single_left', 'single_right']],
    [600, 1248, ['single_left', 'single_right']],
    [601, 1250, ['double', 'double']],
    [900, 1848, ['double', 'double']],
  ])('inner %i (width %i, 2 sections) -> %j', (inner, width, types) => {
    const r = gen({ width, sections: 2 });
    expect(r.sections.map((s) => s.innerWidthMm)).toEqual([inner, inner]);
    expect(r.sections.map((s) => s.doorType)).toEqual(types);
    expect(codes(r)).toEqual([]);
  });

  it('autoDoorKind boundary', () => {
    expect(autoDoorKind(450, 600)).toBe('single');
    expect(autoDoorKind(600, 600)).toBe('single');
    expect(autoDoorKind(601, 600)).toBe('double');
    expect(autoDoorKind(900, 600)).toBe('double');
  });

  it('single hinge sides alternate L, R, L, R from the left', () => {
    const r = gen({ width: 4 * 450 + 5 * 16, sections: 4 });
    expect(r.sections.map((s) => s.doorType)).toEqual([
      'single_left',
      'single_right',
      'single_left',
      'single_right',
    ]);
    expect(doors(r).map((p) => [p.id, p.hingeSide])).toEqual([
      ['door-1', 'left'],
      ['door-2', 'right'],
      ['door-3', 'left'],
      ['door-4', 'right'],
    ]);
  });
});

describe('door leaf widths and heights', () => {
  it('single doors at inner 600: exact leaves', () => {
    const r = gen({ width: 1248, sections: 2 });
    expect(doors(r).map((p) => [p.id, left(p), p.lengthMm, right(p), p.widthMm])).toEqual([
      ['door-1', 1.5, 621, 622.5, 1797],
      ['door-2', 625.5, 621, 1246.5, 1797],
    ]);
  });

  it('door height = carcass height - 2 x 1.5, plinth stays visible', () => {
    for (const [base, ph, height] of [
      ['plinth', 100, 1900],
      ['plinth', 60, 2200],
      ['none', 0, 1900],
    ] as const) {
      const r = gen({ base, plinthHeight: ph === 0 ? 100 : ph, height });
      for (const d of doors(r)) {
        expect(d.widthMm).toBe(height - ph - 3);
        expect(d.position[1] - d.widthMm / 2).toBe(ph + 1.5);
        expect(d.position[1] + d.widthMm / 2).toBe(height - 1.5);
      }
    }
  });

  it('leaves + gaps = carcass front width for every width, section count and preset', () => {
    for (const width of [600, 777, 948, 1248, 1250, 1360, 1371, 1999, 2400]) {
      for (const sections of ['auto', 1, 2, 3, 4] as const) {
        for (const preset of ['auto', 'all_single'] as const) {
          for (const corpusMaterial of ['ldsp_white_16', 'ldsp_white_18']) {
            const r = gen({ width, sections, doors: preset, corpusMaterial });
            if (codes(r).includes('DOOR_TOO_WIDE')) continue;
            const leaves = doors(r);
            const sum = leaves.reduce((a, p) => a + p.lengthMm, 0);
            const gaps = 2 * 1.5 + (leaves.length - 1) * 3;
            expect(sum + gaps, `${width}/${sections}/${preset}/${corpusMaterial}`).toBe(width);
            // ordered left to right, no overlaps, exact 3 mm between neighbours
            expect(left(leaves[0] as Panel)).toBe(1.5);
            expect(right(leaves[leaves.length - 1] as Panel)).toBe(width - 1.5);
            for (let i = 1; i < leaves.length; i++) {
              expect(left(leaves[i] as Panel) - right(leaves[i - 1] as Panel)).toBeCloseTo(3, 9);
            }
          }
        }
      }
    }
  });

  it('a section without a door gets the edge gap on its neighbours (staff override)', () => {
    const r = gen({ width: 1600, sections: 3, doorSection2: 'none' });
    expect(r.sections.map((s) => [s.innerWidthMm, s.doorType])).toEqual([
      [512, 'single_left'],
      [512, 'none'],
      [512, 'single_right'],
    ]);
    expect(doors(r).map((p) => [p.id, left(p), p.lengthMm, p.hingeSide])).toEqual([
      ['door-1', 1.5, 533, 'left'],
      ['door-3', 1065.5, 533, 'right'],
    ]);
  });

  it('overrides for sections that do not exist are ignored', () => {
    expect(gen({ doorSection3: 'none', doorSection4: 'single_left' })).toEqual(gen());
  });
});

describe('door validation', () => {
  it('DOOR_TOO_WIDE: all_single on sections wider than 600 is an error, no geometry', () => {
    const r = gen({ width: 1250, sections: 2, doors: 'all_single' });
    expect(r.issues).toEqual([
      {
        code: 'DOOR_TOO_WIDE',
        severity: 'error',
        paramKey: 'doors',
        messageKey: 'issue.DOOR_TOO_WIDE',
        values: {
          sectionIndex: 0,
          sectionNumber: 1,
          innerWidthMm: 601,
          leafWidthMm: 622,
          maxMm: 600,
        },
      },
      {
        code: 'DOOR_TOO_WIDE',
        severity: 'error',
        paramKey: 'doors',
        messageKey: 'issue.DOOR_TOO_WIDE',
        values: {
          sectionIndex: 1,
          sectionNumber: 2,
          innerWidthMm: 601,
          leafWidthMm: 622,
          maxMm: 600,
        },
      },
    ]);
    expect(r.panels).toEqual([]);
    expect(r.dimensions).toBeNull();
    expect(codes(gen({ doors: 'all_single' }))).toEqual(['DOOR_TOO_WIDE', 'DOOR_TOO_WIDE']);
    expect(codes(gen({ width: 1248, sections: 2, doors: 'all_single' }))).toEqual([]);
  });

  it('DOOR_TOO_WIDE from a staff override names the override parameter', () => {
    const issues = validate({ ...defaultParams(T), doorSection2: 'single_right' });
    expect(issues.map((i) => [i.code, i.paramKey])).toEqual([['DOOR_TOO_WIDE', 'doorSection2']]);
  });

  it('DOOR_TOO_HEIGHT warns above 2400 mm, geometry still generated', () => {
    expect(codes(gen({ base: 'none', height: 2403 }))).toEqual([]); // door 2400
    const r = gen({ base: 'none', height: 2404 }); // door 2401
    expect(r.issues.map((i) => [i.code, i.severity, i.values.doorHeightMm])).toEqual([
      ['DOOR_TOO_HEIGHT', 'warning', 2401],
    ]);
    expect(doors(r).length).toBe(4);
    expect(codes(gen({ base: 'none', height: 2404, doors: 'none' }))).toEqual([]);
  });

  it('unknown materials are errors', () => {
    expect(validate({ corpusMaterial: 'hdf_white_3' }).map((i) => i.code)).toEqual([
      'INVALID_OPTION',
    ]);
    expect(validate({ doorMaterial: 'nope' }).map((i) => i.code)).toEqual(['INVALID_OPTION']);
  });
});

describe('material thickness propagates to every panel', () => {
  it('18 mm corpus + doors: all corpus boards, gaps and doors follow', () => {
    const r = gen({ corpusMaterial: 'ldsp_white_18' });
    const t = 18;
    expect(r.sections.map((s) => s.innerWidthMm)).toEqual([653, 653]);
    for (const p of r.panels.filter((x) => x.role !== 'back')) {
      expect(p.thicknessMm, p.id).toBe(t);
      expect(p.material, p.id).toBe('ldsp_white_18');
    }
    expect(byId(r.panels, 'back').thicknessMm).toBe(3);
    expect(byId(r.panels, 'top').lengthMm).toBe(1360 - 2 * t);
    expect(byId(r.panels, 'partition-1').lengthMm).toBe(1800 - 2 * t);
    expect(byId(r.panels, 'side-left').widthMm).toBe(516 - 3 - t - 2);
    expect(byId(r.panels, 'side-right').position[0]).toBe(1360 - t / 2);
    expect(byId(r.panels, 'plinth-front').position[2]).toBe(3 + 493 - t / 2);
    expect(byId(r.panels, 'door-1-left').position[2]).toBe(516 - t / 2);
    // coverage boundary moves with the partition centre: 18 + 653 + 9 = 680
    expect(right(byId(r.panels, 'door-1-right'))).toBe(680 - 1.5);
  });

  it('door material can differ from corpus material', () => {
    const r = gen({ corpusMaterial: 'ldsp_oak_light_16', doorMaterial: 'ldsp_anthracite_16' });
    expect(new Set(doors(r).map((p) => p.material))).toEqual(new Set(['ldsp_anthracite_16']));
    expect(byId(r.panels, 'side-left').material).toBe('ldsp_oak_light_16');
  });
});

describe('determinism with doors', () => {
  it('same input -> deep-equal output', () => {
    for (const input of [
      {},
      { width: 2400, sections: 4, doors: 'all_single' },
      { width: 1600, sections: 3, doorSection2: 'double', corpusMaterial: 'ldsp_white_18' },
    ]) {
      expect(gen(input)).toEqual(gen(input));
      expect(JSON.stringify(gen(input))).toBe(JSON.stringify(gen(input)));
    }
  });
});
