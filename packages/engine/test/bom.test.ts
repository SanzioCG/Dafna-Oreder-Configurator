import { describe, expect, it } from 'vitest';
import {
  PRODUCT_ARCHIVE,
  catalogForTemplate,
  computeBom,
  computePrice,
  defaultParams,
  deskTemplate,
  generate,
  hingeCount,
  pedestalTemplate,
  priceListDemo,
  wardrobeTemplate,
  type Params,
  type Template,
} from '../src/index.js';

/** D-22: table-top boards (22 / 25 mm) were offered up to desk template 0.2.0 */
const DESK_V2 = PRODUCT_ARCHIVE.desk!['0.2.0']!;
const bomOf = (t: Template, p: Params) => computeBom(t, p, generate(t, p));
const hw = (bom: ReturnType<typeof bomOf>, id: string) =>
  bom.find((l) => l.kind === 'hardware' && l.ref === id)?.qty ?? 0;

describe('D-9 BOM', () => {
  it('hinges per leaf by height (<=900: 2, <=1600: 3, <=2000: 4, <=2600: 5)', () => {
    expect([600, 900, 901, 1600, 2000, 2001, 2400].map((h) => hingeCount(h))).toEqual([
      2, 2, 3, 3, 4, 5, 5,
    ]);
  });

  it('wardrobe: boards in m², edge metres, hinges per leaf, rail + holders; brand from params', () => {
    const p = { ...defaultParams(wardrobeTemplate), interior1: 'short_hang_drawers' };
    const r = generate(wardrobeTemplate, p);
    const bom = computeBom(wardrobeTemplate, p, r);
    const leaves = r.panels.filter((x) => x.role === 'door');
    const hinges = leaves.reduce((n, d) => n + hingeCount(d.widthMm), 0);
    expect(hw(bom, 'hinge_strax')).toBe(hinges);
    expect(hinges).toBeGreaterThanOrEqual(2 * leaves.length);
    expect(hw(bom, 'slide_strax_ball')).toBe(2); // 2 drawers in section 1
    expect(hw(bom, 'rail_holder')).toBe(2 * r.rails.length);
    expect(hw(bom, 'rail_oval_25')).toBeCloseTo(r.rails.reduce((m, x) => m + x.lengthMm, 0) / 1000);
    const corpus = bom.find((l) => l.kind === 'board' && l.ref === 'ldsp_white_16')!;
    expect(corpus.qty).toBeGreaterThan(5);
    expect(bom.find((l) => l.kind === 'edge')?.qty).toBeGreaterThan(10);
    const hettich = bomOf(wardrobeTemplate, { ...p, hingeBrand: 'hettich', slideBrand: 'hettich' });
    expect(hw(hettich, 'hinge_hettich_sensys')).toBe(hinges);
    expect(hw(hettich, 'slide_hettich_quadro')).toBe(2);
    expect(hw(hettich, 'hinge_strax')).toBe(0);
  });

  it('pedestal: a pair of slides per drawer, 4 castors (metal, not board)', () => {
    const bom = bomOf(pedestalTemplate, defaultParams(pedestalTemplate));
    expect(hw(bom, 'slide_strax_ball')).toBe(3);
    expect(hw(bom, 'castor_standard')).toBe(4);
    expect(bom.some((l) => l.kind === 'board' && l.ref.startsWith('metal'))).toBe(false);
    const door = bomOf(pedestalTemplate, {
      ...defaultParams(pedestalTemplate),
      layout: 'door_shelf',
    });
    expect(hw(door, 'hinge_strax')).toBe(2);
    expect(hw(door, 'slide_strax_ball')).toBe(0);
  });

  it('desk: the lift frame is one purchased item; the LDSP desk has none', () => {
    const lift = bomOf(deskTemplate, { ...defaultParams(deskTemplate), legs: 'metal_lift' });
    expect(hw(lift, 'lift_frame_2leg')).toBe(1);
    // D-22: the work top and its frame strips are the same 16 mm board
    expect(lift.filter((l) => l.kind === 'board').map((l) => l.ref)).toEqual(['ldsp_white_16']);
    const ldsp = bomOf(deskTemplate, defaultParams(deskTemplate));
    expect(hw(ldsp, 'lift_frame_2leg')).toBe(0);
  });
});

describe('D-9 price (DEMO price list)', () => {
  const price = (t: Template, p: Params) =>
    computePrice(computeBom(t, p, generate(t, p)), catalogForTemplate(t));

  it('sums boards (with waste), edges, hardware, labour, markup; rounds; flags demo', () => {
    const r = price(wardrobeTemplate, defaultParams(wardrobeTemplate));
    expect(r.demo).toBe(true);
    expect(r.currency).toBe('UZS');
    expect(r.missing).toEqual([]);
    expect(r.subtotal).toBe(r.boards + r.edges + r.hardware + r.labor + r.assembly);
    expect(r.assembly).toBe(0); // no product type given: no assembly line
    expect(r.markup).toBe(Math.round((r.subtotal * priceListDemo.markupPct) / 100));
    expect(r.total % priceListDemo.roundTo).toBe(0);
    expect(Math.abs(r.total - (r.subtotal + r.markup))).toBeLessThanOrEqual(
      priceListDemo.roundTo / 2,
    );
    const board = r.lines.find((l) => l.ref === 'ldsp_white_16')!;
    expect(board.cost).toBe(Math.round(board.qty * priceListDemo.wasteFactor * board.unitPrice));
  });

  it('Hettich costs more than Strax; a wider wardrobe costs more', () => {
    const base = defaultParams(wardrobeTemplate);
    const strax = price(wardrobeTemplate, base).total;
    expect(price(wardrobeTemplate, { ...base, hingeBrand: 'hettich' }).total).toBeGreaterThan(
      strax,
    );
    expect(price(wardrobeTemplate, { ...base, width: 2400 }).total).toBeGreaterThan(strax);
  });

  it('every product prices without missing items; table tops use the thickness price', () => {
    for (const [t, p] of [
      [pedestalTemplate, { ...defaultParams(pedestalTemplate), layout: 'door_shelf', width: 450 }],
      [
        DESK_V2,
        { ...defaultParams(DESK_V2), legs: 'metal_lift', topMaterial: 'egger_h3700_st10_25' },
      ],
    ] as const) {
      const r = price(t, p);
      expect(r.missing, t.templateId).toEqual([]);
      expect(r.total, t.templateId).toBeGreaterThan(0);
    }
    // table-top boards: desk template 0.2.0 (0.3.0 doubles a 16 / 18 mm board instead)
    const desk = price(DESK_V2, {
      ...defaultParams(DESK_V2),
      topMaterial: 'egger_h3700_st10_25',
    });
    expect(desk.lines.find((l) => l.ref === 'egger_h3700_st10_25')?.unitPrice).toBe(
      priceListDemo.boardPerM2ByThickness['25'],
    );
  });
});

describe('D-19 live price list: sheet prices, assembly, profit %', () => {
  const list = {
    ...priceListDemo,
    priceListVersion: 'live-test',
    demo: false,
    boardSheets: { ldsp_white_16: { price: 579600, lengthMm: 2800, widthMm: 2070 } },
    assembly: { wardrobe: 300000 },
    markupPct: 25,
  };
  const run = (l: typeof list, productType?: string) => {
    const t = wardrobeTemplate;
    const p = defaultParams(t);
    return computePrice(computeBom(t, p, generate(t, p)), catalogForTemplate(t), l, productType);
  };

  it('a sheet price becomes a per-m² price (sheet area), and wins over the per-m² list', () => {
    const r = run(list, 'wardrobe');
    // 579 600 / (2.8 × 2.07 m²) = 100 000 per m²
    expect(r.lines.find((l) => l.ref === 'ldsp_white_16')?.unitPrice).toBe(100000);
    expect(r.demo).toBe(false);
  });

  it('assembly is added per product; profit is the % of every cost together', () => {
    const r = run(list, 'wardrobe');
    expect(r.assembly).toBe(300000);
    expect(r.subtotal).toBe(r.boards + r.edges + r.hardware + r.labor + 300000);
    expect(r.markup).toBe(Math.round(r.subtotal * 0.25));
    expect(run(list, 'desk').assembly).toBe(0);
    expect(run({ ...list, markupPct: 30 }, 'wardrobe').total).toBeGreaterThan(r.total);
  });

  it('an empty sheet price (0) falls back to the per-m² list', () => {
    const r = run({
      ...list,
      boardSheets: { ldsp_white_16: { price: 0, lengthMm: 2800, widthMm: 2070 } },
    });
    expect(r.lines.find((l) => l.ref === 'ldsp_white_16')?.unitPrice).toBe(
      priceListDemo.boardPerM2.ldsp,
    );
  });
});
