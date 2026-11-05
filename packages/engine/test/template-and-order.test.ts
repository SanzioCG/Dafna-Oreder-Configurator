import { describe, expect, it } from 'vitest';
import {
  clampParam,
  defaultParams,
  generate,
  getParamDef,
  listUnconfirmed,
  toOrderDraft,
  wardrobeTemplateV0 as T,
} from '../src/index.js';

describe('wardrobe.v0 template', () => {
  it('defines the D-0 parameters with the specified ranges and defaults', () => {
    const summary = T.parameters.map((d) => [
      d.key,
      d.type,
      d.default,
      d.min ?? null,
      d.max ?? null,
      d.options ?? null,
      d.customerVisible,
      d.unconfirmed,
    ]);
    expect(summary).toEqual([
      ['width', 'int', 1360, 600, 2400, null, true, false],
      ['height', 'int', 1900, 1200, 2600, null, true, false],
      ['depth', 'int', 516, 350, 650, null, true, false],
      ['sections', 'enum', 'auto', null, null, ['auto', 1, 2, 3, 4], true, false],
      ['panelThickness', 'enum', 16, null, null, [16, 18], false, false],
      ['backPanel', 'enum', 'hdf_overlay', null, null, ['none', 'hdf_overlay'], false, true],
      ['base', 'enum', 'plinth', null, null, ['plinth', 'none'], true, true],
      ['plinthHeight', 'int', 100, 60, 150, null, false, true],
      ['plinthRecess', 'int', 0, 0, 60, null, false, true],
    ]);
  });

  it('every parameter has the required metadata', () => {
    for (const d of T.parameters) {
      expect(d.labelKey).toMatch(/^param\./);
      expect(d.uiStep).toBe('size');
      if (d.type === 'int') {
        expect(d.unit).toBe('mm');
        expect(d.step).toBeGreaterThan(0);
      }
      if (d.type === 'enum') expect(d.options).toContain(d.default);
    }
  });

  it('every unconfirmed value carries a note', () => {
    const items = listUnconfirmed(T);
    expect(items.map((i) => `${i.kind}:${i.key}`)).toEqual([
      'param:backPanel',
      'param:base',
      'param:plinthHeight',
      'param:plinthRecess',
      'constant:maxShelfSpanMm',
      'constant:backPanelThicknessMm',
      'constant:carcassMaterial',
      'constant:backMaterial',
      'rule:sides-on-plinth',
      'rule:top-bottom-between-sides',
      'rule:partitions-between-top-bottom',
      'rule:equal-sections-integer-mm',
      'rule:back-overlay-inside-depth',
      'rule:plinth-front-back-strips',
    ]);
    for (const i of items) {
      const note =
        i.kind === 'param' ? i.def.note : i.kind === 'constant' ? i.constant.note : i.note;
      expect(note?.length ?? 0).toBeGreaterThan(10);
    }
    expect(T.constants.maxShelfSpanMm?.value).toBe(900);
    expect(T.constants.backPanelThicknessMm?.value).toBe(3);
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

describe('toOrderDraft', () => {
  const params = { ...defaultParams(T), width: 2000 };
  const result = generate(T, params);
  const draft = toOrderDraft(params, result, { now: () => new Date('2026-11-05T10:00:00.000Z') });

  it('has the draft schema and the generated geometry', () => {
    expect(draft.schemaVersion).toBe('dafna-order/0-draft');
    expect(draft.productType).toBe('wardrobe');
    expect(draft.templateVersion).toBe(T.templateVersion);
    expect(draft.params).toEqual(params);
    expect(draft.panels).toEqual(result.panels);
    expect(draft.sections).toEqual(result.sections);
    expect(draft.issues).toEqual(result.issues);
    expect(draft.generatedAt).toBe('2026-11-05T10:00:00.000Z');
  });

  it('contains no price fields', () => {
    expect(JSON.stringify(draft)).not.toMatch(/price|cost|sum|total/i);
  });

  it('is JSON round-trippable', () => {
    expect(JSON.parse(JSON.stringify(draft))).toEqual(draft);
  });
});
