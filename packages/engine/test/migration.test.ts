import { describe, expect, it } from 'vitest';
import {
  defaultParams,
  generate,
  migrateOrderDraft,
  migrateParamsFrom01,
  toOrderDraft,
  wardrobeTemplate as T,
  type Panel,
} from '../src/index.js';
import d0Default from './fixtures/d0-order-draft.default.json' with { type: 'json' };
// Real 0.1 drafts, produced by the D-1a engine (main @ 10d0238) before any D-1b change.
import d01Default from './fixtures/d01-order-draft.default.json' with { type: 'json' };
import d01NoDoors from './fixtures/d01-order-draft.nodoors.json' with { type: 'json' };
import d01Singles from './fixtures/d01-order-draft.w1600-3singles.json' with { type: 'json' };

const geometry = (p: Panel) => [
  p.id,
  p.role,
  p.lengthMm,
  p.widthMm,
  p.thicknessMm,
  p.position,
  p.rotation,
];
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('0.1 -> 0.2 parameter step', () => {
  it('pins sections=auto to the old count and sets interior empty', () => {
    const p = migrateParamsFrom01(d01Default.params, 2);
    expect(p.sections).toBe(2);
    expect([p.interior1, p.interior2, p.interior3, p.interior4]).toEqual([
      'empty',
      'empty',
      'empty',
      'empty',
    ]);
    expect(p.corpusMaterial).toBe(d01Default.params.corpusMaterial);
    expect(migrateParamsFrom01({ ...d01Default.params, sections: 3 }, 2).sections).toBe(3);
  });
});

describe('0.1 drafts -> 0.2', () => {
  it('without doors: geometry identical, schema 0.2, production fields added', () => {
    expect(d01NoDoors.schemaVersion).toBe('dafna-order/0.1-draft');
    const { draft, issues } = migrateOrderDraft(d01NoDoors);
    expect(issues).toEqual([]);
    if (!draft) throw new Error('no draft');
    expect(draft.schemaVersion).toBe('dafna-order/0.2-draft');
    expect(draft.migratedFrom).toBe('dafna-order/0.1-draft');
    expect(draft.generatedAt).toBe(d01NoDoors.generatedAt);
    expect(draft.panels.map(geometry)).toEqual((d01NoDoors.panels as Panel[]).map(geometry));
    expect(draft.panels.map((p) => p.material)).toEqual(d01NoDoors.panels.map((p) => p.material));
    for (const p of draft.panels) {
      expect(p.edges).toBeDefined();
      expect(p.operations).toEqual([]);
    }
    expect(draft.interior.every((x) => x.preset === 'empty')).toBe(true);
    expect(draft.rails).toEqual([]);
  });

  it('3 single doors (0.1 hinges L,R,L): geometry kept, hinge change reported, not silent', () => {
    expect(d01Singles.sections.map((s) => s.doorType)).toEqual([
      'single_left',
      'single_right',
      'single_left',
    ]);
    const { draft, issues } = migrateOrderDraft(d01Singles);
    if (!draft) throw new Error('no draft');
    // L,R,L hangs doors 2 and 3 on the same partition -> D-1b rule gives L,R,R
    expect(draft.sections.map((s) => s.doorType)).toEqual([
      'single_left',
      'single_right',
      'single_right',
    ]);
    expect(issues).toEqual([
      {
        code: 'MIGRATION_DOORS_CHANGED',
        severity: 'warning',
        paramKey: 'doorSection3',
        messageKey: 'issue.MIGRATION_DOORS_CHANGED',
        values: { sectionIndex: 2, sectionNumber: 3, from: 'single_left', to: 'single_right' },
      },
    ]);
    // every panel keeps its size and place (leaf widths here are whole mm, rounding changes nothing)
    expect(draft.panels.map(geometry)).toEqual((d01Singles.panels as Panel[]).map(geometry));
    expect(draft.panels.find((p) => p.id === 'door-3')?.hingeSide).toBe('right');
    expect(draft.materials.corpus?.id).toBe('ldsp_oak_light_16');
    expect(draft.materials.doors?.id).toBe('ldsp_anthracite_16');
  });

  it('0.1 default (2 sections, two adjacent double doors) cannot be built: no draft, HINGE_CONFLICT', () => {
    expect(d01Default.sections.map((s) => s.doorType)).toEqual(['double', 'double']);
    const { draft, issues } = migrateOrderDraft(d01Default);
    expect(draft).toBeNull();
    expect(issues.map((i) => [i.code, i.severity, i.paramKey, i.values.partitionNumber])).toEqual([
      ['HINGE_CONFLICT', 'error', 'sections', 1],
    ]);
  });
});

describe('full chain D-0 -> 0.1 -> 0.2', () => {
  it('a D-0 draft becomes a 0.2 draft with the D-0 geometry', () => {
    const { draft, issues } = migrateOrderDraft(d0Default);
    expect(issues).toEqual([]);
    if (!draft) throw new Error('no draft');
    expect(draft.schemaVersion).toBe('dafna-order/0.2-draft');
    expect(draft.migratedFrom).toBe('dafna-order/0-draft');
    expect(draft.panels.map(geometry)).toEqual((d0Default.panels as Panel[]).map(geometry));
    expect(draft.params.doors).toBe('none');
    expect(draft.params.sections).toBe(2); // pinned from the D-0 draft
    expect(draft.params.interior1).toBe('empty');
  });

  it('migrating twice is a no-op (0.2 passes through unchanged)', () => {
    const once = migrateOrderDraft(d0Default).draft;
    expect(once).not.toBeNull();
    expect(migrateOrderDraft(once).draft).toBe(once);
  });

  it('current drafts pass through; unknown schemas are rejected', () => {
    const current = toOrderDraft(defaultParams(T), generate(T, defaultParams(T)));
    expect(migrateOrderDraft(current).draft).toBe(current);
    expect(codes(migrateOrderDraft({ schemaVersion: 'dafna-order/9-draft' }).issues)).toEqual([
      'UNSUPPORTED_SCHEMA',
    ]);
  });
});
