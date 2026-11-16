import { describe, expect, it } from 'vitest';
import {
  computeBom,
  defaultParams,
  doorWeightKg,
  generate,
  hingeCount,
  hingesForDoor,
  migrateOrderDraft,
  regenerateApplication,
  resolveParams,
  wardrobeTemplate,
  type GenerateResult,
  type Panel,
  type Params,
} from '../src/index.js';

/** axis-aligned box of a wardrobe board (rotations used by the wardrobe generator) */
function panelBoxOf(p: Panel) {
  const r = p.rotation.join(',');
  const ext =
    r === '0,0,90'
      ? [p.thicknessMm, p.lengthMm, p.widthMm]
      : r === '90,0,0'
        ? [p.lengthMm, p.widthMm, p.thicknessMm]
        : [p.lengthMm, p.thicknessMm, p.widthMm];
  return {
    min: p.position.map((c, k) => c - ext[k]! / 2),
    max: p.position.map((c, k) => c + ext[k]! / 2),
  };
}

/**
 * D-15 (template 0.10.0): from 1600 mm a wardrobe is two carcasses side by side, split at the
 * middle boundary; hinges per leaf by height AND weight.
 */
const T = wardrobeTemplate;
const gen = (over: Params = {}): GenerateResult =>
  generate(T, resolveParams(T, { ...defaultParams(T), ...over }).params);
const ids = (r: GenerateResult, role: string) =>
  r.panels.filter((p) => p.role === role).map((p) => p.id);

describe('D-15 two carcasses from 1600 mm', () => {
  it('below 1600 one carcass, from 1600 two (customer widths)', () => {
    for (const width of [800, 1000, 1200, 1500])
      expect(ids(gen({ width }), 'side')).toHaveLength(2);
    for (const width of [1600, 1800, 2000, 2400]) {
      const r = gen({ width });
      expect(ids(r, 'side'), String(width)).toHaveLength(4);
      expect(ids(r, 'top')).toEqual(['top-1', 'top-2']);
      expect(ids(r, 'bottom')).toEqual(['bottom-1', 'bottom-2']);
      expect(ids(r, 'back')).toEqual(['back-1', 'back-2']);
      expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    }
  });

  it('split at the middle boundary: 2 -> 1+1, 3 -> 2+1, 4 -> 2+2; no partition there', () => {
    for (const [sections, leftCount] of [
      [2, 1],
      [3, 2],
      [4, 2],
    ] as const) {
      const r = gen({ width: 2400, sections });
      const split = r.panels.find((p) => p.id === 'side-split-left')!;
      const xSplit = split.position[0] + split.thicknessMm / 2;
      const left = r.sections.filter((s) => s.xStartMm + s.innerWidthMm <= xSplit);
      expect(left).toHaveLength(leftCount);
      expect(ids(r, 'partition')).toHaveLength(sections - 2);
    }
  });

  it('boards never overlap; the product keeps its width; staff can force one carcass', () => {
    const r = gen({ width: 1800, sections: 3 });
    const boxes = r.panels
      .filter((p) => p.role !== 'door')
      .map((p) => [p.id, panelBoxOf(p)] as const);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, A] = boxes[i]!;
        const [b, B] = boxes[j]!;
        const overlap = [0, 1, 2].every(
          (k) => A.min[k]! < B.max[k]! - 0.01 && B.min[k]! < A.max[k]! - 0.01,
        );
        expect(overlap, `${a} x ${b}`).toBe(false);
      }
    expect(r.dimensions?.widthMm).toBe(1800);
    expect(ids(gen({ width: 2400, carcasses: '1' }), 'side')).toHaveLength(2);
    expect(ids(gen({ width: 1200, carcasses: '2' }), 'side')).toHaveLength(4);
    // one section cannot be split
    expect(ids(gen({ width: 2400, sections: 1, carcasses: '2' }), 'side')).toHaveLength(2);
  });

  it('doors next to the split hinge on a carcass side (full overlay); leaves cover the front', () => {
    const r = gen({
      width: 1600,
      sections: 3,
      doorSection1: 'single_left',
      doorSection2: 'single_right',
      doorSection3: 'single_left',
    });
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const doors = r.panels.filter((p) => p.role === 'door');
    // section 2 hinges right on the left carcass side, section 3 left on the right carcass side
    expect(doors.map((d) => d.hingeMount)).toEqual([
      'full_overlay',
      'full_overlay',
      'full_overlay',
    ]);
    const covered = doors.reduce((w, d) => w + d.lengthMm, 0);
    expect(covered).toBeGreaterThan(1600 - 10);
  });

  it('an application made before 0.10.0 stays one carcass when migrated', () => {
    const p = { ...defaultParams(T), width: 2000 };
    delete (p as Record<string, unknown>).carcasses;
    delete (p as Record<string, unknown>).lowerDoorHeight;
    const old = regenerateApplication(p, '0.9.0');
    if (!old.ok) throw new Error(old.code);
    const { draft } = migrateOrderDraft({ ...old.draft, schemaVersion: old.draft.schemaVersion });
    expect(draft?.templateVersion).toBe(wardrobeTemplate.templateVersion);
    expect(draft?.params.carcasses).toBe('1');
    expect(draft?.panels.filter((x) => x.role === 'side')).toHaveLength(2);
  });
});

describe('D-15 hinges by height and weight', () => {
  const door = (
    lengthMm: number,
    widthMm: number,
    thicknessMm = 16,
    material = 'ldsp_white_16',
  ): Panel =>
    ({
      id: 'd',
      role: 'door',
      lengthMm,
      widthMm,
      thicknessMm,
      material,
      position: [0, 0, 0],
      rotation: [90, 0, 0],
      edges: {} as Panel['edges'],
      grainDirection: null,
      operations: [],
    }) as Panel;

  it('a tall narrow leaf: the height rule decides', () => {
    const d = door(372, 1997);
    expect(doorWeightKg(d)).toBeLessThan(12);
    expect(hingesForDoor(d)).toBe(hingeCount(1997));
  });

  it('a heavy leaf gets more hinges than its height alone needs', () => {
    const d = door(590, 1500, 18); // ~10.8 kg chipboard, 1500 mm -> 3 by height, 3 by weight
    expect(hingesForDoor(d)).toBe(3);
    const heavy = door(590, 880, 40); // thick: ~14 kg, short -> 2 by height, 4 by weight
    expect(hingeCount(880)).toBe(2);
    expect(hingesForDoor(heavy)).toBe(4);
  });

  it('a leaf wider than 600 mm gets one more (Blum)', () => {
    expect(hingesForDoor(door(640, 700))).toBe(hingesForDoor(door(590, 700)) + 1);
  });

  it('the bill of materials counts the same hinges', () => {
    const p = resolveParams(T, defaultParams(T)).params;
    const r = generate(T, p);
    const n = r.panels.filter((x) => x.role === 'door').reduce((k, d) => k + hingesForDoor(d), 0);
    expect(computeBom(T, p, r).find((l) => l.ref === 'hinge_strax')?.qty).toBe(n);
  });
});
