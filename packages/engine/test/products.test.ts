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

/** world-space bounding box of a panel (product mm) */
function bbox(p: Panel) {
  const [rx, , rz] = p.rotation;
  // local L (X), T (Y), W (Z) -> product axes for the rotations the generators use
  let size: [number, number, number] = [p.lengthMm, p.thicknessMm, p.widthMm];
  if (rz === 90) size = [p.thicknessMm, p.lengthMm, p.widthMm];
  else if (rx === 90) size = [p.lengthMm, p.widthMm, p.thicknessMm];
  return {
    min: p.position.map((c, i) => c - size[i]! / 2),
    max: p.position.map((c, i) => c + size[i]! / 2),
  };
}

describe('D-8 office pedestal (ofis tumbasi)', () => {
  it('template 0.1.0, catalog 1.1.0, standard sizes', () => {
    expect([PED.templateId, PED.templateVersion, PED.productType]).toEqual([
      'pedestal',
      '0.1.0',
      'pedestal',
    ]);
    expect(catalogForTemplate(PED).catalogVersion).toBe('1.1.0');
    expect(PED.parameters.find((p) => p.key === 'height')?.customerValues).toEqual([600]);
  });

  for (const layout of ['drawers3', 'drawers2_file', 'door_shelf']) {
    for (const base of ['castors', 'plinth']) {
      for (const width of [400, 450]) {
        it(`${layout} / ${base} / ${width}: valid, inside its overall box, fits under a 740 desk`, () => {
          const p = { ...defaultParams(PED), layout, base, width };
          const r = generate(PED, p);
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
            expect(b.max[1], panel.id).toBeLessThanOrEqual(600 + 0.01);
            expect(b.max[2], panel.id).toBeLessThanOrEqual(500 + 0.01);
          }
          // under a 740 desk with a 25 mm top there are 715 mm: the pedestal is 600
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

  it('A4 hanging-file drawer (450 wide): box >= 330 wide and >= 240 high inside', () => {
    const r = generate(PED, { ...defaultParams(PED), layout: 'drawers2_file', width: 450 });
    const file = r.sections[0]!.drawers[0]!;
    expect(file.boxWidthMm - 2 * 16).toBeGreaterThanOrEqual(330);
    expect(file.boxHeightMm).toBeGreaterThanOrEqual(240);
    // a 300 mm pedestal cannot take A4 hanging files
    const narrow = validate({ ...defaultParams(PED), layout: 'drawers2_file', width: 300 }, PED);
    expect(narrow.map((i) => i.code)).toContain('FILE_DRAWER_TOO_SMALL');
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
  it('template 0.1.0, catalog 1.1.0, EN 527-1 height', () => {
    expect([DESK.templateId, DESK.productType]).toEqual(['desk', 'desk']);
    expect(DESK.parameters.find((p) => p.key === 'height')?.default).toBe(740);
    expect(getMaterial(catalogForTemplate(DESK), 'egger_h3700_st10_25')?.thicknessMm).toBe(25);
  });

  for (const legs of ['ldsp', 'metal', 'metal_lift']) {
    for (const width of [1000, 1400, 1800]) {
      it(`${legs} / ${width}: work top at 740, legs under it, nothing outside the top`, () => {
        const r = generate(DESK, { ...defaultParams(DESK), legs, width });
        expect(r.issues).toEqual([]);
        const top = r.panels.find((p) => p.role === 'worktop')!;
        expect(bbox(top).max[1]).toBeCloseTo(740);
        for (const p of r.panels) {
          const b = bbox(p);
          expect(b.min[0], p.id).toBeGreaterThanOrEqual(-0.01);
          expect(b.max[0], p.id).toBeLessThanOrEqual(width + 0.01);
          expect(b.max[1], p.id).toBeLessThanOrEqual(740 + 0.01);
          expect(b.min[1], p.id).toBeGreaterThanOrEqual(-0.01);
        }
        if (legs === 'ldsp') {
          expect(r.panels.filter((p) => p.role === 'leg')).toHaveLength(2);
          expect(r.panels.filter((p) => p.role === 'modesty')).toHaveLength(1);
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
      '0.1.0',
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
