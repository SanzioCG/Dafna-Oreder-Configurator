import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_ARCHIVE,
  defaultParams,
  generate,
  migrateOrderDraft,
  regenerateApplication,
  resolveParams,
  wardrobeTemplate as T,
  type GenerateResult,
  type Panel,
  type Params,
} from '../src/index.js';

/**
 * D-27 (template 0.14.0): inset doors close neighbouring doored sections as one opening, as in
 * Dafna's Bazis models (two leaves meet with 3 mm between them, no partition shows). The
 * partition stands behind the doors (door 16 mm + 1 mm shorter at the front).
 */
const gen = (over: Params = {}): GenerateResult =>
  generate(T, resolveParams(T, { ...defaultParams(T), ...over }).params);
const doors = (r: GenerateResult) =>
  r.panels.filter((p) => p.role === 'door').sort((a, b) => a.position[0] - b.position[0]);
const edges = (p: { position: number[]; lengthMm: number }) => [
  p.position[0]! - p.lengthMm / 2,
  p.position[0]! + p.lengthMm / 2,
];

describe('D-27 inset doors span the partitions (template 0.14.0)', () => {
  it('two sections, two leaves: 3 mm at the sides and between, the partition behind them', () => {
    const r = gen({ width: 1000, height: 2100, depth: 600, sections: 2, doors: 'all_single' });
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const [a, b] = doors(r);
    // D-51 (0.16.0): the sides stand 2 mm in from the ends and 2 mm short at the front
    expect(edges(a!)[0]).toBe(2 + 16 + 3);
    expect(edges(b!)[1]).toBe(1000 - 2 - 16 - 3);
    expect(edges(b!)[0]! - edges(a!)[1]!).toBe(3);
    expect(a!.lengthMm + b!.lengthMm).toBe(1000 - 4 - 32 - 9);
    const partition = r.panels.find((p) => p.id === 'partition-1')!;
    // 600 deep, back in a groove (12 + 3), the sides' 2 mm, 16 mm door + 1 mm in front
    expect(partition.widthMm).toBe(600 - 15 - 2 - 17);
    const front = partition.position[2] + partition.widthMm / 2;
    expect(front).toBe(600 - 2 - 17);
    expect(a!.hingeMount).toBe('inset');
    expect(b!.hingeMount).toBe('inset');
  });

  it('a leaf hinging on a hidden partition is half overlay on it', () => {
    const r = gen({ width: 1500, sections: 3, doors: 'all_single' });
    const mounts = doors(r).map((d) => [d.hingeSide, d.hingeMount]);
    // hinge sides L, L, R: the middle leaf hinges on partition 1
    expect(mounts).toEqual([
      ['left', 'inset'],
      ['left', 'half_overlay'],
      ['right', 'inset'],
    ]);
  });

  it('next to an open section the partition stays full depth and frames the opening', () => {
    const r = gen({
      width: 1500,
      depth: 600,
      sections: 3,
      doors: 'all_single',
      doorSection3: 'none',
    });
    const p1 = r.panels.find((p) => p.id === 'partition-1')!;
    const p2 = r.panels.find((p) => p.id === 'partition-2')!;
    expect(p1.widthMm).toBe(600 - 15 - 2 - 17);
    expect(p2.widthMm).toBe(600 - 15 - 2);
    const right = doors(r).at(-1)!;
    expect(edges(right)[1]).toBe(p2.position[0] - 8 - 3);
  });

  it('no part overlaps another', () => {
    const r = gen({ width: 2000, sections: 'auto' });
    const box = (p: Panel) => {
      const r0 = p.rotation.join(',');
      const e =
        r0 === '0,0,90'
          ? [p.thicknessMm, p.lengthMm, p.widthMm]
          : r0 === '90,0,0'
            ? [p.lengthMm, p.widthMm, p.thicknessMm]
            : [p.lengthMm, p.thicknessMm, p.widthMm];
      return {
        min: p.position.map((c, k) => c - e[k]! / 2),
        max: p.position.map((c, k) => c + e[k]! / 2),
      };
    };
    // the back in its groove is a planned overlap; feet are bought parts
    const solids = r.panels.filter((p) => p.role !== 'back' && p.role !== 'frame');
    for (let i = 0; i < solids.length; i++)
      for (let j = i + 1; j < solids.length; j++) {
        const A = box(solids[i]!);
        const B = box(solids[j]!);
        const hit = [0, 1, 2].every(
          (k) => A.min[k]! < B.max[k]! - 0.01 && B.min[k]! < A.max[k]! - 0.01,
        );
        expect(hit, `${solids[i]!.id} x ${solids[j]!.id}`).toBe(false);
      }
  });

  it('0.13.0 keeps the doors inside each section; its drafts migrate with a report', () => {
    const v13 = TEMPLATE_ARCHIVE['0.13.0']!;
    const params = { ...defaultParams(v13), width: 1000, sections: 2, doors: 'all_single' };
    const old = generate(v13, resolveParams(v13, params).params);
    expect(old.panels.find((p) => p.id === 'partition-1')!.widthMm).toBe(600 - 15);
    const r = regenerateApplication(params, '0.13.0');
    if (!r.ok) throw new Error(r.code);
    const { draft, issues } = migrateOrderDraft(r.draft);
    expect(draft?.templateVersion).toBe(T.templateVersion);
    expect(issues.map((i) => i.code)).toContain('MIGRATION_CONSTRUCTION_CHANGED');
  });
});
