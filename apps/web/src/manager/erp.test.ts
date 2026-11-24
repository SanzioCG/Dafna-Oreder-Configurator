import { priceListDemo } from '@dafna/engine';
import { describe, expect, it } from 'vitest';
import { applyErpPrices, type ErpPrice } from './erp';
import { EDGE_BAND_KEY } from './model';

const p = (price: number | null, currency: string | null, unit = 'шт'): ErpPrice => ({
  name: 'x',
  unit,
  price,
  currency,
  stock: 1,
});

/** D-30: the 1C prices of the linked items into the price list */
describe('D-30 applyErpPrices', () => {
  it('hardware per unit, the edge band per metre, boards per sheet (per m² -> the sheet)', () => {
    const list = {
      ...priceListDemo,
      usdRate: 12900,
      boardSheets: { egger_w980_st2_16: { price: 0, lengthMm: 2800, widthMm: 2070 } },
      erpCodes: {
        hinge_samet_master_18: 'H18',
        [EDGE_BAND_KEY]: 'EB',
        egger_w980_st2_16: 'B1',
        ldsp_white_16: 'B2',
        slide_samet_smart: 'S1',
        plate_samet_5: 'P5',
        rail_holder: 'NOPE',
        castor_standard: 'C0',
      },
    };
    const r = applyErpPrices(list, {
      H18: p(11598.9, 'UZS'),
      EB: p(2500, 'сум', 'м'),
      B1: p(500000, 'UZS'),
      B2: p(70000, 'UZS', 'м2'),
      S1: p(10, 'USD'),
      P5: p(1, 'EUR'),
      C0: p(null, 'UZS'),
    });
    expect(r.list.hardware.hinge_samet_master_18).toBe(11599);
    expect(r.list.edgePerM).toBe(2500);
    expect(r.list.boardSheets?.egger_w980_st2_16).toEqual({
      price: 500000,
      lengthMm: 2800,
      widthMm: 2070,
    });
    // per m² on a 2750 × 1830 chipboard sheet
    expect(r.list.boardSheets?.ldsp_white_16?.price).toBe(Math.round((70000 * 2750 * 1830) / 1e6));
    expect(r.list.hardware.slide_samet_smart).toBe(129000); // USD x usdRate
    expect(r.notFound).toEqual(['rail_holder']);
    expect(r.noPrice).toEqual(['castor_standard']);
    expect(r.currency).toEqual(['plate_samet_5']);
    expect(r.updated).toHaveLength(5);
    // the input list is not changed
    expect(list.hardware.hinge_samet_master_18).toBe(priceListDemo.hardware.hinge_samet_master_18);
  });
});
