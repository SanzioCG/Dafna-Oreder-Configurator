import { describe, expect, it } from 'vitest';
import {
  clampParam,
  defaultParams,
  generate,
  getMaterial,
  getParamDef,
  listUnconfirmed,
  materialsV0 as C,
  migrateOrderDraft,
  migrateParamsFromD0,
  toOrderDraft,
  wardrobeTemplate as T,
  type OrderDraft,
  type Panel,
} from '../src/index.js';
import d0Default from './fixtures/d0-order-draft.default.json' with { type: 'json' };
import d0T18 from './fixtures/d0-order-draft.w2000-t18.json' with { type: 'json' };
import { toAdr009 } from './construction.js';

const LDSP = [
  'ldsp_white_16',
  'ldsp_light_grey_16',
  'ldsp_beige_16',
  'ldsp_oak_light_16',
  'ldsp_anthracite_16',
  'ldsp_white_18',
];

describe('wardrobe template v4 (0.5.0)', () => {
  it('defines the parameters with the specified ranges and defaults', () => {
    const summary = T.parameters.map((d) => [
      d.key,
      d.type,
      d.default,
      d.min ?? null,
      d.max ?? null,
      d.options ?? null,
      d.uiStep,
      d.customerVisible,
      d.unconfirmed,
    ]);
    const override = ['preset', 'none', 'single_left', 'single_right', 'double'];
    const interior = [
      'auto',
      'empty',
      'shelves',
      'rail',
      'rail_shelf',
      'drawers_shelves',
      'rail_drawers',
    ];
    expect(summary).toEqual([
      ['width', 'int', 1360, 600, 2400, null, 'size', true, false],
      ['height', 'int', 1900, 1200, 2600, null, 'size', true, false],
      ['depth', 'int', 600, 350, 650, null, 'size', true, true],
      ['sections', 'enum', 'auto', null, null, ['auto', 1, 2, 3, 4], 'size', true, false],
      ['corpusMaterial', 'enum', 'ldsp_white_16', null, null, LDSP, 'color', true, false],
      [
        'doorMaterial',
        'enum',
        'same_as_corpus',
        null,
        null,
        ['same_as_corpus', ...LDSP],
        'color',
        true,
        false,
      ],
      [
        'backPanel',
        'enum',
        'hdf_overlay',
        null,
        null,
        ['none', 'hdf_overlay'],
        'size',
        false,
        true,
      ],
      ['base', 'enum', 'plinth', null, null, ['plinth', 'none'], 'size', true, true],
      ['plinthHeight', 'int', 100, 60, 150, null, 'size', false, true],
      ['plinthRecess', 'int', 0, 0, 60, null, 'size', false, true],
      ['doors', 'enum', 'auto', null, null, ['none', 'all_single', 'auto'], 'doors', true, false],
      ['doorSection1', 'enum', 'preset', null, null, override, 'doors', false, false],
      ['doorSection2', 'enum', 'preset', null, null, override, 'doors', false, false],
      ['doorSection3', 'enum', 'preset', null, null, override, 'doors', false, false],
      ['doorSection4', 'enum', 'preset', null, null, override, 'doors', false, false],
      ['interior1', 'enum', 'auto', null, null, interior, 'interior', true, false],
      ['interior2', 'enum', 'auto', null, null, interior, 'interior', true, false],
      ['interior3', 'enum', 'auto', null, null, interior, 'interior', true, false],
      ['interior4', 'enum', 'auto', null, null, interior, 'interior', true, false],
    ]);
    expect(getParamDef(T, 'panelThickness')).toBeUndefined();
  });

  it('every parameter has the required metadata', () => {
    for (const d of T.parameters) {
      expect(d.labelKey).toMatch(/^param\./);
      expect(['size', 'color', 'doors', 'interior']).toContain(d.uiStep);
      if (d.type === 'int') {
        expect(d.unit).toBe('mm');
        expect(d.step).toBeGreaterThan(0);
      }
      if (d.type === 'enum') expect(d.options).toContain(d.default);
    }
  });

  it('material parameters only reference catalog entries of an allowed kind', () => {
    for (const d of T.parameters.filter((p) => p.materialKinds)) {
      for (const o of d.options ?? []) {
        if (o === 'same_as_corpus') continue;
        const m = getMaterial(C, o);
        expect(m, `${d.key}: ${String(o)}`).toBeDefined();
        expect(d.materialKinds).toContain(m?.kind);
      }
    }
    expect(getMaterial(C, T.constants.backMaterial?.value)?.kind).toBe('hdf');
  });

  it('every unconfirmed value carries a note', () => {
    const items = listUnconfirmed(T, C);
    expect(items.map((i) => `${i.kind}:${i.key}`)).toEqual([
      'param:depth',
      'param:backPanel',
      'param:base',
      'param:plinthHeight',
      'param:plinthRecess',
      'constant:maxShelfSpanMm',
      'constant:backMaterial',
      'constant:doorGapFrontMm',
      'constant:doorGapBetweenMm',
      'constant:doorGapEdgeMm',
      'constant:maxSingleLeafWidthMm',
      'constant:doorLeafRoundingMm',
      'constant:maxDoorHeightMm',
      'constant:shelfPitchTargetMm',
      'constant:shelfFrontSetbackMm',
      'constant:railTopShelfDropMm',
      'constant:railAxisDropMm',
      'constant:railDiameterMm',
      'constant:drawerFrontHeightMm',
      'constant:drawerCountPerSection',
      'constant:drawerGapMm',
      'constant:drawerFrontSetbackMm',
      'constant:drawerSlideClearanceMm',
      'constant:drawerBoxHeightReductionMm',
      'constant:drawerBackClearanceMm',
      'constant:drawerSlideMinMm',
      'constant:drawerSlideMaxMm',
      'constant:drawerSlideStepMm',
      'constant:railMinDepthMm',
      'constant:railMinHangingHeightMm',
      'constant:drawerMaxFrontWidthMm',
      'constant:edgeBandId',
      'constant:edgeBandThicknessMm',
      'rule:top-bottom-between-sides',
      'rule:equal-sections-integer-mm',
      'rule:partitions-between-top-bottom',
      'rule:back-overlay-covers-carcass',
      'rule:plinth-front-under-carcass',
      'rule:doors-overlay',
      'rule:door-split-at-partition-centre',

      'rule:interior-default-rule',
      'rule:interior-layout',
      'rule:edge-default-rule',
      'rule:grain-placeholder',
      'rule:door-hinge-sides',
      'rule:door-hinge-mount',
      'rule:auto-sections-door-leaf',
      ...C.materials.map((m) => `material:${m.id}`),
    ]);
    for (const i of items) {
      const note =
        i.kind === 'param'
          ? i.def.note
          : i.kind === 'constant'
            ? i.constant.note
            : i.kind === 'material'
              ? i.material.note
              : i.note;
      expect(note?.length ?? 0).toBeGreaterThan(10);
    }
    expect(T.constants.maxShelfSpanMm?.value).toBe(900);
    expect(T.constants.doorGapFrontMm?.value).toBe(2);
    expect(T.constants.doorGapBetweenMm?.value).toBe(3);
    expect(T.constants.doorGapEdgeMm?.value).toBe(1.5);
    expect(T.constants.maxSingleLeafWidthMm?.value).toBe(600);
    expect(T.constants.doorLeafRoundingMm?.value).toBe(0.5);
    expect(T.constants.maxSingleDoorWidthMm).toBeUndefined();
    expect(T.constants.maxDoorHeightMm?.value).toBe(2400);
  });

  it('clampParam clamps and rounds', () => {
    const width = getParamDef(T, 'width');
    if (!width) throw new Error('width missing');
    expect(clampParam(width, 100)).toBe(600);
    expect(clampParam(width, 9999)).toBe(2400);
    expect(clampParam(width, 1234.6)).toBe(1235);
    expect(clampParam(width, Number.NaN)).toBe(1360);
  });
});

describe('material catalog v0', () => {
  it('has the placeholder decors, all unconfirmed, with the required fields', () => {
    expect(C.materials.map((m) => [m.id, m.kind, m.thicknessMm, m.customerVisible])).toEqual([
      ['ldsp_white_16', 'ldsp', 16, true],
      ['ldsp_light_grey_16', 'ldsp', 16, true],
      ['ldsp_beige_16', 'ldsp', 16, true],
      ['ldsp_oak_light_16', 'ldsp', 16, true],
      ['ldsp_anthracite_16', 'ldsp', 16, true],
      ['ldsp_white_18', 'ldsp', 18, false],
      ['hdf_white_3', 'hdf', 3, false],
    ]);
    for (const m of C.materials) {
      expect(m.unconfirmed).toBe(true);
      expect(m.decorName).toMatch(/^decor\./);
      expect(m.colorHex).toMatch(/^#[0-9a-f]{6}$/);
      expect(m.textureUrl).toBeNull();
    }
  });
});

describe('toOrderDraft (dafna-order/0.3-draft)', () => {
  const params = {
    ...defaultParams(T),
    width: 2000,
    corpusMaterial: 'ldsp_oak_light_16',
    doorMaterial: 'ldsp_anthracite_16',
  };
  const result = generate(T, params);
  const draft = toOrderDraft(params, result, { now: () => new Date('2026-11-05T10:00:00.000Z') });

  it('has the 0.2 schema, materials, doors and interior per section, rails', () => {
    expect(draft.schemaVersion).toBe('dafna-order/0.3-draft');
    expect(draft.productType).toBe('wardrobe');
    expect(draft.templateVersion).toBe('0.5.0');
    expect(draft.catalogVersion).toBe('0.1.0');
    expect(draft.params).toEqual(params);
    expect(draft.materials.corpus?.id).toBe('ldsp_oak_light_16');
    expect(draft.materials.doors?.id).toBe('ldsp_anthracite_16');
    expect(draft.materials.back?.id).toBe('hdf_white_3');
    // 2000 -> 3 sections (646/645/645), leaves > 600 -> 3 double doors (shared partitions OK)
    expect(draft.doors).toEqual([
      { sectionIndex: 0, type: 'double', leaves: ['door-1-left', 'door-1-right'] },
      { sectionIndex: 1, type: 'double', leaves: ['door-2-left', 'door-2-right'] },
      { sectionIndex: 2, type: 'double', leaves: ['door-3-left', 'door-3-right'] },
    ]);
    expect(draft.dimensions).toEqual(result.dimensions);
    expect(draft.panels).toEqual(result.panels);
    expect(draft.rails).toEqual(result.rails);
    expect(
      draft.interior.map((x) => [x.sectionIndex, x.preset, x.presetSource, x.shelves.length]),
    ).toEqual([
      // default depth 600 -> carcass 579: double doors -> rail_shelf (top shelf only)
      [0, 'rail_shelf', 'auto', 1],
      [1, 'rail_shelf', 'auto', 1],
      [2, 'rail_shelf', 'auto', 1],
    ]);
    expect(draft.panels.every((p) => p.edges && 'grainDirection' in p && p.operations)).toBe(true);
    expect(draft.sections).toEqual(result.sections);
    expect(draft.issues).toEqual(result.issues);
    expect(draft.generatedAt).toBe('2026-11-05T10:00:00.000Z');
  });

  it('has no door material and empty door list entries when doors=none', () => {
    const p = { ...defaultParams(T), doors: 'none', backPanel: 'none' };
    const d = toOrderDraft(p, generate(T, p));
    expect(d.materials.doors).toBeNull();
    expect(d.materials.back).toBeNull();
    expect(d.doors.every((x) => x.type === 'none' && x.leaves.length === 0)).toBe(true);
  });

  it('contains no price fields and is JSON round-trippable', () => {
    const keys: string[] = [];
    JSON.stringify(draft, (k: string, v: unknown) => (keys.push(k), v));
    expect(keys.filter((k) => /price|cost|sum|total|currency/i.test(k))).toEqual([]);
    expect(JSON.parse(JSON.stringify(draft))).toEqual(draft);
  });
});

describe('D-0 order draft migration (chain D-0 -> 0.3)', () => {
  const geometry = (p: Panel) => [
    p.id,
    p.role,
    p.lengthMm,
    p.widthMm,
    p.thicknessMm,
    p.position,
    p.rotation,
  ];

  it.each([
    ['default (16 mm)', d0Default, 'ldsp_white_16'],
    ['width 2000, 18 mm, recess 20', d0T18, 'ldsp_white_18'],
  ])('%s: same geometry, new material ids, schema 0.2', (_name, d0, corpus) => {
    const { draft, issues } = migrateOrderDraft(d0);
    expect(issues.map((i) => i.code)).toEqual(['MIGRATION_CONSTRUCTION_CHANGED']);
    if (!draft) throw new Error('no draft');
    expect(draft.schemaVersion).toBe('dafna-order/0.3-draft');
    expect(draft.migratedFrom).toBe('dafna-order/0-draft');
    expect(draft.params.interior1).toBe('empty');
    expect(draft.rails).toEqual([]);
    expect(draft.generatedAt).toBe(d0.generatedAt);
    expect(draft.params.corpusMaterial).toBe(corpus);
    expect(draft.params.doors).toBe('none');
    expect('panelThickness' in draft.params).toBe(false);
    // geometry identical to what D-0 produced, except the ADR-009 construction (sides to the
    // floor, plinth strips between the sides)
    expect(draft.panels.map(geometry)).toEqual(toAdr009(d0.panels as Panel[]).map(geometry));
    const materialMap: Record<string, string> = { ldsp: corpus, hdf: 'hdf_white_3' };
    expect(draft.panels.map((p) => p.material)).toEqual(
      d0.panels.map((p) => materialMap[p.material]),
    );
    expect(
      draft.sections.map(
        ({ index, innerWidthMm, innerHeightMm, innerDepthMm, xStartMm, doorType, preset }) => ({
          index,
          innerWidthMm,
          innerHeightMm,
          innerDepthMm,
          xStartMm,
          doorType,
          preset,
        }),
      ),
    ).toEqual(d0.sections.map((s) => ({ ...s, doorType: 'none', preset: 'empty' })));
    expect(draft.issues).toEqual(d0.issues);
    expect(draft.materials.corpus?.id).toBe(corpus);
    expect(draft.materials.doors).toBeNull();
  });

  it('maps a thickness that is not in the catalog to an error, not an exception', () => {
    const { params, issues } = migrateParamsFromD0({ ...d0Default.params, panelThickness: 25 });
    expect(issues.map((i) => i.code)).toEqual(['MIGRATION_THICKNESS_UNAVAILABLE']);
    expect(params.corpusMaterial).toBe('ldsp_white_16');
    expect(
      migrateOrderDraft({ ...d0Default, params: { ...d0Default.params, panelThickness: 25 } })
        .draft,
    ).toBeNull();
  });

  it('passes current drafts through and rejects unknown schemas', () => {
    const current = toOrderDraft(defaultParams(T), generate(T, defaultParams(T)));
    expect(migrateOrderDraft(current).draft).toBe(current as OrderDraft);
    for (const bad of [null, 42, {}, { schemaVersion: 'other' }]) {
      const r = migrateOrderDraft(bad);
      expect(r.draft).toBeNull();
      expect(r.issues.map((i) => i.code)).toEqual(['UNSUPPORTED_SCHEMA']);
    }
  });
});
