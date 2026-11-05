import { describe, expect, it } from 'vitest';
import {
  defaultParams,
  doorKindForLeaf,
  generate,
  hingeMountFor,
  hingeSideFor,
  roundLeaves,
  validate,
  wardrobeTemplate as T,
  type GenerateResult,
  type Panel,
  type Params,
} from '../src/index.js';

const NO_INTERIOR = {
  interior1: 'empty',
  interior2: 'empty',
  interior3: 'empty',
  interior4: 'empty',
};
/** Door tests ignore the interior and use the D-1b reference depth 516 (exact mm below). */
const gen = (overrides: Partial<Params> = {}) =>
  generate(T, { ...defaultParams(T), depth: 516, ...NO_INTERIOR, ...overrides });
const doors = (r: GenerateResult) => r.panels.filter((p) => p.role === 'door');
const byId = (panels: Panel[], id: string): Panel => {
  const p = panels.find((x) => x.id === id);
  if (!p) throw new Error(`panel ${id} not found`);
  return p;
};
const left = (p: Panel) => p.position[0] - p.lengthMm / 2;
const right = (p: Panel) => p.position[0] + p.lengthMm / 2;
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);
const hinges = (r: GenerateResult) => doors(r).map((p) => `${p.id}:${p.hingeSide}:${p.hingeMount}`);

describe('default 1360 wardrobe (doors=auto): 2 sections, 4 leaves (D-1c)', () => {
  const r = gen();

  it('2 sections of 656 with double doors, valid', () => {
    expect(r.issues).toEqual([]);
    expect(r.sections.map((s) => [s.innerWidthMm, s.doorType])).toEqual([
      [656, 'double'],
      [656, 'double'],
    ]);
    expect(doors(r).length).toBe(4);
  });

  it('exact leaves; adjacent doubles share partition 1 (both half overlay)', () => {
    expect(
      doors(r).map((p) => [p.id, p.lengthMm, p.widthMm, ...p.position, p.hingeSide, p.hingeMount]),
    ).toEqual([
      ['door-1-left', 337, 1797, 170, 1000, 508, 'left', 'full_overlay'],
      ['door-1-right', 337, 1797, 510, 1000, 508, 'right', 'half_overlay'],
      ['door-2-left', 337, 1797, 850, 1000, 508, 'left', 'half_overlay'],
      ['door-2-right', 337, 1797, 1190, 1000, 508, 'right', 'full_overlay'],
    ]);
  });
});

describe('depth definition: carcassDepth = depth - back - (doors ? door + gap : 0)', () => {
  it.each([
    ['ldsp_white_16', 'same_as_corpus', 'auto', 'hdf_overlay', 516 - 3 - 16 - 2],
    ['ldsp_white_16', 'same_as_corpus', 'none', 'hdf_overlay', 516 - 3],
    ['ldsp_white_18', 'same_as_corpus', 'auto', 'hdf_overlay', 516 - 3 - 18 - 2],
    ['ldsp_white_18', 'ldsp_white_16', 'auto', 'hdf_overlay', 516 - 3 - 16 - 2],
    ['ldsp_white_16', 'same_as_corpus', 'auto', 'none', 516 - 16 - 2],
  ])(
    '%s / door %s / doors %s / back %s -> %i',
    (corpusMaterial, doorMaterial, d, backPanel, cd) => {
      const r = gen({ corpusMaterial, doorMaterial, doors: d, backPanel });
      expect(r.issues).toEqual([]);
      expect(r.dimensions?.carcassDepthMm).toBe(cd);
      for (const door of doors(r)) {
        expect(door.position[2] + door.thicknessMm / 2).toBe(516);
      }
    },
  );
});

describe('leaf-width rule (maxSingleLeafWidth 600, measured on the leaf)', () => {
  it('boundary: leaf 600 -> single, 600.5 -> double', () => {
    expect(doorKindForLeaf(600, 600)).toBe('single');
    expect(doorKindForLeaf(600.5, 600)).toBe('double');
  });

  it('1206 / 2 sections: leaves exactly 600 -> L, R; 1207: section 1 leaf 601 -> double', () => {
    const a = gen({ width: 1206, sections: 2 });
    expect(doors(a).map((p) => [p.id, p.hingeSide, left(p), p.lengthMm])).toEqual([
      ['door-1', 'left', 1.5, 600],
      ['door-2', 'right', 604.5, 600],
    ]);
    const b = gen({ width: 1207, sections: 2 });
    expect(b.sections.map((s) => s.doorType)).toEqual(['double', 'single_right']);
  });

  it('DOOR_TOO_WIDE uses the same leaf width', () => {
    const r = gen({ width: 1207, sections: 2, doors: 'all_single' });
    expect(r.issues.map((i) => [i.code, i.paramKey, i.values.leafWidthMm])).toEqual([
      ['DOOR_TOO_WIDE', 'doors', 601],
    ]);
  });
});

describe('hinge sides: outer side of each half (shared partitions allowed)', () => {
  it.each([
    [0, 1, 'left'],
    [0, 2, 'left'],
    [1, 2, 'right'],
    [0, 3, 'left'],
    [1, 3, 'left'],
    [2, 3, 'right'],
    [0, 4, 'left'],
    [1, 4, 'left'],
    [2, 4, 'right'],
    [3, 4, 'right'],
  ] as const)('hingeSideFor(%i, %i) = %s', (i, n, side) => {
    expect(hingeSideFor(i, n)).toBe(side);
  });

  it.each([
    [600, 'auto', ['door-1:left:full_overlay']],
    [1206, 2, ['door-1:left:full_overlay', 'door-2:right:full_overlay']],
    [
      1600,
      3,
      ['door-1:left:full_overlay', 'door-2:left:half_overlay', 'door-3:right:full_overlay'],
    ],
    [
      1880,
      4,
      [
        'door-1:left:full_overlay',
        'door-2:left:half_overlay',
        'door-3:right:half_overlay',
        'door-4:right:full_overlay',
      ],
    ],
  ])('width %i, sections %s -> %j', (width, sections, expected) => {
    const r = gen({ width, sections });
    expect(r.issues).toEqual([]);
    expect(hinges(r)).toEqual(expected);
  });

  it('hingeMountFor: outer side panel = full, partition = half', () => {
    expect(hingeMountFor(0, 'left', 3)).toBe('full_overlay');
    expect(hingeMountFor(0, 'right', 3)).toBe('half_overlay');
    expect(hingeMountFor(2, 'right', 3)).toBe('full_overlay');
    expect(hingeMountFor(1, 'left', 3)).toBe('half_overlay');
  });

  it('two singles hinged on the same partition are valid (staff overrides)', () => {
    const r = gen({
      width: 1600,
      sections: 3,
      doorSection1: 'single_right',
      doorSection2: 'single_left',
    });
    expect(r.issues).toEqual([]);
    expect(hinges(r).slice(0, 2)).toEqual([
      'door-1:right:half_overlay',
      'door-2:left:half_overlay',
    ]);
  });

  it('adjacent double doors are valid; explicit 2 sections at 1360 too', () => {
    expect(
      codes(gen({ width: 1600, sections: 3, doorSection1: 'double', doorSection2: 'double' })),
    ).toEqual([]);
    expect(gen({ sections: 2 }).panels.length).toBeGreaterThan(0);
  });

  it('a lone doored section in the right half hinges right', () => {
    const r = gen({ width: 1600, sections: 3, doorSection2: 'none' });
    expect(hinges(r)).toEqual(['door-1:left:full_overlay', 'door-3:right:full_overlay']);
    expect(doors(r).map((p) => [left(p), p.lengthMm])).toEqual([
      [1.5, 533],
      [1065.5, 533],
    ]);
  });

  it('every auto configuration is valid (600-2400 mm, 16 and 18 mm)', () => {
    for (const corpusMaterial of ['ldsp_white_16', 'ldsp_white_18']) {
      for (let width = 600; width <= 2400; width += 1) {
        expect(codes(gen({ width, corpusMaterial })), `${corpusMaterial} ${width}`).toEqual([]);
      }
    }
  });

  it('2400 with doors: 3 sections of double doors, valid', () => {
    const r = gen({ width: 2400 });
    expect(r.issues).toEqual([]);
    expect(r.sections.map((s) => [s.innerWidthMm, s.doorType])).toEqual([
      [779, 'double'],
      [779, 'double'],
      [778, 'double'],
    ]);
    expect(doors(r).length).toBe(6);
  });

  it('HINGE_CONFLICT no longer exists', () => {
    const issues = validate({
      ...defaultParams(T),
      width: 1600,
      sections: 3,
      doorSection1: 'double',
      doorSection2: 'double',
      doorSection3: 'single_left',
    });
    expect(issues.map((i) => i.code)).not.toContain('HINGE_CONFLICT');
  });
});

describe('leaf rounding (0.5 mm) — leaves + gaps = covered width exactly', () => {
  it('roundLeaves distributes the remainder to the leaves that lost most', () => {
    expect(roundLeaves([300.25, 300.25, 299.5], 900, 0.5)).toEqual([300.5, 300, 299.5]);
    expect(roundLeaves([100.2, 100.4, 100.4], 301, 0.5)).toEqual([100, 100.5, 100.5]);
  });

  it.each([
    [2, 'ldsp_white_16'],
    [3, 'ldsp_white_16'],
    [4, 'ldsp_white_16'],
    [2, 'ldsp_white_18'],
    [3, 'ldsp_white_18'],
    [4, 'ldsp_white_18'],
  ])('%i sections, %s: every valid width sums exactly', (sections, corpusMaterial) => {
    let checked = 0;
    for (let width = 600; width <= 2400; width += 7) {
      for (const preset of ['auto', 'all_single']) {
        const r = gen({ width, sections, corpusMaterial, doors: preset });
        if (r.issues.some((i) => i.severity === 'error')) continue;
        checked++;
        const leaves = doors(r);
        for (const l of leaves) expect(Number.isInteger(l.lengthMm * 2)).toBe(true);
        const sum = leaves.reduce((a, p) => a + p.lengthMm, 0);
        expect(sum + 2 * 1.5 + (leaves.length - 1) * 3, `${width}/${preset}`).toBe(width);
        expect(left(leaves[0] as Panel)).toBe(1.5);
        expect(right(leaves[leaves.length - 1] as Panel)).toBe(width - 1.5);
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe('door height and other checks', () => {
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
      }
    }
  });

  it('DOOR_TOO_HEIGHT warns above 2400 mm', () => {
    expect(codes(gen({ base: 'none', height: 2403 }))).toEqual([]);
    expect(codes(gen({ base: 'none', height: 2404 }))).toEqual(['DOOR_TOO_HEIGHT']);
  });

  it('18 mm corpus: 2 sections of 653, double doors, thickness propagates', () => {
    const r = gen({ corpusMaterial: 'ldsp_white_18' });
    expect(r.issues).toEqual([]);
    expect(r.sections.map((s) => [s.innerWidthMm, s.doorType])).toEqual([
      [653, 'double'],
      [653, 'double'],
    ]);
    for (const p of r.panels.filter((x) => x.role !== 'back')) expect(p.thicknessMm, p.id).toBe(18);
    expect(byId(r.panels, 'side-left').widthMm).toBe(516 - 3 - 18 - 2);
    expect(right(byId(r.panels, 'door-1-right'))).toBe(680 - 1.5);
  });

  it('overrides for sections that do not exist are ignored; deterministic', () => {
    expect(gen({ doorSection4: 'double' })).toEqual(gen());
    for (const input of [
      {},
      { width: 2400 },
      { width: 1600, sections: 3, doorSection2: 'double' },
    ]) {
      expect(JSON.stringify(gen(input))).toBe(JSON.stringify(gen(input)));
    }
  });
});
