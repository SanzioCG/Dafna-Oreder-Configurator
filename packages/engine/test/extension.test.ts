import { afterEach, describe, expect, it } from 'vitest';
import {
  EMPTY_EXTENSION,
  applyCatalogExtension,
  catalogForTemplate,
  computeBom,
  computePrice,
  defaultParams,
  deskTemplate,
  generate,
  getMaterial,
  hardwareV1,
  pedestalTemplate,
  priceListDemo,
  regenerateApplication,
  toOrderDraft,
  validate,
  wardrobeTemplate,
  type CatalogExtension,
} from '../src/index.js';

const EXT: CatalogExtension = {
  materials: [
    {
      id: 'x_ldsp_1',
      kind: 'ldsp',
      name: 'Дуб Гладстоун табак',
      code: 'EGGER H3157 ST12',
      thicknessMm: 18,
      colorHex: '#8a6a4a',
      group: 'wood',
      usage: ['corpus', 'door'],
      visible: true,
    },
    {
      id: 'x_lmdf_2',
      kind: 'mdf',
      name: 'Зелёный матовый',
      thicknessMm: 16,
      colorHex: '#4f6b55',
      group: 'plain',
      usage: ['door'],
      visible: false,
    },
  ],
  hardware: [
    {
      id: 'x_hinge_blum',
      kind: 'hinge',
      brandKey: 'blum',
      brand: 'Blum',
      model: 'Clip Top Blumotion',
      softClose: true,
      visible: true,
    },
  ],
};

const opts = (t: typeof wardrobeTemplate, key: string) =>
  t.parameters.find((p) => p.key === key)?.options ?? [];

afterEach(() => applyCatalogExtension(EMPTY_EXTENSION));

describe('D-20 catalog extension (materials / hardware added on the admin page)', () => {
  it('a new board becomes an option where it is meant to be used, nowhere else', () => {
    const before = opts(wardrobeTemplate, 'corpusMaterial').length;
    applyCatalogExtension(EXT);
    expect(opts(wardrobeTemplate, 'corpusMaterial')).toContain('x_ldsp_1');
    expect(opts(wardrobeTemplate, 'doorMaterial')).toEqual(
      expect.arrayContaining(['x_ldsp_1', 'x_lmdf_2']),
    );
    expect(opts(wardrobeTemplate, 'corpusMaterial')).not.toContain('x_lmdf_2');
    expect(opts(pedestalTemplate, 'doorMaterial')).toContain('x_lmdf_2');
    // D-36: a carcass board also fits the desk top (a 16 mm LDSP, doubled)
    expect(opts(deskTemplate, 'topMaterial')).toContain('x_ldsp_1');
    // the pedestal carcass takes chipboard only: an MDF board never becomes its carcass option
    expect(opts(pedestalTemplate, 'corpusMaterial')).toContain('x_ldsp_1');
    // idempotent: applying again adds nothing twice; the empty extension restores the templates
    applyCatalogExtension(EXT);
    expect(opts(wardrobeTemplate, 'corpusMaterial').length).toBe(before + 1);
    applyCatalogExtension(EMPTY_EXTENSION);
    expect(opts(wardrobeTemplate, 'corpusMaterial').length).toBe(before);
    expect(getMaterial(catalogForTemplate(wardrobeTemplate), 'x_ldsp_1')).toBeUndefined();
  });

  it('the wardrobe is built with the new board: its thickness, its name, its code', () => {
    applyCatalogExtension(EXT);
    const p = { ...defaultParams(wardrobeTemplate), corpusMaterial: 'x_ldsp_1' };
    expect(validate(p, wardrobeTemplate).filter((i) => i.severity === 'error')).toEqual([]);
    const r = generate(wardrobeTemplate, p);
    const side = r.panels.find((x) => x.role === 'side')!;
    expect([side.material, side.thicknessMm]).toEqual(['x_ldsp_1', 18]);
    const draft = toOrderDraft(p, r, { template: wardrobeTemplate, now: () => new Date(0) });
    expect(JSON.stringify(draft)).toContain('EGGER H3157 ST12');
  });

  it('a hidden entry stays valid for old applications (never deleted), customers do not see it', () => {
    applyCatalogExtension(EXT);
    const p = { ...defaultParams(wardrobeTemplate), doorMaterial: 'x_lmdf_2' };
    expect(validate(p, wardrobeTemplate).filter((i) => i.severity === 'error')).toEqual([]);
    expect(getMaterial(catalogForTemplate(wardrobeTemplate), 'x_lmdf_2')?.customerVisible).toBe(
      false,
    );
    const again = regenerateApplication(p, wardrobeTemplate.templateVersion);
    expect(again.ok).toBe(true);
  });

  it('a new hinge brand is offered, counted in the BOM and priced by its id', () => {
    applyCatalogExtension(EXT);
    expect(opts(wardrobeTemplate, 'hingeBrand')).toContain('blum');
    const p = { ...defaultParams(wardrobeTemplate), hingeBrand: 'blum' };
    const bom = computeBom(wardrobeTemplate, p, generate(wardrobeTemplate, p));
    expect(bom.find((l) => l.ref === 'x_hinge_blum')?.qty).toBeGreaterThan(0);
    const list = { ...priceListDemo, hardware: { ...priceListDemo.hardware, x_hinge_blum: 30000 } };
    const r = computePrice(bom, catalogForTemplate(wardrobeTemplate), list, 'wardrobe');
    expect(r.missing).toEqual([]);
    applyCatalogExtension(EMPTY_EXTENSION);
    expect(hardwareV1.items.some((i) => i.id === 'x_hinge_blum')).toBe(false);
  });
});

describe('D-20 services in the price', () => {
  const price = (
    services: NonNullable<typeof priceListDemo.services>,
    productType = 'wardrobe',
  ) => {
    const t = wardrobeTemplate;
    const p = defaultParams(t);
    return computePrice(
      computeBom(t, p, generate(t, p)),
      catalogForTemplate(t),
      { ...priceListDemo, services },
      productType,
    );
  };

  it('per m², per metre of edge band, per product and % of the other costs', () => {
    const none = price([]);
    const area = none.lines.filter((l) => l.kind === 'board').reduce((s, l) => s + l.qty, 0);
    const edgeM = none.lines.filter((l) => l.kind === 'edge').reduce((s, l) => s + l.qty, 0);
    const r = price([
      { id: 's1', name: 'Kesish', basis: 'm2', products: [], price: 10000 },
      { id: 's2', name: 'Kromkalash', basis: 'edge_m', products: [], price: 1000 },
      { id: 's3', name: 'Yetkazish', basis: 'product', products: ['wardrobe'], price: 150000 },
      { id: 's4', name: 'Kafolat', basis: 'pct', products: [], price: 10 },
    ]);
    const cost = (id: string) => r.services.find((s) => s.id === id)?.cost;
    expect(cost('s1')).toBe(Math.round(area * 10000));
    expect(cost('s2')).toBe(Math.round(edgeM * 1000));
    expect(cost('s3')).toBe(150000);
    const before = none.subtotal + cost('s1')! + cost('s2')! + cost('s3')!;
    expect(cost('s4')).toBe(Math.round(before * 0.1));
    expect(r.subtotal).toBe(before + cost('s4')!);
    expect(r.markup).toBe(Math.round((r.subtotal * priceListDemo.markupPct) / 100));
  });

  it('a service for another product does not apply', () => {
    const r = price([{ id: 's', name: 'Rama', basis: 'product', products: ['desk'], price: 9 }]);
    expect(r.services).toEqual([]);
    expect(r.servicesTotal).toBe(0);
  });
});
