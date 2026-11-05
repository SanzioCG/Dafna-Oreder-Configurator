import { describe, expect, it } from 'vitest';
import {
  defaultParams,
  generate,
  validate,
  wardrobeTemplate as T,
  type Panel,
  type Params,
  type Section,
} from '../src/index.js';

/** Carcass tests run without doors and without interior (D-0 geometry); see doors/interior tests. */
const NO_INTERIOR = {
  interior1: 'empty',
  interior2: 'empty',
  interior3: 'empty',
  interior4: 'empty',
};
const gen = (overrides: Partial<Params> = {}) =>
  generate(T, { ...defaultParams(T), doors: 'none', ...NO_INTERIOR, ...overrides });
const mat = (t: number) => (t === 18 ? 'ldsp_white_18' : 'ldsp_white_16');
const byId = (panels: Panel[], id: string): Panel => {
  const p = panels.find((x) => x.id === id);
  if (!p) throw new Error(`panel ${id} not found`);
  return p;
};
const errors = (issues: { severity: string }[]) => issues.filter((i) => i.severity === 'error');

/** Axis-aligned X extent of a panel (all v0 rotations are 0 / 90 degrees). */
function xExtent(p: Panel): [number, number] {
  const sizeX = p.rotation[2] === 90 ? p.thicknessMm : p.lengthMm; // vertical YZ panels: thickness along X
  return [p.position[0] - sizeX / 2, p.position[0] + sizeX / 2];
}

describe('carcass with default params and doors=none (D-0 geometry)', () => {
  const result = gen();

  it('has no issues', () => {
    expect(result.issues).toEqual([]);
  });

  it('produces the expected panels in a stable order', () => {
    expect(result.panels.map((p) => [p.id, p.role])).toEqual([
      ['side-left', 'side'],
      ['side-right', 'side'],
      ['bottom', 'bottom'],
      ['top', 'top'],
      ['partition-1', 'partition'],
      ['back', 'back'],
      ['plinth-front', 'plinth'],
      ['plinth-back', 'plinth'],
    ]);
  });

  it('has exact dimensions (1360 x 1900 x 516, t=16, plinth 100, HDF 3)', () => {
    const dims = Object.fromEntries(
      result.panels.map((p) => [
        p.id,
        [p.lengthMm, p.widthMm, p.thicknessMm, p.material, ...p.position, ...p.rotation],
      ]),
    );
    expect(dims).toEqual({
      'side-left': [1800, 513, 16, 'ldsp_white_16', 8, 1000, 259.5, 0, 0, 90],
      'side-right': [1800, 513, 16, 'ldsp_white_16', 1352, 1000, 259.5, 0, 0, 90],
      bottom: [1328, 513, 16, 'ldsp_white_16', 680, 108, 259.5, 0, 0, 0],
      top: [1328, 513, 16, 'ldsp_white_16', 680, 1892, 259.5, 0, 0, 0],
      'partition-1': [1768, 513, 16, 'ldsp_white_16', 680, 1000, 259.5, 0, 0, 90],
      back: [1360, 1800, 3, 'hdf_white_3', 680, 1000, 1.5, 90, 0, 0],
      'plinth-front': [1360, 100, 16, 'ldsp_white_16', 680, 50, 508, 90, 0, 0],
      'plinth-back': [1360, 100, 16, 'ldsp_white_16', 680, 50, 11, 90, 0, 0],
    });
  });

  it('has two equal sections', () => {
    const d0 = ({
      index,
      innerWidthMm,
      innerHeightMm,
      innerDepthMm,
      xStartMm,
      doorType,
    }: Section) => ({
      index,
      innerWidthMm,
      innerHeightMm,
      innerDepthMm,
      xStartMm,
      doorType,
    });
    expect(result.sections.map(d0)).toEqual([
      {
        index: 0,
        innerWidthMm: 656,
        innerHeightMm: 1768,
        innerDepthMm: 513,
        xStartMm: 16,
        doorType: 'none',
      },
      {
        index: 1,
        innerWidthMm: 656,
        innerHeightMm: 1768,
        innerDepthMm: 513,
        xStartMm: 688,
        doorType: 'none',
      },
    ]);
  });
});

describe('side height', () => {
  it.each([60, 100, 150])('= height - plinthHeight when base=plinth (plinth %i)', (ph) => {
    for (const height of [1200, 1900, 2600]) {
      const r = gen({ base: 'plinth', plinthHeight: ph, height });
      expect(byId(r.panels, 'side-left').lengthMm).toBe(height - ph);
      expect(byId(r.panels, 'side-right').lengthMm).toBe(height - ph);
      expect(byId(r.panels, 'side-left').position[1]).toBe(ph + (height - ph) / 2);
    }
  });

  it('= height when base=none, and there are no plinth panels', () => {
    for (const height of [1200, 1900, 2600]) {
      const r = gen({ base: 'none', height, plinthHeight: 150 });
      expect(byId(r.panels, 'side-left').lengthMm).toBe(height);
      expect(byId(r.panels, 'bottom').position[1]).toBe(8);
      expect(r.panels.filter((p) => p.role === 'plinth')).toEqual([]);
    }
  });

  it('plinthRecess moves only the front strip back', () => {
    const r = gen({ plinthRecess: 40 });
    expect(byId(r.panels, 'plinth-front').position[2]).toBe(516 - 40 - 8);
    expect(byId(r.panels, 'plinth-back').position[2]).toBe(11);
  });
});

describe('width budget: sides + partitions + section inner widths = width', () => {
  const widths = [600, 601, 933, 1360, 1371, 1999, 2400];
  const sectionOptions = ['auto', 1, 2, 3, 4] as const;
  for (const t of [16, 18]) {
    it(`holds exactly for corpus thickness ${t}`, () => {
      for (const width of widths) {
        for (const sections of sectionOptions) {
          const r = gen({ width, sections, corpusMaterial: mat(t) });
          expect(errors(r.issues)).toEqual([]);
          const sides = r.panels.filter((p) => p.role === 'side');
          const partitions = r.panels.filter((p) => p.role === 'partition');
          const sum =
            sides.reduce((a, p) => a + p.thicknessMm, 0) +
            partitions.reduce((a, p) => a + p.thicknessMm, 0) +
            r.sections.reduce((a, s) => a + s.innerWidthMm, 0);
          expect(sum).toBe(width);
          expect(partitions.length).toBe(r.sections.length - 1);
          // equal sections: differ by at most 1 mm, integer mm
          const ws = r.sections.map((s) => s.innerWidthMm);
          expect(Math.max(...ws) - Math.min(...ws)).toBeLessThanOrEqual(1);
          ws.forEach((w) => expect(Number.isInteger(w)).toBe(true));
          // panels do not overlap in X and tile the width without gaps
          const carcassX = [...sides, ...partitions].map(xExtent).sort((a, b) => a[0] - b[0]);
          expect(carcassX[0]?.[0]).toBe(0);
          expect(carcassX[carcassX.length - 1]?.[1]).toBe(width);
          r.sections.forEach((s, i) => {
            expect(s.xStartMm).toBe(carcassX[i]?.[1]);
            expect(s.xStartMm + s.innerWidthMm).toBe(carcassX[i + 1]?.[0]);
          });
        }
      }
    });
  }
});

describe('corpus material 16 vs 18 mm at the same width', () => {
  it('changes inner widths, keeps overall width', () => {
    const r16 = gen({ width: 1360, corpusMaterial: mat(16) });
    const r18 = gen({ width: 1360, corpusMaterial: mat(18) });
    expect(r16.sections.map((s) => s.innerWidthMm)).toEqual([656, 656]);
    expect(r18.sections.map((s) => s.innerWidthMm)).toEqual([653, 653]);
    for (const r of [r16, r18]) {
      const xs = r.panels.flatMap(xExtent);
      expect(Math.min(...xs)).toBe(0);
      expect(Math.max(...xs)).toBe(1360);
    }
    expect(byId(r18.panels, 'top').lengthMm).toBe(1360 - 36);
    expect(byId(r18.panels, 'partition-1').lengthMm).toBe(1800 - 36);
    expect(
      r18.panels.filter((p) => p.material === 'ldsp_white_18').every((p) => p.thicknessMm === 18),
    ).toBe(true);
    expect(r18.sections[0]?.innerHeightMm).toBe(1800 - 36);
  });
});

describe('sections=auto', () => {
  it.each([
    [600, 16, 1, [568]],
    [1360, 16, 2, [656, 656]],
    [2400, 16, 3, [779, 779, 778]],
    [600, 18, 1, [564]],
    [1360, 18, 2, [653, 653]],
    [2400, 18, 3, [776, 776, 776]],
  ])('width %i, t=%i -> %i sections', (width, t, n, inner) => {
    const r = gen({ width, corpusMaterial: mat(t), sections: 'auto' });
    expect(r.sections.length).toBe(n);
    expect(r.sections.map((s) => s.innerWidthMm)).toEqual(inner);
  });

  it('never produces a SHELF_SPAN warning across the whole width range', () => {
    for (const t of [16, 18]) {
      for (let width = 600; width <= 2400; width += 1) {
        const issues = validate({
          ...defaultParams(T),
          doors: 'none',
          width,
          corpusMaterial: mat(t),
        });
        expect(issues).toEqual([]);
      }
    }
  });

  it('switches 1 -> 2 exactly where inner width passes 900 mm', () => {
    expect(gen({ width: 932 }).sections.map((s) => s.innerWidthMm)).toEqual([900]);
    expect(gen({ width: 933 }).sections.length).toBe(2);
  });
});

describe('SHELF_SPAN warning', () => {
  it('triggers once per section wider than 900 mm', () => {
    const issues = validate({ ...defaultParams(T), doors: 'none', width: 2400, sections: 2 });
    expect(issues).toEqual([
      {
        code: 'SHELF_SPAN',
        severity: 'warning',
        paramKey: 'sections',
        messageKey: 'issue.SHELF_SPAN',
        values: { sectionIndex: 0, sectionNumber: 1, innerWidthMm: 1176, maxMm: 900 },
      },
      {
        code: 'SHELF_SPAN',
        severity: 'warning',
        paramKey: 'sections',
        messageKey: 'issue.SHELF_SPAN',
        values: { sectionIndex: 1, sectionNumber: 2, innerWidthMm: 1176, maxMm: 900 },
      },
    ]);
  });

  it('does not trigger at exactly 900 mm, triggers at 901 mm', () => {
    expect(validate({ ...defaultParams(T), doors: 'none', width: 932, sections: 1 })).toEqual([]);
    const w = validate({ ...defaultParams(T), doors: 'none', width: 933, sections: 1 });
    expect(w.map((i) => [i.code, i.values.innerWidthMm])).toEqual([['SHELF_SPAN', 901]]);
  });

  it('only warns for the sections that exceed (uneven remainder)', () => {
    // 1837 - 3*16 = 1789 -> [895, 894] ok; 1853 - 48 = 1805 -> [903, 902] both warn
    expect(validate({ ...defaultParams(T), doors: 'none', width: 1837, sections: 2 })).toEqual([]);
    expect(validate({ ...defaultParams(T), doors: 'none', width: 1853, sections: 2 }).length).toBe(
      2,
    );
  });

  it('is a warning, so geometry is still generated', () => {
    const r = gen({ width: 1360, sections: 1 });
    expect(r.issues.map((i) => i.code)).toEqual(['SHELF_SPAN']);
    expect(r.panels.length).toBe(7);
  });
});

describe('boundaries and invalid input', () => {
  const intDefs = T.parameters.filter((d) => d.type === 'int');

  it('min and max of every numeric parameter give no error', () => {
    for (const def of intDefs) {
      for (const value of [def.min, def.max]) {
        const r = gen({ [def.key]: value });
        expect(errors(r.issues), `${def.key}=${value}`).toEqual([]);
        expect(r.panels.length).toBeGreaterThan(0);
      }
    }
  });

  it('out-of-range values give an OUT_OF_RANGE error and no geometry, without throwing', () => {
    for (const def of intDefs) {
      for (const value of [(def.min ?? 0) - 1, (def.max ?? 0) + 1]) {
        let r: ReturnType<typeof gen> | undefined;
        expect(() => (r = gen({ [def.key]: value }))).not.toThrow();
        expect(r?.issues).toEqual([
          {
            code: 'OUT_OF_RANGE',
            severity: 'error',
            paramKey: def.key,
            messageKey: 'issue.OUT_OF_RANGE',
            values: { value, min: def.min, max: def.max },
          },
        ]);
        expect(r?.panels).toEqual([]);
        expect(r?.sections).toEqual([]);
      }
    }
  });

  it('invalid enum options give INVALID_OPTION errors', () => {
    const issues = validate({
      ...defaultParams(T),
      sections: 5,
      corpusMaterial: 'ldsp_pink_17',
      base: 'legs',
    });
    expect(issues.map((i) => [i.code, i.paramKey])).toEqual([
      ['INVALID_OPTION', 'sections'],
      ['INVALID_OPTION', 'corpusMaterial'],
      ['INVALID_OPTION', 'base'],
    ]);
  });

  it('wrong types and garbage input never throw', () => {
    const garbage: unknown[] = [
      null,
      undefined,
      42,
      'x',
      [],
      { width: '1360' },
      { width: 1360.5 },
      { width: Number.NaN },
      { width: Number.POSITIVE_INFINITY },
      { sections: '2' },
      { width: null },
    ];
    for (const g of garbage) {
      expect(() => generate(T, g)).not.toThrow();
      expect(() => validate(g)).not.toThrow();
    }
    expect(validate({ width: '1360' }).map((i) => i.code)).toEqual(['INVALID_TYPE']);
    expect(validate({ width: 1360.5 }).map((i) => i.code)).toEqual(['INVALID_TYPE']);
    expect(validate({ sections: '2' }).map((i) => i.code)).toEqual(['INVALID_OPTION']);
  });

  it('missing params fall back to defaults; unknown params are a warning', () => {
    expect(generate(T, {})).toEqual(generate(T, defaultParams(T)));
    expect(validate({ color: 'red' })).toEqual([
      {
        code: 'UNKNOWN_PARAM',
        severity: 'warning',
        paramKey: 'color',
        messageKey: 'issue.UNKNOWN_PARAM',
        values: { key: 'color' },
      },
    ]);
  });

  it('an unsupported template is an error issue, not an exception', () => {
    const bad = { ...T, generator: 'something-else' };
    const r = generate(bad, defaultParams(T));
    expect(r.issues.map((i) => i.code)).toEqual(['UNSUPPORTED_TEMPLATE']);
    expect(r.panels).toEqual([]);
  });
});

describe('determinism', () => {
  it('same input -> deep-equal output', () => {
    const inputs: Partial<Params>[] = [
      {},
      { width: 2400, sections: 4, corpusMaterial: 'ldsp_white_18' },
      { base: 'none', backPanel: 'none', width: 777, height: 2111, depth: 401 },
      { width: 1360, sections: 1 },
    ];
    for (const input of inputs) {
      const a = gen(input);
      const b = gen(input);
      expect(a).toEqual(b);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('does not mutate its input', () => {
    const input = { ...defaultParams(T), width: 2000 };
    const copy = JSON.parse(JSON.stringify(input)) as typeof input;
    gen(input);
    expect(input).toEqual(copy);
  });

  it('back panel and plinth panels can be switched off', () => {
    const r = gen({ backPanel: 'none', base: 'none' });
    expect(r.panels.map((p) => p.id)).toEqual([
      'side-left',
      'side-right',
      'bottom',
      'top',
      'partition-1',
    ]);
    // without the back, the carcass takes the full depth
    expect(byId(r.panels, 'side-left').widthMm).toBe(516);
    expect(r.sections[0]?.innerDepthMm).toBe(516);
  });
});
