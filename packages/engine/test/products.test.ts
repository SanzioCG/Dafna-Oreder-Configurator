import { describe, expect, it } from 'vitest';
import {
  PRODUCT_ARCHIVE,
  catalogForTemplate,
  defaultParams,
  deskTemplate as DESK,
  generate,
  getMaterial,
  pedestalTemplate as PED,
  regenerateApplication,
  toOrderDraft,
  validate,
  type Panel,
} from '../src/index.js';
import pedDefault from './fixtures/applications/pedestal.0.1.0.default.json' with { type: 'json' };
import pedFile from './fixtures/applications/pedestal.0.1.0.w450-file-plinth.json' with { type: 'json' };
import deskLdsp from './fixtures/applications/desk.0.1.0.default-ldsp.json' with { type: 'json' };
import deskLift from './fixtures/applications/desk.0.1.0.w1600-lift.json' with { type: 'json' };
// D-17: Dafna's own sizes (templates 0.2.0)
import ped2Default from './fixtures/applications/pedestal.0.2.0.default.json' with { type: 'json' };
import desk2 from './fixtures/applications/desk.0.2.0.w1700-d700.json' with { type: 'json' };
// D-22: the technologist's confirmation table (templates 0.3.0)
import ped3Default from './fixtures/applications/pedestal.0.3.0.default.json' with { type: 'json' };
import ped4Default from './fixtures/applications/pedestal.0.4.0.default.json' with { type: 'json' };
import desk3 from './fixtures/applications/desk.0.3.0.w1500-framed-top.json' with { type: 'json' };
// D-26: Dafna's Bazis models (pedestal 0.5.0, desk 0.4.0)
import ped5Default from './fixtures/applications/pedestal.0.5.0.default.json' with { type: 'json' };
// D-28: Samet slides
import ped6Default from './fixtures/applications/pedestal.0.6.0.default.json' with { type: 'json' };
import desk4 from './fixtures/applications/desk.0.4.0.w1500-bazis.json' with { type: 'json' };

/** pedestal 0.2.0: the last template with the A4 hanging-file drawer */
const PED_V2 = PRODUCT_ARCHIVE.pedestal!['0.2.0']!;

/** world-space bounding box of a panel (product mm) */
function bbox(p: Panel) {
  const [rx, ry, rz] = p.rotation;
  // local L (X), T (Y), W (Z) -> product axes for the rotations the generators use
  let size: [number, number, number] = [p.lengthMm, p.thicknessMm, p.widthMm];
  if (rz === 90) size = [p.thicknessMm, p.lengthMm, p.widthMm];
  else if (rx === 90) size = [p.lengthMm, p.widthMm, p.thicknessMm];
  else if (ry === 90) size = [p.widthMm, p.thicknessMm, p.lengthMm]; // D-22 work-top frame ends
  return {
    min: p.position.map((c, i) => c - size[i]! / 2),
    max: p.position.map((c, i) => c + size[i]! / 2),
  };
}

describe('D-8 office pedestal (ofis tumbasi)', () => {
  it('template 0.6.0, catalog 1.1.0, Dafna sizes 430 × 550 × 550 (D-17); no A4 file drawer (D-22)', () => {
    expect(PED.parameters.find((p) => p.key === 'layout')?.options).toEqual([
      'drawers3',
      'door_shelf',
    ]);
    expect([PED.templateId, PED.templateVersion, PED.productType]).toEqual([
      'pedestal',
      '0.6.0',
      'pedestal',
    ]);
    expect(catalogForTemplate(PED).catalogVersion).toBe('1.1.0');
    expect(PED.parameters.find((p) => p.key === 'height')?.customerValues).toEqual([550]);
    expect(PED.parameters.find((p) => p.key === 'width')?.customerValues).toEqual([430]);
    expect(PED.parameters.find((p) => p.key === 'depth')?.customerValues).toEqual([550]);
  });

  // drawers2_file: pedestal 0.2.0 (A4 file drawer, removed in 0.3.0)
  for (const [T, layout] of [
    [PED, 'drawers3'],
    [PED_V2, 'drawers2_file'],
    [PED, 'door_shelf'],
  ] as const) {
    for (const base of ['castors', 'plinth']) {
      for (const width of [400, 430, 450]) {
        it(`${T.templateVersion} ${layout} / ${base} / ${width}: valid, inside its overall box, fits under a 750 desk`, () => {
          const p = { ...defaultParams(T), layout, base, width };
          const [H, D] = [Number(defaultParams(T).height), Number(defaultParams(T).depth)];
          const r = generate(T, p);
          // 16 mm LDSP drawer sides: an A4 hanging-file box needs the 450 pedestal
          expect(r.issues.map((i) => i.code)).toEqual(
            layout === 'drawers2_file' && width === 400 ? ['FILE_DRAWER_TOO_SMALL'] : [],
          );
          const W = width;
          for (const panel of r.panels) {
            const b = bbox(panel);
            expect(b.min[0], panel.id).toBeGreaterThanOrEqual(-0.01);
            expect(b.max[0], panel.id).toBeLessThanOrEqual(W + 0.01);
            expect(b.min[1], panel.id).toBeGreaterThanOrEqual(-0.01);
            expect(b.max[1], panel.id).toBeLessThanOrEqual(H + 0.01);
            expect(b.max[2], panel.id).toBeLessThanOrEqual(D + 0.01);
          }
          // under a 750 desk with a 25 mm top there are 725 mm: the pedestal is 550
          expect(r.dimensions?.heightMm).toBeLessThanOrEqual(700);
          const drawers = r.sections[0]!.drawers;
          if (layout === 'door_shelf') {
            expect(r.panels.filter((x) => x.role === 'door')).toHaveLength(1);
            expect(drawers).toEqual([]);
          } else {
            expect(drawers).toHaveLength(3);
            for (const d of drawers) expect(d.frontYMm + d.frontHeightMm).toBeLessThanOrEqual(1250);
          }
          expect(r.panels.some((x) => x.role === 'frame')).toBe(base === 'castors');
          expect(r.panels.some((x) => x.role === 'plinth')).toBe(base === 'plinth');
        });
      }
    }
  }

  it('0.2.0 A4 hanging-file drawer (450 wide): box >= 330 wide and >= 240 high inside', () => {
    const r = generate(PED_V2, { ...defaultParams(PED_V2), layout: 'drawers2_file', width: 450 });
    const file = r.sections[0]!.drawers[0]!;
    expect(file.boxWidthMm - 2 * 16).toBeGreaterThanOrEqual(330);
    expect(file.boxHeightMm).toBeGreaterThanOrEqual(240);
    // a 300 mm pedestal cannot take A4 hanging files
    const narrow = validate(
      { ...defaultParams(PED_V2), layout: 'drawers2_file', width: 300 },
      PED_V2,
    );
    expect(narrow.map((i) => i.code)).toContain('FILE_DRAWER_TOO_SMALL');
  });

  it('D-23 (template 0.4.0): the top reaches over the fronts, flush with their face', () => {
    const PED4 = PRODUCT_ARCHIVE.pedestal!['0.4.0']!;
    const r = generate(PED4, defaultParams(PED4));
    const top = r.panels.find((p) => p.id === 'top')!;
    const D = Number(defaultParams(PED4).depth);
    expect(bbox(top).max[2]).toBeCloseTo(D);
    for (const f of r.panels.filter((p) => p.role === 'drawer_front'))
      expect(bbox(f).max[2]).toBeCloseTo(D);
    // 0.3.0 kept the top at the carcass front
    const PED3 = PRODUCT_ARCHIVE.pedestal!['0.3.0']!;
    const old = generate(PED3, defaultParams(PED3));
    expect(bbox(old.panels.find((p) => p.id === 'top')!).max[2]).toBeLessThan(D - 16);
  });

  it('too high for under a desk -> PEDESTAL_TOO_HIGH', () => {
    expect(validate({ ...defaultParams(PED), height: 740 }, PED).map((i) => i.code)).toContain(
      'PEDESTAL_TOO_HIGH',
    );
  });

  it('LMDF fronts, LDSP carcass; LMDF carcass is rejected', () => {
    const r = generate(PED, { ...defaultParams(PED), doorMaterial: 'lmdf_egger_h1367_st40_16' });
    expect(r.issues).toEqual([]);
    expect(r.panels.find((x) => x.role === 'drawer_front')?.material).toBe(
      'lmdf_egger_h1367_st40_16',
    );
    expect(
      validate({ ...defaultParams(PED), corpusMaterial: 'lmdf_egger_h1367_st40_16' }, PED).map(
        (i) => i.code,
      ),
    ).toContain('INVALID_OPTION');
  });
});

describe('D-8 desk (stol)', () => {
  it('template 0.3.0, catalog 1.1.0, Dafna sizes, height 750 (EN 527-1: 740 ± 20)', () => {
    expect([DESK.templateId, DESK.productType]).toEqual(['desk', 'desk']);
    expect(DESK.parameters.find((p) => p.key === 'height')?.default).toBe(750);
    expect(DESK.parameters.find((p) => p.key === 'width')?.customerValues).toEqual([
      1100, 1500, 1700,
    ]);
    expect(DESK.parameters.find((p) => p.key === 'depth')?.customerValues).toEqual([600, 700]);
    expect(getMaterial(catalogForTemplate(DESK), 'egger_h3700_st10_25')?.thicknessMm).toBe(25);
  });

  it('two desk types only: LDSP carcass or the lift frame (no fixed metal legs)', () => {
    expect(DESK.parameters.find((p) => p.key === 'legs')?.options).toEqual(['ldsp', 'metal_lift']);
    expect(validate({ ...defaultParams(DESK), legs: 'metal' }, DESK).map((i) => i.code)).toEqual([
      'INVALID_OPTION',
    ]);
  });

  for (const legs of ['ldsp', 'metal_lift']) {
    for (const width of [1100, 1500, 1700]) {
      it(`${legs} / ${width}: work top at 750, legs under it, nothing outside the top`, () => {
        const r = generate(DESK, { ...defaultParams(DESK), legs, width });
        expect(r.issues).toEqual([]);
        const top = r.panels.find((p) => p.role === 'worktop')!;
        expect(bbox(top).max[1]).toBeCloseTo(750);
        for (const p of r.panels) {
          const b = bbox(p);
          expect(b.min[0], p.id).toBeGreaterThanOrEqual(-0.01);
          expect(b.max[0], p.id).toBeLessThanOrEqual(width + 0.01);
          expect(b.max[1], p.id).toBeLessThanOrEqual(750 + 0.01);
          expect(b.min[1], p.id).toBeGreaterThanOrEqual(-0.01);
        }
        if (legs === 'ldsp') {
          // D-26: two boards per leg, a modesty panel of three stepped layers
          expect(r.panels.filter((p) => p.role === 'leg')).toHaveLength(4);
          expect(r.panels.filter((p) => p.role === 'modesty')).toHaveLength(3);
          expect(r.panels.some((p) => p.role === 'frame')).toBe(false);
        } else {
          expect(r.panels.filter((p) => p.role === 'frame').length).toBe(7);
          expect(r.panels.some((p) => p.role === 'leg')).toBe(false);
          // a frame is a bought part: no edge banding, no grain
          for (const f of r.panels.filter((p) => p.role === 'frame')) {
            expect(f.grainDirection).toBeNull();
            expect(f.edges.front.bandId).toBeNull();
          }
        }
      });
    }
  }

  it('D-22 (template 0.3.0): a 16 mm work top doubled with a 50 mm frame; one band over both', () => {
    const DESK3 = PRODUCT_ARCHIVE.desk!['0.3.0']!;
    expect(DESK3.parameters.find((p) => p.key === 'topMaterial')?.options).not.toContain(
      'ldsp_white_22',
    );
    const r = generate(DESK3, { ...defaultParams(DESK3), width: 1500, depth: 700 });
    const tops = r.panels.filter((p) => p.role === 'worktop');
    expect(tops.map((p) => [p.id, p.lengthMm, p.widthMm, p.thicknessMm])).toEqual([
      ['worktop', 1500, 700, 16],
      ['worktop-frame-front', 1500, 50, 16],
      ['worktop-frame-back', 1500, 50, 16],
      ['worktop-frame-left', 600, 50, 16],
      ['worktop-frame-right', 600, 50, 16],
    ]);
    // the frame is under the top board; the legs stand under the frame (750 - 2 x 16)
    for (const f of tops.slice(1)) expect(bbox(f).max[1]).toBeCloseTo(750 - 16);
    expect(r.panels.find((p) => p.role === 'leg')?.lengthMm).toBe(718);
    expect(Object.values(tops[0]!.edges).every((e) => e.bandId)).toBe(true);
    for (const f of tops.slice(1))
      expect(Object.values(f.edges).every((e) => e.bandId === null)).toBe(true);
  });

  it('EN 527-1: fixed legs outside 740 ± 20 warn; the lift frame does not', () => {
    const fixed = validate({ ...defaultParams(DESK), height: 800 }, DESK).map((i) => i.code);
    expect(fixed).toContain('DESK_HEIGHT_NOT_ERGONOMIC');
    const lift = validate({ ...defaultParams(DESK), height: 800, legs: 'metal_lift' }, DESK);
    expect(lift.map((i) => i.code)).not.toContain('DESK_HEIGHT_NOT_ERGONOMIC');
  });

  it('GOST 13025.3-85: a work surface under 800 × 500 warns', () => {
    expect(validate({ ...defaultParams(DESK), width: 800, depth: 500 }, DESK)).toEqual([]);
    // the template minimum IS the GOST minimum: smaller sizes are rejected outright
    expect(DESK.parameters.find((p) => p.key === 'width')?.min).toBe(800);
    expect(DESK.parameters.find((p) => p.key === 'depth')?.min).toBe(500);
    const small = validate({ ...defaultParams(DESK), width: 800, depth: 450 }, DESK);
    expect(small.map((i) => i.code)).toEqual(['OUT_OF_RANGE']);
  });

  it('order draft carries the product type', () => {
    const r = generate(DESK, defaultParams(DESK));
    const draft = toOrderDraft(defaultParams(DESK), r, { template: DESK, now: () => new Date(0) });
    expect([draft.productType, draft.templateVersion, draft.catalogVersion]).toEqual([
      'desk',
      '0.4.0',
      '1.1.0',
    ]);
  });
});

describe('D-8 reproducibility per product', () => {
  const FIXTURES = {
    'pedestal default': ['pedestal', pedDefault],
    'pedestal 450 file plinth': ['pedestal', pedFile],
    'desk default ldsp': ['desk', deskLdsp],
    'desk 1600 lift': ['desk', deskLift],
    'pedestal 0.2.0 default 430 × 550 × 550': ['pedestal', ped2Default],
    'desk 0.2.0 1700 × 700': ['desk', desk2],
    'pedestal 0.3.0 default': ['pedestal', ped3Default],
    'pedestal 0.4.0 default (top flush with the fronts)': ['pedestal', ped4Default],
    'desk 0.3.0 1500 framed 16 mm top': ['desk', desk3],
    'pedestal 0.5.0 default (Bazis)': ['pedestal', ped5Default],
    'pedestal 0.6.0 default (Samet)': ['pedestal', ped6Default],
    'desk 0.4.0 1500 (Bazis)': ['desk', desk4],
  } as const;
  for (const [name, [templateId, fx]] of Object.entries(FIXTURES)) {
    it(`${name}: regenerated draft deep-equals the stored one`, () => {
      const r = regenerateApplication(fx.params, fx.templateVersion, { templateId });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.draft).toEqual(fx.expected);
    });
  }

  it('the archive holds every product; unknown product / version fails typed', () => {
    expect(Object.keys(PRODUCT_ARCHIVE)).toEqual(['wardrobe', 'pedestal', 'desk']);
    expect(regenerateApplication({}, '0.1.0', { templateId: 'sofa' })).toMatchObject({
      ok: false,
      code: 'UNKNOWN_TEMPLATE_VERSION',
    });
    // applications before D-8 have no templateId: wardrobe
    expect(regenerateApplication(defaultParams(PED), '0.1.0').ok).toBe(false);
  });
});
