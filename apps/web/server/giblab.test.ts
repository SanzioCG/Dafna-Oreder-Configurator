import { writeFileSync } from 'node:fs';
import { PRODUCT_TEMPLATES, defaultParams, generate, resolveParams } from '@dafna/engine';
import { describe, expect, it } from 'vitest';
import { bandWidth, buildGiblab, giblabForLead, giblabParts, grainAcross } from './giblab';
import type { LeadRecord } from './types';

const lead = (templateId: string, over: Record<string, unknown> = {}): LeadRecord => {
  const tpl = PRODUCT_TEMPLATES[templateId]!;
  return {
    id: 'DFN-261114-GIB1',
    createdAt: '2026-11-14 10:00:00',
    status: 'Yangi',
    firstName: 'Aziz',
    lastName: "Qo'chqorov",
    phone: '+998901234567',
    sizeMm: '',
    corpus: '',
    door: '',
    sections: '',
    doors: '',
    kiosk: 'k1',
    lang: 'uz',
    telegram: 'pending',
    managerNote: '',
    paramsJson: JSON.stringify({ ...defaultParams(tpl), ...over }),
    schemaVersion: '',
    templateVersion: '',
    engineVersion: 'test',
    idempotencyKey: 'k'.repeat(20),
    telegramAttempts: 0,
    product: '',
    templateId,
    orderId: '',
    orderItem: '',
    quantity: 1,
    manager: '',
    assignee: '',
  };
};

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const gen = (id: string, over: Record<string, unknown> = {}) => {
  const tpl = PRODUCT_TEMPLATES[id]!;
  return generate(tpl, resolveParams(tpl, { ...defaultParams(tpl), ...over }).params);
};

describe('D-16 GibLab .project', () => {
  it.each(['wardrobe', 'pedestal', 'desk'])(
    '%s: one line of well-formed XML, no comment, every board once',
    (id) => {
      const file = giblabForLead(lead(id))!;
      const xml = new TextDecoder().decode(file);
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><project ')).toBe(true);
      expect(xml).not.toContain('\n');
      expect(xml).not.toContain('<!--'); // GibLab refuses a file with a comment (err=41)
      expect(xml).not.toContain('Aziz'); // no customer data in the workshop file
      const doc = parse(xml);
      expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);

      const r = gen(id);
      const boards = r.panels.filter((p) => p.role !== 'frame' && !p.material.startsWith('metal'));
      const product = doc.querySelector('good[typeId="product"]')!;
      const count = [...product.querySelectorAll('part')].reduce(
        (n, p) => n + Number(p.getAttribute('count')),
        0,
      );
      expect(count).toBe(boards.length);

      // every detail part is cut once (CS), from its own sheet
      const cut = [...doc.querySelectorAll('operation[typeId="CS"] > part')].map((p) =>
        p.getAttribute('id'),
      );
      for (const p of product.querySelectorAll('part'))
        expect(cut.filter((x) => x === p.getAttribute('id'))).toHaveLength(1);
      expect(doc.querySelectorAll('good[typeId="sheet"]')).toHaveLength(
        doc.querySelectorAll('operation[typeId="CS"]').length,
      );
      if (process.env.GIBLAB_OUT) writeFileSync(`${process.env.GIBLAB_OUT}/${id}.project`, xml);
    },
  );

  it('band metres = the banded edges; each banded edge points at its EL operation', () => {
    const r = gen('wardrobe');
    let mm = 0;
    for (const p of r.panels)
      for (const [side, e] of Object.entries(p.edges))
        if (e.bandId) mm += side === 'front' || side === 'back' ? p.lengthMm : p.widthMm;
    const { bands } = giblabParts(r);
    expect(bands.reduce((n, b) => n + b.metres, 0)).toBeCloseTo(mm / 1000, 6);

    const doc = parse(buildGiblab({ id: 'X', createdAt: '2026-11-14 10:00:00', result: r }));
    const els = new Set(
      [...doc.querySelectorAll('operation[typeId="EL"]')].map((o) => `@operation#${o.id}`),
    );
    expect(els.size).toBeGreaterThan(0);
    for (const part of doc.querySelectorAll('good[typeId="product"] part'))
      for (const e of ['elb', 'ell', 'elr', 'elt']) {
        const v = part.getAttribute(e);
        if (v) {
          expect(els.has(v)).toBe(true);
          expect(part.getAttribute(`${e}Mat`)).toMatch(/^Kromka /);
        }
      }
  });

  it('l runs along the grain: a board with the grain across is written turned', () => {
    const r = gen('wardrobe');
    const { parts } = giblabParts(r);
    for (const p of r.panels.filter((x) => x.role !== 'frame')) {
      const turned = grainAcross(p);
      const l = turned ? p.widthMm : p.lengthMm;
      const w = turned ? p.lengthMm : p.widthMm;
      expect(
        parts.some((x) => x.l === l && x.w === w && x.txt === (p.grainDirection !== null)),
      ).toBe(true);
    }
  });

  it('a door is cut with the grain up its height', () => {
    const doors = giblabParts(gen('wardrobe')).parts.filter((p) => / Eshik$/.test(p.name));
    expect(doors.length).toBeGreaterThan(0);
    for (const d of doors) expect(d.l).toBeGreaterThan(d.w);
  });

  it('the side panels carry their band on the front edge (elb), as in the shop sample', () => {
    const doc = parse(new TextDecoder().decode(giblabForLead(lead('wardrobe'))!));
    const sides = [...doc.querySelectorAll('good[typeId="product"] part')].filter((p) =>
      / Yon devor/.test(p.getAttribute('name') ?? ''),
    );
    expect(sides.length).toBeGreaterThan(0);
    for (const s of sides) {
      const turned = Number(s.getAttribute('l')) < Number(s.getAttribute('w'));
      expect(s.getAttribute(turned ? 'elr' : 'elb')).toMatch(/^@operation#/);
    }
  });

  it('the same application gives the same file; two carcasses add their boards', () => {
    expect(giblabForLead(lead('wardrobe'))).toEqual(giblabForLead(lead('wardrobe')));
    const one = giblabParts(gen('wardrobe', { width: 2400, carcasses: '1' }));
    const two = giblabParts(gen('wardrobe', { width: 2400, carcasses: '2' }));
    const n = (x: typeof one) => x.parts.reduce((k, p) => k + p.count, 0);
    expect(n(two)).toBeGreaterThan(n(one));
    expect(giblabForLead({ ...lead('wardrobe'), paramsJson: '{' })).toBeNull();
  });

  it('a wide oak wardrobe with a grey door decor: three sheets, three bands', () => {
    const l = lead('wardrobe', {
      width: 2400,
      sections: 3,
      corpusMaterial: 'egger_h3133_st12_16',
      doorMaterial: 'egger_u702_st9_16',
      interior2: 'drawers_shelves',
    });
    const xml = new TextDecoder().decode(giblabForLead(l)!);
    const doc = parse(xml);
    expect(doc.querySelectorAll('good[typeId="sheet"]')).toHaveLength(3); // oak, grey, HDF
    // D-26: 1 mm on the oak carcass and the grey doors, 0.4 mm on the oak carcass
    expect(doc.querySelectorAll('good[typeId="band"]')).toHaveLength(3);
    if (process.env.GIBLAB_OUT)
      writeFileSync(`${process.env.GIBLAB_OUT}/wardrobe-2400-oak.project`, xml);
  });

  it('band width covers the board', () => {
    expect(bandWidth(16)).toBe(22);
    expect(bandWidth(18)).toBe(22);
    expect(bandWidth(22)).toBe(28);
    expect(bandWidth(25)).toBe(35);
  });
});
