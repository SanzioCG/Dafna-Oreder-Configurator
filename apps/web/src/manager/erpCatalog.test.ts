import { priceListDemo } from '@dafna/engine';
import { describe, expect, it } from 'vitest';
import { cleanName, guessFromName, quickDraft, somPrice } from './ErpCatalogSection';

/** D-31: a 1C item read into a kiosk material / hardware brand */
describe('D-31 guessFromName / cleanName / somPrice', () => {
  it('a 1C board: kind, thickness, brand, decor group and sheet size from its name', () => {
    expect(guessFromName('ЛДСП Эггер 5,796 Дуб Барония светлый 16мм ST12')).toEqual({
      kind: 'ldsp',
      thicknessMm: 16,
      brand: 'Egger',
      softClose: false,
      group: 'wood',
      sheet: { lengthMm: 2800, widthMm: 2070 },
    });
    const k = guessFromName('ЛДСП Кроностар 5,0325 Белый (фасад) 16мм K101SM');
    expect([k.brand, k.group, k.sheet]).toEqual([
      'Kronostar',
      'plain',
      { lengthMm: 2750, widthMm: 1830 },
    ]);
    expect(guessFromName('ЛМДФ Белый Гладкий 5,0325 18мм').kind).toBe('mdf');
    expect(cleanName('ЛДСП Эггер 5,796  Дуб Барония светлый 16мм ST12')).toBe(
      'Эггер Дуб Барония светлый 16мм ST12',
    );
    // D-37: the same decor as LDSP and LMDF in 1C - the MDF one keeps its type in the name
    expect(cleanName('ЛМДФ Ультрадекор 5,796 Железный камень 16мм')).toBe(
      'ЛМДФ Ультрадекор Железный камень 16мм',
    );
  });

  it('a 1C hinge / slide: kind and soft close', () => {
    const h = guessFromName(
      'Петля Master со встроенным доводчиком 18ММ 48 мм/MASTER SOFT CLOSE HINGE 18MM 48AX NI',
    );
    expect([h.kind, h.softClose, h.brand]).toEqual(['hinge', true, 'Samet']);
    expect(guessFromName('Направляющие SO CLASS/ZINC COATED SOFT CLOSE 46-400').kind).toBe('slide');
  });

  it("so'm: UZS as it is, USD by the list rate, per m² turned into the sheet", () => {
    const list = { ...priceListDemo, usdRate: 12900 };
    expect(somPrice({ price: 756400, currency: 'UZS', unit: 'шт' }, list)).toBe(756400);
    expect(somPrice({ price: 2, currency: 'USD', unit: 'шт' }, list)).toBe(25800);
    expect(
      somPrice({ price: 100000, currency: 'UZS', unit: 'м2' }, list, {
        lengthMm: 2800,
        widthMm: 2070,
      }),
    ).toBe(579600);
    expect(somPrice({ price: 5, currency: 'EUR', unit: 'шт' }, list)).toBeUndefined();
    expect(somPrice({ price: null, currency: 'UZS', unit: 'шт' }, list)).toBeUndefined();
  });
});

describe('D-33 a mechanism from 1C', () => {
  it('the kiosk model line: before "/", without the brand word', async () => {
    const { modelOf } = await import('./HardwareFromErp');
    expect(modelOf('Hettich Sensys 8645i, 110° вкладная, доводчик, D3', 'Hettich')).toBe(
      'Sensys 8645i, 110° вкладная, доводчик, D3',
    );
    expect(modelOf('Петля Master 18ММ 48 мм/MASTER SOFT CLOSE HINGE 18MM 48AX NI', 'Samet')).toBe(
      'Петля Master 18ММ 48 мм',
    );
  });
});

describe("D-42 one-click take from 1C (the switch, Saytda ko'rsatish)", () => {
  const row = (name: string, article = 'A1', price: number | null = 685000) => ({
    key: article,
    name,
    article,
    unit: 'шт',
    price,
    currency: 'сум',
    stock: 3,
  });

  it('a board from the materials folder: name, sheet, price per sheet, all usages', () => {
    const d = quickDraft(
      row('ЛДСП Эггер 5,796 Дуб Барония светлый 16мм ST12'),
      'material',
      priceListDemo,
      'https://x/p.webp',
    );
    expect(d?.type).toBe('material');
    if (d?.type !== 'material') return;
    expect(d.item).toMatchObject({
      kind: 'ldsp',
      name: 'Эггер Дуб Барония светлый 16мм ST12',
      thicknessMm: 16,
      group: 'wood',
      grain: true,
      usage: ['corpus', 'door', 'top'],
      erpArticle: 'A1',
      erpPrice: 685000,
      erpSheet: { lengthMm: 2800, widthMm: 2070 },
      erpPicture: 'https://x/p.webp',
    });
  });

  it('a hinge / slide by its name; unknown things and boards outside materials need the form', () => {
    const h = quickDraft(row('Петля Samet Sensomatic с доводчиком'), 'hardware', priceListDemo);
    expect(h?.type).toBe('hardware');
    if (h?.type === 'hardware') expect([h.item.kind, h.item.softClose]).toEqual(['hinge', true]);
    // a name with no kind in it would otherwise become a "board"
    expect(quickDraft(row('Стяжка Бочонок 90мм'), 'hardware', priceListDemo)).toBeNull();
    expect(quickDraft(row('Кромка ПВХ 19/1'), 'other', priceListDemo)).toBeNull();
    expect(quickDraft(row('ЛДСП Кроноспан 16мм', ''), 'material', priceListDemo)).toBeNull();
  });
});
