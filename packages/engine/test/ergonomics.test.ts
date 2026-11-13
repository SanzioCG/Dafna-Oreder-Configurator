import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_ARCHIVE,
  defaultParams,
  generate,
  getParamDef,
  listUnconfirmed,
  migrateOrderDraft,
  regenerateApplication,
  validate,
  wardrobeTemplate as T,
  type Params,
  type Section,
} from '../src/index.js';
import app6Lmdf from './fixtures/applications/0.6.0.w2400-egger-lmdf16_7-doors.json' with { type: 'json' };

/**
 * D-7: wardrobe template 0.7.0 — standard customer sizes and storage presets that follow the
 * functional sizes of GOST 13025.1-85 «Мебель бытовая. Функциональные размеры отделений для
 * хранения» (drawings 1-2, cl. 2.3, 3.1, 7). Heights are from the floor (mm).
 */
const GOST = {
  railTopMax: 1900, // cl. 2.3
  railTopToShelfMin: 50, // drawings 1-2
  longHangMin: 1400, // drawing 1
  shortHangMin: 900, // drawing 2
  hangDepthMin: 560, // drawings 1-2
  shelfGapMin: 170, // cl. 3.1
  drawerTopMax: 1250, // cl. 7
};

const STANDARD = {
  width: [800, 1000, 1200, 1500, 1600, 1800, 2000, 2400],
  height: [2100, 2400],
  depth: [450, 600],
};
const PRESETS = ['long_hang', 'short_hang', 'short_hang_drawers', 'shelves', 'drawers_shelves'];
const HANGING = ['long_hang', 'short_hang', 'short_hang_drawers'];

const all = (p: Params, preset: string): Params => ({
  ...p,
  interior1: preset,
  interior2: preset,
  interior3: preset,
  interior4: preset,
});
const railTop = (s: Section) =>
  s.rails[0] ? s.rails[0].axisYMm + s.rails[0].diameterMm / 2 : null;

describe('template 0.7.0 (D-7): standard sizes', () => {
  it('is the current template, same generator, catalog 1.0.0', () => {
    expect(T.templateVersion).toBe('0.7.0');
    expect(T.generator).toBe(TEMPLATE_ARCHIVE['0.6.0']!.generator);
  });

  it('customers choose standard sizes only; defaults are standard', () => {
    for (const [key, values] of Object.entries(STANDARD)) {
      const def = getParamDef(T, key)!;
      expect(def.customerValues, key).toEqual(values);
      expect(values, key).toContain(def.default);
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(def.min!);
        expect(v).toBeLessThanOrEqual(def.max!);
      }
    }
    expect([getParamDef(T, 'width')!.default, getParamDef(T, 'height')!.default]).toEqual([
      1500, 2100,
    ]);
  });

  it('interior presets: the GOST storage set (no rail / rail_shelf / rail_drawers)', () => {
    for (let i = 1; i <= 4; i++) {
      expect(getParamDef(T, `interior${i}`)!.options).toEqual([
        'auto',
        'empty',
        'shelves',
        'long_hang',
        'short_hang',
        'drawers_shelves',
        'short_hang_drawers',
      ]);
    }
  });

  it('GOST constants are marked as standard values (not assumptions); choices stay unconfirmed', () => {
    const c = T.constants;
    expect([
      c.railTopMaxMm?.value,
      c.longHangMinMm?.value,
      c.shortHangMinMm?.value,
      c.railMinDepthMm?.value,
      c.minShelfGapMm?.value,
      c.drawerTopMaxMm?.value,
    ]).toEqual([1900, 1400, 900, 560, 170, 1250]);
    for (const k of ['railTopMaxMm', 'longHangMinMm', 'shortHangMinMm', 'railMinDepthMm']) {
      expect(c[k]?.unconfirmed, k).toBe(false);
      expect(c[k]?.note, k).toContain('GOST 13025.1-85');
    }
    for (const k of ['railTopToShelfMm', 'shortHangClearMm', 'autoPresetDouble']) {
      expect(c[k]?.unconfirmed, k).toBe(true);
    }
    for (const item of listUnconfirmed(T)) {
      const note =
        item.kind === 'param'
          ? item.def.note
          : item.kind === 'constant'
            ? item.constant.note
            : item.kind === 'material'
              ? item.material.note
              : item.note;
      expect(note, `${item.kind}:${item.key}`).toBeTruthy();
    }
  });
});

describe('GOST 13025.1-85 functional sizes, every standard size and preset', () => {
  for (const height of STANDARD.height) {
    for (const width of STANDARD.width) {
      for (const preset of PRESETS) {
        it(`${width} × ${height} × 600, ${preset}`, () => {
          const r = generate(T, all({ ...defaultParams(T), width, height, depth: 600 }, preset));
          expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
          expect(r.issues.map((i) => i.code)).not.toContain('RAIL_HEIGHT_SHORT');
          for (const s of r.sections) {
            const top = railTop(s);
            if (HANGING.includes(preset)) {
              expect(top).not.toBeNull();
              expect(top!).toBeLessThanOrEqual(GOST.railTopMax);
              expect(s.innerDepthMm).toBeGreaterThanOrEqual(GOST.hangDepthMin);
              const min = preset === 'long_hang' ? GOST.longHangMin : GOST.shortHangMin;
              expect(s.clearHangingHeightMm!).toBeGreaterThanOrEqual(min);
              // nothing above the rail closer than 50 mm
              const above = s.shelves.filter((sh) => sh.yMm > top!);
              for (const sh of above) {
                expect(sh.yMm - top!).toBeGreaterThanOrEqual(GOST.railTopToShelfMin);
              }
            } else {
              expect(top).toBeNull();
            }
            // shelves never closer than 170 mm apart (bottom face to the top face below)
            const ys = s.shelves.map((sh) => sh.yMm);
            for (let i = 1; i < ys.length; i++) {
              expect(ys[i]! - (ys[i - 1]! + 16)).toBeGreaterThanOrEqual(GOST.shelfGapMin);
            }
            for (const d of s.drawers) {
              expect(d.frontYMm + d.frontHeightMm).toBeLessThanOrEqual(GOST.drawerTopMax);
            }
          }
        });
      }
    }
  }

  it('2400 high: an antresol above the rail (divider shelf, usable compartment above)', () => {
    const r = generate(T, all({ ...defaultParams(T), height: 2400 }, 'long_hang'));
    const s = r.sections[0]!;
    const divider = s.shelves.find((sh) => sh.kind === 'top')!;
    expect(divider.yMm).toBe(1960); // rail top 1900 + 60
    expect(s.clearHangingHeightMm).toBeGreaterThanOrEqual(1400);
  });

  it('2100 high: no antresol (the space above the rail is < 170 mm usable)', () => {
    const r = generate(T, all(defaultParams(T), 'long_hang'));
    expect(r.sections[0]!.shelves).toEqual([]);
  });

  it('short clothes: a 1000 mm hanging zone (>= 900) with shelves below it', () => {
    const s = generate(T, all(defaultParams(T), 'short_hang')).sections[0]!;
    expect(s.clearHangingHeightMm).toBe(1000);
    expect(s.shelves.filter((sh) => sh.kind === 'fixed')).toHaveLength(1);
    expect(s.shelves.filter((sh) => sh.kind === 'removable').length).toBeGreaterThan(0);
  });

  it('450 deep (inner < 560): every hanging preset warns, so customers are not offered it', () => {
    for (const preset of HANGING) {
      const codes = validate(all({ ...defaultParams(T), depth: 450 }, preset)).map((i) => i.code);
      expect(codes, preset).toContain('RAIL_DEPTH_SHORT');
    }
    // 'auto' never warns: it falls back to shelves
    const auto = generate(T, { ...defaultParams(T), depth: 450 });
    expect(auto.issues).toEqual([]);
    expect(auto.sections.map((s) => s.preset)).toEqual(['shelves', 'shelves']);
  });

  it("'auto' behind double doors at 600 deep = short clothes + shelves", () => {
    const r = generate(T, defaultParams(T));
    expect(r.sections.map((s) => [s.doorType, s.preset, s.presetSource])).toEqual([
      ['double', 'short_hang', 'auto'],
      ['double', 'short_hang', 'auto'],
    ]);
  });
});

describe('older drafts -> template 0.7.0', () => {
  it('rail presets map to the GOST presets; every changed section is reported', () => {
    const r = regenerateApplication(app6Lmdf.params, '0.6.0');
    if (!r.ok) throw new Error(r.code);
    const { draft, issues } = migrateOrderDraft(r.draft);
    if (!draft) throw new Error('no draft');
    expect(draft.templateVersion).toBe('0.7.0');
    expect(draft.params.interior1).toBe('short_hang'); // was rail_shelf
    expect(draft.params.interior4).toBe('short_hang_drawers'); // was rail_drawers
    expect(
      issues
        .filter((i) => i.code === 'MIGRATION_INTERIOR_CHANGED')
        .map((i) => [i.values.sectionNumber, i.values.from, i.values.to]),
    ).toEqual([
      [1, 'rail_shelf', 'short_hang'],
      [4, 'rail_drawers', 'short_hang_drawers'],
    ]);
    // the outer geometry (carcass, doors) does not change
    const outer = (d: typeof draft) =>
      d.panels.filter((p) => p.role !== 'shelf').map((p) => [p.id, p.lengthMm, p.widthMm]);
    expect(outer(draft)).toEqual(outer(r.draft));
  });
});
