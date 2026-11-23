// @vitest-environment node
import {
  EMPTY_EXTENSION,
  applyCatalogExtension,
  defaultParams,
  wardrobeTemplate as W,
  type CatalogExtension,
} from '@dafna/engine';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CachedCatalog,
  MemoryCatalogStore,
  catalogToRows,
  handleCatalog,
  mergeCatalog,
  rowsToCatalog,
} from './catalog';
import { priceListToRows, rowsToPriceList } from './priceSheet';
import {
  CachedPrices,
  MemoryPriceStore,
  handleManager,
  handleQuote,
  parsePriceList,
} from './prices';
import { RateLimiter } from './rateLimit';

afterEach(() => applyCatalogExtension(EMPTY_EXTENSION));

const board = {
  kind: 'ldsp',
  name: 'Дуб Гладстоун табак',
  code: 'EGGER H3157 ST12',
  thicknessMm: 18,
  colorHex: '#8A6A4A',
  group: 'wood',
  usage: ['corpus', 'door'],
  visible: true,
};
const hinge = { kind: 'hinge', brand: 'Blum', model: 'Clip Top', softClose: true, visible: true };

function merged(saved: CatalogExtension, incoming: unknown): CatalogExtension {
  const r = mergeCatalog(saved, incoming);
  if (!r.ok) throw new Error(`refused: ${r.field}`);
  return r.ext;
}

describe('D-20 catalog: append-only, construction fields locked', () => {
  it('new entries get ids and a brand key; colours are stored lower case', () => {
    const ext = merged(EMPTY_EXTENSION, { materials: [board], hardware: [hinge] });
    expect(ext.materials[0]).toMatchObject({ id: 'x_m1', colorHex: '#8a6a4a', thicknessMm: 18 });
    expect(ext.hardware[0]).toMatchObject({ id: 'x_h1', brandKey: 'x_blum_clip_top' });
  });

  it('a saved entry keeps kind, thickness, usage; name, colour and visibility may change', () => {
    const first = merged(EMPTY_EXTENSION, { materials: [board], hardware: [hinge] });
    const second = merged(first, {
      materials: [
        {
          ...first.materials[0],
          kind: 'mdf',
          thicknessMm: 25,
          usage: ['top'],
          name: 'Yangi nom',
          visible: false,
        },
      ],
      hardware: [{ ...first.hardware[0], kind: 'slide', brand: 'Blum', model: 'Clip Top 2' }],
    });
    expect(second.materials[0]).toMatchObject({
      id: 'x_m1',
      kind: 'ldsp',
      thicknessMm: 18,
      usage: ['corpus', 'door'],
      name: 'Yangi nom',
      visible: false,
    });
    expect(second.hardware[0]).toMatchObject({
      kind: 'hinge',
      brandKey: 'x_blum_clip_top',
      model: 'Clip Top 2',
    });
  });

  it('an entry left out is never deleted', () => {
    const first = merged(EMPTY_EXTENSION, { materials: [board], hardware: [hinge] });
    const second = merged(first, { materials: [], hardware: [] });
    expect(second).toEqual(first);
  });

  it('incomplete entries are refused with their place', () => {
    expect(mergeCatalog(EMPTY_EXTENSION, { materials: [{ ...board, name: '' }] })).toEqual({
      ok: false,
      field: 'materials.0',
    });
    expect(mergeCatalog(EMPTY_EXTENSION, { materials: [{ ...board, thicknessMm: 7 }] })).toEqual({
      ok: false,
      field: 'materials.0',
    });
    expect(mergeCatalog(EMPTY_EXTENSION, { materials: [{ ...board, usage: [] }] })).toEqual({
      ok: false,
      field: 'materials.0',
    });
    expect(mergeCatalog(EMPTY_EXTENSION, { hardware: [{ ...hinge, kind: 'handle' }] })).toEqual({
      ok: false,
      field: 'hardware.0',
    });
  });

  it('the "Katalog" tab rows round-trip', () => {
    const ext = merged(EMPTY_EXTENSION, { materials: [board], hardware: [hinge] });
    expect(rowsToCatalog(catalogToRows(ext))).toEqual(ext);
    expect(rowsToCatalog([])).toEqual(EMPTY_EXTENSION);
  });
});

describe('D-20 the kiosk path: manager saves, catalog and quote use it', () => {
  it('a board added on the manager page is priced by the server with its sheet price', async () => {
    const catalogStore = new MemoryCatalogStore();
    const catalog = new CachedCatalog(catalogStore, 0);
    const store = new MemoryPriceStore();
    const prices = new CachedPrices(store, 0);
    const deps = {
      store,
      prices,
      catalogStore,
      catalog,
      managerPin: '9137',
      limiter: new RateLimiter(100, 60_000),
      now: () => new Date('2026-11-23T09:05:00Z'),
    };
    const put = (body: unknown) =>
      handleManager(
        new Request('http://x/api/manager', {
          method: 'PUT',
          headers: { 'x-manager-pin': '9137' },
          body: JSON.stringify(body),
        }),
        deps,
      );
    expect((await put({ catalog: { materials: [board], hardware: [] } })).status).toBe(200);
    // public catalog for the kiosk: the board, no prices
    const pub = (await (
      await handleCatalog(new Request('http://x/api/catalog'), catalog)
    ).json()) as {
      materials: { id: string }[];
    };
    expect(pub.materials.map((m) => m.id)).toEqual(['x_m1']);
    const list = {
      markupPct: 25,
      laborPerM2: 35000,
      edgePerM: 3500,
      boardSheets: { x_m1: { price: 1159200, lengthMm: 2800, widthMm: 2070 } },
      services: [{ name: 'Yetkazish', basis: 'product', products: ['wardrobe'], price: 150000 }],
      erpCodes: { x_m1: 'LD-0457' },
    };
    expect((await put({ list })).status).toBe(200);
    // a fresh instance: the extension comes from the store, not from memory
    applyCatalogExtension(EMPTY_EXTENSION);
    const quote = await handleQuote(
      new Request('http://x/api/quote', {
        method: 'POST',
        headers: { 'x-manager-pin': '9137' },
        body: JSON.stringify({
          templateId: 'wardrobe',
          templateVersion: W.templateVersion,
          params: { ...defaultParams(W), corpusMaterial: 'x_m1' },
        }),
      }),
      { prices, catalog, staffPin: undefined, managerPin: '9137' },
    );
    expect(quote.status).toBe(200);
    const q = (await quote.json()) as {
      breakdown: {
        lines: { ref: string; unitPrice: number }[];
        services: { cost: number }[];
        missing: string[];
      };
    };
    // 1 159 200 / (2.8 × 2.07) = 200 000 per m²
    expect(q.breakdown.lines.find((l) => l.ref === 'x_m1')?.unitPrice).toBe(200000);
    expect(q.breakdown.services.map((s) => s.cost)).toEqual([150000]);
    expect(q.breakdown.missing).toEqual([]);
    expect(store.saved?.list.erpCodes).toEqual({ x_m1: 'LD-0457' });
  });

  it('services and 1C codes round-trip through the "Narxlar" tab', () => {
    const parsed = parsePriceList(
      {
        markupPct: 25,
        laborPerM2: 1,
        edgePerM: 1,
        services: [
          { name: 'Kesish', basis: 'm2', products: [], price: 9000 },
          { name: 'Kafolat', basis: 'pct', products: ['desk', 'wardrobe'], price: 5 },
        ],
        erpCodes: { ldsp_white_16: ' LD-1 ', hinge_strax: '' },
      },
      'live-x',
    );
    if (!parsed.ok) throw new Error(parsed.field);
    expect(parsed.list.erpCodes).toEqual({ ldsp_white_16: 'LD-1' });
    const back = rowsToPriceList(priceListToRows(parsed.list, 'x'));
    expect(back?.list.services).toEqual(parsed.list.services);
    expect(back?.list.erpCodes).toEqual(parsed.list.erpCodes);
  });

  it('a service of more than 100 % or without a name is refused', () => {
    const base = { markupPct: 25, laborPerM2: 1, edgePerM: 1 };
    expect(
      parsePriceList(
        { ...base, services: [{ name: 'x', basis: 'pct', products: [], price: 150 }] },
        'v',
      ),
    ).toEqual({ ok: false, field: 'services.0' });
    expect(
      parsePriceList(
        { ...base, services: [{ name: ' ', basis: 'm2', products: [], price: 1 }] },
        'v',
      ),
    ).toEqual({ ok: false, field: 'services.0' });
  });
});
