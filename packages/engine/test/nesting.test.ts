import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHEET,
  PRODUCT_TEMPLATES,
  catalogForTemplate,
  computeBom,
  computePrice,
  defaultParams,
  generate,
  nestBoards,
  nestParts,
  priceListDemo,
  sheetCounts,
  type NestPart,
  type PlacedPart,
} from '../src/index.js';

const part = (id: string, l: number, w: number, turn = false): NestPart => ({
  id,
  lengthMm: l,
  widthMm: w,
  turn,
});

/** no two parts overlap (with the kerf between) and every part is inside the trimmed sheet */
function valid(sheet: PlacedPart[], kerf = 4, W = 2800 - 20, H = 2070 - 20) {
  for (const p of sheet) {
    expect(p.x + p.lengthMm).toBeLessThanOrEqual(W);
    expect(p.y + p.widthMm).toBeLessThanOrEqual(H);
  }
  for (let i = 0; i < sheet.length; i++)
    for (let j = i + 1; j < sheet.length; j++) {
      const a = sheet[i]!;
      const b = sheet[j]!;
      const apart =
        a.x + a.lengthMm + kerf <= b.x ||
        b.x + b.lengthMm + kerf <= a.x ||
        a.y + a.widthMm + kerf <= b.y ||
        b.y + b.widthMm + kerf <= a.y;
      expect(apart, `${a.id} / ${b.id}`).toBe(true);
    }
}

describe('D-48 raskroy (sheets per board)', () => {
  it('parts that fill a sheet exactly (with kerf and trim) take one sheet', () => {
    // 2780 usable + 4 kerf = 2784 = 4 x (692 + 4); 2050 + 4 = 2054 = 2 x (1023 + 4)
    const parts = Array.from({ length: 8 }, (_, i) => part(`p${i}`, 692, 1023));
    const r = nestParts(parts);
    expect(r.sheets).toHaveLength(1);
    valid(r.sheets[0]!);
    expect(r.tooLarge).toEqual([]);
    // one more part needs a second sheet
    expect(nestParts([...parts, part('x', 100, 100)]).sheets).toHaveLength(2);
  });

  it('a part larger than the sheet is named, never placed', () => {
    const r = nestParts([part('top', 2900, 800), part('ok', 500, 500)]);
    expect(r.tooLarge).toEqual(['top']);
    expect(r.sheets.flat().map((p) => p.id)).toEqual(['ok']);
  });

  it('grain: a wood part keeps its length along the sheet; a plain one may turn', () => {
    // a wardrobe side (2040 long) lies along the sheet's length
    const tall = part('side', 2040, 600);
    expect(nestParts([tall]).sheets[0]![0]!.turned).toBe(false);
    // a part longer than the sheet width but kept along the length: never turned
    const r = nestParts([part('a', 1200, 300), part('b', 1200, 300)]);
    expect(r.sheets.flat().every((p) => !p.turned)).toBe(true);
    // 3 parts 1500 x 1000 do not fit lengthwise on one sheet (1 per length) but turned do
    const fixed = nestParts([part('a', 1500, 1000), part('b', 1500, 1000), part('c', 1500, 1000)]);
    const free = nestParts([
      part('a', 1000, 1500, true),
      part('b', 1000, 1500, true),
      part('c', 1000, 1500, true),
    ]);
    expect(fixed.sheets.length).toBeGreaterThanOrEqual(free.sheets.length);
    for (const s of free.sheets) valid(s);
  });

  it('every product: all its boards placed without overlap; at least the area in sheets', () => {
    for (const t of Object.values(PRODUCT_TEMPLATES)) {
      const p = defaultParams(t);
      const result = generate(t, p);
      for (const b of nestBoards(result, () => DEFAULT_SHEET, catalogForTemplate(t))) {
        expect(b.nest.tooLarge, `${t.templateId} ${b.material}`).toEqual([]);
        for (const s of b.nest.sheets) valid(s);
        const placed = b.nest.sheets.flat().length;
        const wanted = result.panels.filter(
          (x) => x.material === b.material && x.role !== 'frame',
        ).length;
        expect(placed).toBe(wanted);
        expect(b.nest.sheetsAreaM2).toBeGreaterThanOrEqual(b.nest.partsAreaM2);
        expect(b.nest.utilization).toBeGreaterThan(0);
        expect(b.nest.utilization).toBeLessThanOrEqual(1);
      }
    }
  });

  it('billing by the sheet: whole sheets x the sheet price; by area unchanged', () => {
    const t = PRODUCT_TEMPLATES.wardrobe!;
    const p = defaultParams(t);
    const result = generate(t, p);
    const bom = computeBom(t, p, result);
    const sheets = sheetCounts(result, priceListDemo, catalogForTemplate(t));
    const area = computePrice(bom, catalogForTemplate(t), priceListDemo, 'wardrobe', sheets);
    // the default list still bills by area (nothing changes until the manager switches)
    expect(area.lines.every((l) => l.sheets === undefined)).toBe(true);
    const list = {
      ...priceListDemo,
      boardBilling: 'sheets' as const,
      boardSheets: { ldsp_white_16: { price: 600_000, lengthMm: 2800, widthMm: 2070 } },
    };
    const bySheet = computePrice(bom, catalogForTemplate(t), list, 'wardrobe', sheets);
    const white = bySheet.lines.find((l) => l.ref === 'ldsp_white_16')!;
    expect(white.sheets).toBe(sheets.ldsp_white_16);
    expect(white.unitPrice).toBe(600_000);
    expect(white.cost).toBe(600_000 * sheets.ldsp_white_16!);
    // a board without a sheet price: its m² price x the sheet area
    const hdf = bySheet.lines.find((l) => l.kind === 'board' && l.ref.startsWith('hdf'));
    if (hdf) expect(hdf.unitPrice).toBe(Math.round(30_000 * 2.8 * 2.07));
  });
});
