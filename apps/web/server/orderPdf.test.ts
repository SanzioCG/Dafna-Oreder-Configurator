// @vitest-environment node
import { writeFileSync } from 'node:fs';
import { PRODUCT_TEMPLATES, defaultParams, generate } from '@dafna/engine';
import { describe, expect, it } from 'vitest';
import { panelBox } from '../src/viewer/mechanisms';
import { boardBox, buildOrderPdf, cutList, orderPdfInput } from './orderPdf';
import type { LeadRecord } from './types';

const lead = (templateId: string): LeadRecord => ({
  id: 'D-261113-TEST',
  createdAt: '2026-11-13 16:40:00',
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
  paramsJson: JSON.stringify(defaultParams(PRODUCT_TEMPLATES[templateId]!)),
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
});

describe('D-11 order PDF for the workshop', () => {
  it('board boxes match the 3D viewer (same rotations)', () => {
    for (const tpl of Object.values(PRODUCT_TEMPLATES)) {
      const r = generate(tpl, defaultParams(tpl));
      for (const p of r.panels) {
        const a = boardBox(p);
        const b = panelBox(p);
        for (let i = 0; i < 3; i++) {
          expect(a.min[i]).toBeCloseTo(b.min[i]!);
          expect(a.max[i]).toBeCloseTo(b.max[i]!);
        }
      }
    }
  });

  it('the cut list counts every cut board once, identical boards on one line', () => {
    const tpl = PRODUCT_TEMPLATES.wardrobe!;
    const r = generate(tpl, defaultParams(tpl));
    const rows = cutList(r);
    const boards = r.panels.filter((p) => p.role !== 'frame').length;
    expect(rows.reduce((n, x) => n + x.count, 0)).toBe(boards);
    expect(rows.length).toBeLessThan(boards);
    const sides = rows.filter((x) => x.role === 'side');
    expect(sides.reduce((n, x) => n + x.count, 0)).toBe(2);
    // decor names are never translated (catalog name, Cyrillic)
    expect(rows.some((x) => /[А-Яа-я]/.test(x.material))).toBe(true);
  });

  it.each(['wardrobe', 'pedestal', 'desk'])(
    '%s: a valid PDF with Uzbek and Cyrillic text',
    async (id) => {
      const input = orderPdfInput(lead(id))!;
      expect(input).not.toBeNull();
      const pdf = await buildOrderPdf(input);
      expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
      expect(pdf.length).toBeLessThan(400_000);
      if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/order-${id}.pdf`, pdf);
    },
  );

  it('a lead whose params cannot be read gets no PDF', () => {
    expect(orderPdfInput({ ...lead('wardrobe'), paramsJson: '{' })).toBeNull();
    expect(orderPdfInput({ ...lead('wardrobe'), templateId: 'sofa' })).toBeNull();
  });
});
