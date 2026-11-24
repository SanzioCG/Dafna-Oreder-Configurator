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
        // D-32: the manager's group of a 1C kind
        erpKindGroups: { 'b7e7d14a-0000-0000-0000-000000000000': 'other' },
      },
      'live-x',
    );
    if (!parsed.ok) throw new Error(parsed.field);
    expect(parsed.list.erpCodes).toEqual({ ldsp_white_16: 'LD-1' });
    const back = rowsToPriceList(priceListToRows(parsed.list, 'x'));
    expect(back?.list.services).toEqual(parsed.list.services);
    expect(back?.list.erpCodes).toEqual(parsed.list.erpCodes);
    expect(back?.list.erpKindGroups).toEqual({ 'b7e7d14a-0000-0000-0000-000000000000': 'other' });
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

describe('D-31 an entry taken from 1C', () => {
  it('its 1C article and price come back as a link to the new id (not kept in the catalog)', () => {
    const r = mergeCatalog(EMPTY_EXTENSION, {
      materials: [
        {
          ...board,
          erpArticle: 'H1362 ST12',
          erpPrice: 756400,
          erpSheet: { lengthMm: 2800, widthMm: 2070 },
        },
      ],
      hardware: [{ ...hinge, erpArticle: '10100432Y', erpPrice: 11599 }],
    });
    if (!r.ok) throw new Error(r.field);
    const m = r.ext.materials[0]!;
    expect(r.links).toEqual([
      {
        id: m.id,
        kind: 'material',
        article: 'H1362 ST12',
        price: 756400,
        sheet: { lengthMm: 2800, widthMm: 2070 },
      },
      { id: r.ext.hardware[0]!.id, kind: 'hardware', article: '10100432Y', price: 11599 },
    ]);
    expect(JSON.stringify(r.ext)).not.toContain('erpArticle');
  });
});

describe('D-33 the customer text and photo of an added mechanism', () => {
  it('kept in the Katalog tab, changeable at any time; a photo must be an allowed URL', () => {
    const first = mergeCatalog(EMPTY_EXTENSION, {
      hardware: [
        {
          ...hinge,
          info: 'Germaniya, 110°',
          photoUrl: 'https://x.public.blob.vercel-storage.com/textures/hw_x_h1.jpg',
        },
      ],
    });
    if (!first.ok) throw new Error(first.field);
    const h = first.ext.hardware[0]!;
    expect([h.info, h.photoUrl?.endsWith('hw_x_h1.jpg')]).toEqual(['Germaniya, 110°', true]);
    const again = mergeCatalog(first.ext, {
      hardware: [{ ...h, info: 'yangi matn', photoUrl: '' }],
    });
    if (!again.ok) throw new Error(again.field);
    expect([again.ext.hardware[0]!.info, again.ext.hardware[0]!.photoUrl]).toEqual([
      'yangi matn',
      undefined,
    ]);
    expect(rowsToCatalog(catalogToRows(first.ext)).hardware[0]).toMatchObject({
      info: 'Germaniya, 110°',
    });
    expect(
      mergeCatalog(EMPTY_EXTENSION, { hardware: [{ ...hinge, photoUrl: 'javascript:alert(1)' }] })
        .ok,
    ).toBe(false);
  });
});
