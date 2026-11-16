import { describe, expect, it } from 'vitest';
import {
  BOOK_GAP_GOST_MIN_MM,
  bookShelfBottoms,
  computeBom,
  defaultParams,
  generate,
  hingeCount,
  resolveParams,
  wardrobeTemplate,
  type Params,
} from '../src/index.js';

/**
 * D-14 'books_lower' (template 0.9.0): door over the lower part only, open book / A4 folder
 * shelves above. GOST 13025.1-85 table 2 (books): clear gap between shelves 180..390 mm.
 */
const T = wardrobeTemplate;
const books = (over: Params = {}) =>
  resolveParams(T, { ...defaultParams(T), interior1: 'books_lower', ...over }).params;

describe('D-14 books_lower: lower doors, book and document shelves above', () => {
  it('every customer size: the leaves stop at the chosen height; a fixed shelf at their top', () => {
    for (const height of [2000, 2100, 2200])
      for (const depth of [450, 600])
        for (const lower of [600, 800, 1000]) {
          const p = books({ height, depth, lowerDoorHeight: lower });
          const r = generate(T, p);
          expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
          const s = r.sections[0]!;
          expect(s.preset).toBe('books_lower');
          const leaves = r.panels.filter((x) => x.role === 'door' && x.sectionIndex === 0);
          expect(leaves.length).toBeGreaterThan(0);
          for (const d of leaves) {
            expect(d.widthMm).toBe(lower); // leaf height
            // leaf bottom edge where a full door starts
            expect(d.position[1] - d.widthMm / 2).toBeCloseTo(100 + 1.5);
          }
          const doorTop = leaves[0]!.position[1] + lower / 2;
          const fixed = s.shelves.find((x) => x.kind === 'fixed')!;
          expect(fixed.yMm + 16).toBeCloseTo(doorTop + 1.5, 0); // top face one gap above
          // open shelves above the door: GOST 13025.1-85 table 2 gaps, A4 folders upright
          const above = s.shelves.filter((x) => x.yMm > fixed.yMm).map((x) => x.yMm);
          const bounds = [fixed.yMm, ...above, height - 16 /* underside of the top board */];
          for (let i = 0; i + 1 < bounds.length; i++) {
            const gap = bounds[i + 1]! - bounds[i]! - 16;
            expect(gap).toBeGreaterThanOrEqual(BOOK_GAP_GOST_MIN_MM);
            expect(gap).toBeLessThanOrEqual(390);
          }
          // the other section keeps its full-height doors
          const other = r.panels.find((x) => x.role === 'door' && x.sectionIndex === 1)!;
          expect(other.widthMm).toBeGreaterThan(lower);
        }
  });

  it('shorter leaves need fewer hinges (the bill of materials follows)', () => {
    const p = books({ lowerDoorHeight: 800 });
    const r = generate(T, p);
    const hinges = computeBom(T, p, r).find((l) => l.ref === 'hinge_strax')!.qty;
    const expected = r.panels
      .filter((x) => x.role === 'door')
      .reduce((n, d) => n + hingeCount(d.widthMm), 0);
    expect(hinges).toBe(expected);
    const full = generate(T, resolveParams(T, defaultParams(T)).params);
    const fullHinges = computeBom(T, defaultParams(T), full).find(
      (l) => l.ref === 'hinge_strax',
    )!.qty;
    expect(hinges).toBeLessThan(fullHinges);
  });

  it('book shelf spacing: >= 330 mm where it fits, never above the GOST 390 mm', () => {
    const t = 16;
    for (const span of [400, 700, 1000, 1268, 1500, 1800]) {
      const ys = bookShelfBottoms(0, span, t, 330, 390);
      const edges = [-t, ...ys, span];
      const gaps = edges.slice(1).map((y, i) => y - edges[i]! - t);
      for (const g of gaps) {
        expect(g).toBeLessThanOrEqual(390);
        expect(g).toBeGreaterThanOrEqual(BOOK_GAP_GOST_MIN_MM);
      }
    }
  });

  it('customers choose 60 / 80 / 100 cm; older templates have no such option', () => {
    const def = T.parameters.find((x) => x.key === 'lowerDoorHeight')!;
    expect(def.customerValues).toEqual([600, 800, 1000]);
    expect(T.parameters.find((x) => x.key === 'interior1')!.options).toContain('books_lower');
  });
});
