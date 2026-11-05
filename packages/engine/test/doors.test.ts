import { describe, expect, it } from 'vitest';
import {
  assignRun,
  defaultParams,
  doorKindForLeaf,
  generate,
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
/** Door tests ignore the interior (D-1b): no shelves or drawers in the panel lists. */
const gen = (overrides: Partial<Params> = {}) =>
  generate(T, { ...defaultParams(T), ...NO_INTERIOR, ...overrides });
const doors = (r: GenerateResult) => r.panels.filter((p) => p.role === 'door');
const byId = (panels: Panel[], id: string): Panel => {
  const p = panels.find((x) => x.id === id);
  if (!p) throw new Error(`panel ${id} not found`);
  return p;
};
const left = (p: Panel) => p.position[0] - p.lengthMm / 2;
const right = (p: Panel) => p.position[0] + p.lengthMm / 2;
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);
const hinges = (r: GenerateResult) => doors(r).map((p) => `${p.id}:${p.hingeSide}`);

/** Hinge rule invariant: across every partition, never "hinged right" | "hinged left". */
function sharedHingePartitions(r: GenerateResult): number[] {
  const leaves = doors(r);
  const out: number[] = [];
  for (let k = 1; k < leaves.length; k++) {
    const a = leaves[k - 1] as Panel;
    const b = leaves[k] as Panel;
    if (a.sectionIndex !== b.sectionIndex && a.hingeSide === 'right' && b.hingeSide === 'left') {
      out.push(b.sectionIndex as number);
    }
  }
  return out;
}

describe('default wardrobe (doors=auto) under the D-1b door rules', () => {
  const r = gen();

  it('1360 mm -> 3 sections with single doors L, R, R (2 sections would need two adjacent doubles)', () => {
    expect(r.issues).toEqual([]);
    expect(r.sections.map((s) => [s.innerWidthMm, s.doorType])).toEqual([
      [432, 'single_left'],
      [432, 'single_right'],
      [432, 'single_right'],
    ]);
    expect(r.panels.map((p) => p.id)).toEqual([
      'side-left',
      'side-right',
      'bottom',
      'top',
      'partition-1',
      'partition-2',
      'back',
      'plinth-front',
      'plinth-back',
      'door-1',
      'door-2',
      'door-3',
    ]);
  });

  it('has exact door leaves (gaps 1.5 edge / 3 between, z flush with depth)', () => {
    expect(
      doors(r).map((p) => [
        p.id,
        p.lengthMm,
        p.widthMm,
        p.thicknessMm,
        ...p.position,
        p.sectionIndex,
        p.hingeSide,
      ]),
    ).toEqual([
      ['door-1', 453, 1797, 16, 228, 1000, 508, 0, 'left'],
      ['door-2', 445, 1797, 16, 680, 1000, 508, 1, 'right'],
      ['door-3', 453, 1797, 16, 1132, 1000, 508, 2, 'right'],
    ]);
  });

  it('carcass depth 495 (ADR-003 unchanged)', () => {
    expect(r.dimensions?.carcassDepthMm).toBe(495);
    expect(byId(r.panels, 'side-left').widthMm).toBe(495);
  });
});

describe('depth definition: carcassDepth = depth - back - (doors ? door + gap : 0)', () => {
  it.each([
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
      const dims = r.dimensions;
      if (!dims) throw new Error('no dimensions');
      expect(
        dims.backThicknessMm + dims.carcassDepthMm + dims.doorGapFrontMm + dims.doorThicknessMm,
      ).toBe(516);
      for (const door of doors(r)) {
        expect(door.position[2] + door.thicknessMm / 2).toBe(516);
        expect(door.position[2] - door.thicknessMm / 2).toBe(dims.backThicknessMm + cd + 2);
      }
    },
  );
});

describe('leaf-width rule (single source: maxSingleLeafWidth 600, measured on the leaf)', () => {
  it('boundary: leaf 600 -> single, 600.5 -> double', () => {
    expect(doorKindForLeaf(600, 600)).toBe('single');
    expect(doorKindForLeaf(600.5, 600)).toBe('double');
  });

  it('1206 mm / 2 sections: inner 579, single leaves exactly 600 -> L, R', () => {
    const r = gen({ width: 1206, sections: 2 });
    expect(r.issues).toEqual([]);
    expect(doors(r).map((p) => [p.id, p.hingeSide, left(p), p.lengthMm, right(p)])).toEqual([
      ['door-1', 'left', 1.5, 600, 601.5],
      ['door-2', 'right', 604.5, 600, 1204.5],
    ]);
  });

  it('1207 mm / 2 sections: inner 580 gives a 601 mm leaf -> double + single (D, R)', () => {
    const r = gen({ width: 1207, sections: 2 });
    expect(r.issues).toEqual([]);
    expect(r.sections.map((s) => [s.innerWidthMm, s.doorType])).toEqual([
      [580, 'double'],
      [579, 'single_right'],
    ]);
    expect(doors(r).map((p) => [p.id, p.hingeSide, p.lengthMm])).toEqual([
      ['door-1-left', 'left', 299],
      ['door-1-right', 'right', 299],
      ['door-2', 'right', 600],
    ]);
  });

  it('DOOR_TOO_WIDE uses the same leaf width (all_single on a 601 mm leaf)', () => {
    const r = gen({ width: 1207, sections: 2, doors: 'all_single' });
    expect(r.issues).toEqual([
      {
        code: 'DOOR_TOO_WIDE',
        severity: 'error',
        paramKey: 'doors',
        messageKey: 'issue.DOOR_TOO_WIDE',
        values: { sectionIndex: 0, sectionNumber: 1, leafWidthMm: 601, maxMm: 600 },
      },
    ]);
    expect(codes(gen({ width: 1206, sections: 2, doors: 'all_single' }))).toEqual([]);
  });

  it('DOOR_TOO_WIDE from staff overrides names the override parameter', () => {
    const issues = validate({
      ...defaultParams(T),
      sections: 2,
      doorSection1: 'single_left',
      doorSection2: 'single_right',
    });
    expect(issues.map((i) => [i.code, i.paramKey, i.values.leafWidthMm])).toEqual([
      ['DOOR_TOO_WIDE', 'doorSection1', 677],
      ['DOOR_TOO_WIDE', 'doorSection2', 677],
    ]);
  });
});

describe('hinge rule (ADR-006): no two leaves on one partition', () => {
  it.each([
    [600, 'auto', ['door-1:left']],
    [1206, 2, ['door-1:left', 'door-2:right']],
    [1360, 'auto', ['door-1:left', 'door-2:right', 'door-3:right']],
    [1880, 4, ['door-1:left', 'door-2:left', 'door-3:right', 'door-4:right']],
  ])('width %i, sections %s -> %j', (width, sections, expected) => {
    const r = gen({ width, sections });
    expect(r.issues).toEqual([]);
    expect(hinges(r)).toEqual(expected);
    expect(sharedHingePartitions(r)).toEqual([]);
  });

  it('assignRun: patterns L* D? R*', () => {
    expect(assignRun(['F'])).toEqual(['L']);
    expect(assignRun(['F', 'F'])).toEqual(['L', 'R']);
    expect(assignRun(['F', 'F', 'F'])).toEqual(['L', 'R', 'R']);
    expect(assignRun(['F', 'F', 'F', 'F'])).toEqual(['L', 'L', 'R', 'R']);
    expect(assignRun(['F', 'D', 'F'])).toEqual(['L', 'D', 'R']);
    expect(assignRun(['D', 'F', 'F'])).toEqual(['D', 'R', 'R']);
    expect(assignRun(['F', 'F', 'L'])).toEqual(['L', 'L', 'L']);
    expect(assignRun(['D', 'D'])).toBeNull();
    expect(assignRun(['R', 'L'])).toBeNull();
  });

  it('a lone doored section in the right half hinges right', () => {
    const r = gen({ width: 1600, sections: 3, doorSection2: 'none' });
    expect(hinges(r)).toEqual(['door-1:left', 'door-3:right']);
    expect(doors(r).map((p) => [p.id, left(p), p.lengthMm])).toEqual([
      ['door-1', 1.5, 533],
      ['door-3', 1065.5, 533],
    ]);
  });

  it('no hinge conflict and no too-wide leaf in any auto configuration (16 mm: 600-2399, 18 mm: 600-2397)', () => {
    for (const [corpusMaterial, maxWidth] of [
      ['ldsp_white_16', 2399],
      ['ldsp_white_18', 2397],
    ] as const) {
      for (let width = 600; width <= maxWidth; width += 1) {
        const r = gen({ width, corpusMaterial });
        expect(codes(r), `${corpusMaterial} ${width}`).toEqual([]);
        expect(sharedHingePartitions(r)).toEqual([]);
      }
    }
  });

  it('the widest wardrobes cannot be built with doors=auto (both end sections need doubles)', () => {
    // 16 mm: only 2400 (4 x 580 -> end leaves 601); at 2398/2399 the right end leaf is 600
    expect(codes(gen({ width: 2400 }))).toEqual(['HINGE_CONFLICT', 'HINGE_CONFLICT']);
    expect(codes(gen({ width: 2399 }))).toEqual([]);
    // 18 mm: 2398-2400 (4 x 577+ -> end leaves 601+)
    for (const width of [2398, 2399, 2400]) {
      const r = gen({ width, corpusMaterial: 'ldsp_white_18' });
      expect(codes(r)).toEqual(['HINGE_CONFLICT', 'HINGE_CONFLICT']);
      expect(codes(gen({ width, doors: 'none' }))).toEqual([]);
    }
  });

  it('an explicit section count whose auto layout needs adjacent doubles -> HINGE_CONFLICT on sections', () => {
    const r = gen({ sections: 2 });
    expect(r.issues.map((i) => [i.code, i.paramKey, i.values.partitionNumber])).toEqual([
      ['HINGE_CONFLICT', 'sections', 1],
    ]);
    expect(r.panels).toEqual([]);
  });

  it('HINGE_CONFLICT on a bad staff override', () => {
    const bad = validate({
      ...defaultParams(T),
      width: 1600,
      sections: 3,
      doorSection1: 'single_right',
      doorSection2: 'single_left',
    });
    expect(bad.map((i) => [i.code, i.severity, i.paramKey, i.values.partitionNumber])).toEqual([
      ['HINGE_CONFLICT', 'error', 'doorSection2', 1],
    ]);
    const doubles = validate({
      ...defaultParams(T),
      width: 1600,
      sections: 3,
      doorSection1: 'double',
      doorSection2: 'double',
    });
    expect(doubles.map((i) => [i.code, i.paramKey])).toEqual([['HINGE_CONFLICT', 'doorSection2']]);
    // a compatible override is fine: the free singles adapt (L, D, R)
    const ok = gen({ width: 1600, sections: 3, doorSection2: 'double' });
    expect(codes(ok)).toEqual([]);
    expect(hinges(ok)).toEqual([
      'door-1:left',
      'door-2-left:left',
      'door-2-right:right',
      'door-3:right',
    ]);
  });
});

describe('leaf rounding (0.5 mm) — leaves + gaps = covered width exactly', () => {
  it('roundLeaves distributes the remainder to the leaves that lost most', () => {
    expect(roundLeaves([300.25, 300.25, 299.5], 900, 0.5)).toEqual([300.5, 300, 299.5]);
    expect(roundLeaves([100.2, 100.4, 100.4], 301, 0.5)).toEqual([100, 100.5, 100.5]);
    const r = roundLeaves([333.3, 333.3, 333.4], 1000, 0.5);
    expect(r.reduce((a, b) => a + b, 0)).toBe(1000);
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
        for (let i = 1; i < leaves.length; i++) {
          expect(left(leaves[i] as Panel) - right(leaves[i - 1] as Panel)).toBeCloseTo(3, 9);
        }
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

  it('DOOR_TOO_HEIGHT warns above 2400 mm, geometry still generated', () => {
    expect(codes(gen({ base: 'none', height: 2403 }))).toEqual([]);
    const r = gen({ base: 'none', height: 2404 });
    expect(r.issues.map((i) => [i.code, i.severity, i.values.doorHeightMm])).toEqual([
      ['DOOR_TOO_HEIGHT', 'warning', 2401],
    ]);
    expect(doors(r).length).toBe(3);
  });

  it('overrides for sections that do not exist are ignored', () => {
    expect(gen({ doorSection4: 'double' })).toEqual(gen());
  });

  it('18 mm corpus: thickness propagates, 3 sections 430/429/429', () => {
    const r = gen({ corpusMaterial: 'ldsp_white_18' });
    expect(r.issues).toEqual([]);
    expect(r.sections.map((s) => s.innerWidthMm)).toEqual([430, 429, 429]);
    for (const p of r.panels.filter((x) => x.role !== 'back')) expect(p.thicknessMm, p.id).toBe(18);
    expect(byId(r.panels, 'top').lengthMm).toBe(1360 - 36);
    expect(byId(r.panels, 'side-left').widthMm).toBe(516 - 3 - 18 - 2);
    expect(byId(r.panels, 'door-1').position[2]).toBe(516 - 9);
    expect([left(byId(r.panels, 'door-1')), right(byId(r.panels, 'door-1'))]).toEqual([1.5, 455.5]);
  });

  it('door material can differ from corpus material', () => {
    const r = gen({ corpusMaterial: 'ldsp_oak_light_16', doorMaterial: 'ldsp_anthracite_16' });
    expect(new Set(doors(r).map((p) => p.material))).toEqual(new Set(['ldsp_anthracite_16']));
    expect(byId(r.panels, 'side-left').material).toBe('ldsp_oak_light_16');
  });

  it('is deterministic', () => {
    for (const input of [
      {},
      { width: 2397 },
      { width: 1600, sections: 3, doorSection2: 'double' },
    ]) {
      expect(JSON.stringify(gen(input))).toBe(JSON.stringify(gen(input)));
    }
  });
});
