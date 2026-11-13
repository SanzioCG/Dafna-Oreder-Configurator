import { describe, expect, it } from 'vitest';
import {
  defaultParams,
  generate,
  migrateOrderDraft,
  migrateParamsFrom01,
  migrateParamsFrom02,
  toOrderDraft,
  wardrobeTemplate as T,
  type Panel,
  regenerateApplication,
} from '../src/index.js';
import { toAdr009 } from './construction.js';
import appDefault from './fixtures/applications/0.5.0.default.json' with { type: 'json' };
import appMixed from './fixtures/applications/0.5.0.w2400-4sections-mixed.json' with { type: 'json' };
import d0Default from './fixtures/d0-order-draft.default.json' with { type: 'json' };
// Real 0.1 drafts, produced by the D-1a engine (main @ 10d0238).
import d01Default from './fixtures/d01-order-draft.default.json' with { type: 'json' };
import d01NoDoors from './fixtures/d01-order-draft.nodoors.json' with { type: 'json' };
import d01Singles from './fixtures/d01-order-draft.w1600-3singles.json' with { type: 'json' };
// Real 0.2 drafts, produced by the D-1b engine (main @ 67e7eda).
import d02Default from './fixtures/d02-order-draft.default.json' with { type: 'json' };
import d02Interior from './fixtures/d02-order-draft.d600-interior.json' with { type: 'json' };

const geometry = (p: Panel) => [
  p.id,
  p.role,
  p.lengthMm,
  p.widthMm,
  p.thicknessMm,
  p.position,
  p.rotation,
];
const doorsOf = (sections: { doorType: string }[]) => sections.map((s) => s.doorType);
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('parameter steps', () => {
  it('0.1 -> 0.2: pins sections=auto to the old count, interior empty', () => {
    const p = migrateParamsFrom01(d01Default.params, 2);
    expect(p.sections).toBe(2);
    expect([p.interior1, p.interior2, p.interior3, p.interior4]).toEqual([
      'empty',
      'empty',
      'empty',
      'empty',
    ]);
  });

  it('0.2 -> 0.3: pins sections=auto, keeps the stored depth and interior', () => {
    const p = migrateParamsFrom02(d02Default.params, 3);
    expect(p.sections).toBe(3);
    expect(p.depth).toBe(516);
    expect(p.interior1).toBe('auto');
  });
});

describe('0.1 drafts -> 0.3', () => {
  it('two adjacent double doors (refused by D-1b) migrate again, unchanged', () => {
    expect(doorsOf(d01Default.sections)).toEqual(['double', 'double']);
    const { draft, issues } = migrateOrderDraft(d01Default);
    expect(codes(issues)).toEqual(['MIGRATION_CONSTRUCTION_CHANGED']);
    if (!draft) throw new Error('no draft');
    expect(draft.schemaVersion).toBe('dafna-order/0.3-draft');
    expect(draft.migratedFrom).toBe('dafna-order/0.1-draft');
    expect(doorsOf(draft.sections)).toEqual(['double', 'double']);
    expect(draft.panels.map(geometry)).toEqual(
      toAdr009(d01Default.panels as Panel[]).map(geometry),
    );
  });

  it('original hinge sides L,R,L are preserved (overrides), geometry identical, no warnings', () => {
    expect(doorsOf(d01Singles.sections)).toEqual(['single_left', 'single_right', 'single_left']);
    const { draft, issues } = migrateOrderDraft(d01Singles);
    // D-6: the placeholder decors move to Dafna's catalog (oak light -> EGGER H3860, anthracite
    // -> EGGER U963), reported; the geometry is unchanged (both 16 mm)
    expect(codes(issues)).toEqual([
      'MIGRATION_MATERIAL_CHANGED',
      'MIGRATION_MATERIAL_CHANGED',
      'MIGRATION_CONSTRUCTION_CHANGED',
    ]);
    if (!draft) throw new Error('no draft');
    expect([draft.params.corpusMaterial, draft.params.doorMaterial]).toEqual([
      'egger_h3860_st9_16',
      'egger_u963_st9_16',
    ]);
    expect(doorsOf(draft.sections)).toEqual(['single_left', 'single_right', 'single_left']);
    // the current auto rule would give L,L,R: sections 2 and 3 are pinned as overrides
    expect([
      draft.params.doorSection1,
      draft.params.doorSection2,
      draft.params.doorSection3,
    ]).toEqual(['preset', 'single_right', 'single_left']);
    expect(draft.panels.map(geometry)).toEqual(
      toAdr009(d01Singles.panels as Panel[]).map(geometry),
    );
    expect(
      draft.panels.filter((p) => p.role === 'door').map((p) => [p.id, p.hingeSide, p.hingeMount]),
    ).toEqual([
      ['door-1', 'left', 'full_overlay'],
      ['door-2', 'right', 'half_overlay'],
      ['door-3', 'left', 'half_overlay'],
    ]);
  });

  it('without doors: geometry identical', () => {
    const { draft, issues } = migrateOrderDraft(d01NoDoors);
    expect(codes(issues)).toEqual(['MIGRATION_CONSTRUCTION_CHANGED']);
    expect(draft?.panels.map(geometry)).toEqual(
      toAdr009(d01NoDoors.panels as Panel[]).map(geometry),
    );
  });

  it('a 0.1 single door that the leaf rule no longer allows becomes double, reported', () => {
    // D-1a decided on the inner width (600 -> single); the leaf is 621 mm > 600
    const synthetic = {
      ...d01Singles,
      params: { ...d01Singles.params, width: 1248, sections: 2 },
      sections: [
        { ...d01Singles.sections[0], doorType: 'single_left' },
        { ...d01Singles.sections[1], doorType: 'single_right' },
      ],
    };
    const { draft, issues } = migrateOrderDraft(synthetic);
    if (!draft) throw new Error('no draft');
    expect(doorsOf(draft.sections)).toEqual(['double', 'double']);
    expect(issues.map((i) => [i.code, i.values.sectionNumber, i.values.from, i.values.to])).toEqual(
      [
        ['MIGRATION_MATERIAL_CHANGED', undefined, 'ldsp_oak_light_16', 'egger_h3860_st9_16'],
        ['MIGRATION_MATERIAL_CHANGED', undefined, 'ldsp_anthracite_16', 'egger_u963_st9_16'],
        ['MIGRATION_DOORS_CHANGED', 1, 'single_left', 'double'],
        ['MIGRATION_DOORS_CHANGED', 2, 'single_right', 'double'],
        ['MIGRATION_CONSTRUCTION_CHANGED', undefined, '0.2.0', '0.6.0'],
      ],
    );
  });
});

describe('0.2 drafts (D-1b) -> 0.3', () => {
  it('D-1b default (3 sections L,R,R, depth 516): section count, hinges and geometry kept', () => {
    expect(doorsOf(d02Default.sections)).toEqual(['single_left', 'single_right', 'single_right']);
    const { draft, issues } = migrateOrderDraft(d02Default);
    expect(codes(issues)).toEqual(['MIGRATION_CONSTRUCTION_CHANGED']);
    if (!draft) throw new Error('no draft');
    expect(draft.migratedFrom).toBe('dafna-order/0.2-draft');
    expect(draft.params.sections).toBe(3);
    expect(doorsOf(draft.sections)).toEqual(['single_left', 'single_right', 'single_right']);
    expect(draft.panels.map(geometry)).toEqual(
      toAdr009(d02Default.panels as unknown as Panel[]).map(geometry),
    );
    expect(draft.panels.filter((p) => p.role === 'door').map((p) => p.hingeMount)).toEqual([
      'full_overlay',
      'half_overlay',
      'full_overlay',
    ]);
  });

  it('chosen interior presets are kept', () => {
    const { draft, issues } = migrateOrderDraft(d02Interior);
    expect(codes(issues)).toEqual(['MIGRATION_CONSTRUCTION_CHANGED']);
    expect(draft?.sections.map((s) => [s.preset, s.presetSource])).toEqual(
      d02Interior.sections.map((s) => [s.preset, s.presetSource]),
    );
    expect(draft?.panels.map(geometry)).toEqual(
      toAdr009(d02Interior.panels as unknown as Panel[]).map(geometry),
    );
  });
});

describe('full chain D-0 -> 0.1 -> 0.2 -> 0.3', () => {
  it('a D-0 draft becomes a 0.3 draft with the D-0 geometry', () => {
    const { draft, issues } = migrateOrderDraft(d0Default);
    expect(codes(issues)).toEqual(['MIGRATION_CONSTRUCTION_CHANGED']);
    if (!draft) throw new Error('no draft');
    expect(draft.schemaVersion).toBe('dafna-order/0.3-draft');
    expect(draft.migratedFrom).toBe('dafna-order/0-draft');
    expect(draft.panels.map(geometry)).toEqual(toAdr009(d0Default.panels as Panel[]).map(geometry));
    expect(draft.params.doors).toBe('none');
    expect(draft.params.sections).toBe(2);
  });

  it('migrating twice is a no-op; unknown schemas are rejected', () => {
    const once = migrateOrderDraft(d0Default).draft;
    expect(migrateOrderDraft(once).draft).toBe(once);
    const current = toOrderDraft(defaultParams(T), generate(T, defaultParams(T)));
    expect(migrateOrderDraft(current).draft).toBe(current);
    expect(codes(migrateOrderDraft({ schemaVersion: 'dafna-order/9-draft' }).issues)).toEqual([
      'UNSUPPORTED_SCHEMA',
    ]);
  });
});

describe('template 0.4.0 -> current (ADR-009, same schema 0.3)', () => {
  const old = (base: 'plinth' | 'none') => {
    const params = { ...defaultParams(T), base };
    const current = toOrderDraft(params, generate(T, params));
    // simulate a draft saved by template 0.4.0 (sides on the plinth, full-width strips)
    const t = 16;
    const ph = base === 'plinth' ? Number(defaultParams(T).plinthHeight) : 0;
    const panels = current.panels.map((p) => {
      if (base === 'plinth' && (p.id === 'side-left' || p.id === 'side-right')) {
        const len = p.lengthMm - ph;
        return { ...p, lengthMm: len, position: [p.position[0], ph + len / 2, p.position[2]] };
      }
      if (p.role === 'plinth') return { ...p, lengthMm: p.lengthMm + 2 * t };
      return p;
    });
    return { ...current, templateVersion: '0.4.0', panels };
  };

  it('base=plinth: regenerated with sides to the floor, MIGRATION_CONSTRUCTION_CHANGED reported', () => {
    const d = old('plinth');
    const { draft, issues } = migrateOrderDraft(d);
    if (!draft) throw new Error('no draft');
    expect(draft.templateVersion).toBe('0.6.0');
    expect(draft.schemaVersion).toBe('dafna-order/0.3-draft');
    expect(issues.map((i) => [i.code, i.severity, i.values.from, i.values.to])).toEqual([
      ['MIGRATION_CONSTRUCTION_CHANGED', 'warning', '0.4.0', '0.6.0'],
    ]);
    expect(draft.panels.map(geometry)).toEqual(toAdr009(d.panels as Panel[]).map(geometry));
    expect(draft.params).toEqual(d.params);
    expect(migrateOrderDraft(draft).draft).toBe(draft); // now current: no-op
  });

  it('base=none: geometry identical, no warning (only the template version moves)', () => {
    const d = old('none');
    const { draft, issues } = migrateOrderDraft(d);
    expect(issues).toEqual([]);
    expect(draft?.templateVersion).toBe('0.6.0');
    expect(draft?.panels.map(geometry)).toEqual((d.panels as Panel[]).map(geometry));
  });
});

describe('template 0.5.0 -> 0.6.0 (D-6: catalog 1.0.0)', () => {
  it('placeholder decors are mapped to Dafna decors, reported, geometry unchanged', () => {
    const r = regenerateApplication(appMixed.params, '0.5.0', {
      generatedAt: '2026-11-06T09:00:00.000Z',
    });
    if (!r.ok) throw new Error(r.code);
    const { draft, issues } = migrateOrderDraft(r.draft);
    if (!draft) throw new Error('no draft');
    expect(draft.templateVersion).toBe('0.6.0');
    expect(draft.catalogVersion).toBe('1.0.0');
    expect(issues.map((i) => [i.code, i.paramKey, i.values.from, i.values.to])).toEqual([
      ['MIGRATION_MATERIAL_CHANGED', 'corpusMaterial', 'ldsp_anthracite_16', 'egger_u963_st9_16'],
      ['MIGRATION_MATERIAL_CHANGED', 'doorMaterial', 'ldsp_oak_light_16', 'egger_h3860_st9_16'],
    ]);
    expect(draft.panels.map(geometry)).toEqual(r.draft.panels.map(geometry));
    expect(draft.generatedAt).toBe('2026-11-06T09:00:00.000Z');
  });

  it('the white board keeps its id: no warning, nothing changes', () => {
    const r = regenerateApplication(appDefault.params, '0.5.0');
    if (!r.ok) throw new Error(r.code);
    const { draft, issues } = migrateOrderDraft(r.draft);
    expect(issues).toEqual([]);
    expect(draft?.params.corpusMaterial).toBe('ldsp_white_16');
    expect(draft?.panels.map(geometry)).toEqual(r.draft.panels.map(geometry));
  });
});
