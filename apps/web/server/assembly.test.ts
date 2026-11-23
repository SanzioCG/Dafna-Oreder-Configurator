// @vitest-environment node
import { PRODUCT_TEMPLATES, defaultParams, generate } from '@dafna/engine';
import { describe, expect, it } from 'vitest';
import { assemblyPath, assemblyToken, handleAssembly } from './assemblyLink';
import { assemblySteps, buildAssemblyPdf } from './assemblyPdf';
import { MemoryLeadStore } from './memory';
import type { LeadRecord } from './types';

const lead = (templateId: string, over: Partial<LeadRecord> = {}): LeadRecord => ({
  id: 'DFN-261113-AB12',
  createdAt: '2026-11-13 17:00:00',
  status: 'Yangi',
  firstName: 'Aziz',
  lastName: '',
  phone: '+998901234567',
  sizeMm: '',
  corpus: '',
  door: '',
  sections: '',
  doors: '',
  kiosk: '',
  lang: 'uz',
  telegram: 'sent',
  managerNote: '',
  paramsJson: JSON.stringify(defaultParams(PRODUCT_TEMPLATES[templateId]!)),
  schemaVersion: '',
  templateVersion: '',
  engineVersion: '',
  idempotencyKey: 'k'.repeat(20),
  telegramAttempts: 1,
  product: '',
  templateId,
  orderId: '',
  orderItem: '',
  quantity: 1,
  ...over,
});

describe('D-12 assembly instructions', () => {
  it.each(['wardrobe', 'pedestal', 'desk'])('%s: every board goes in exactly one step', (id) => {
    const tpl = PRODUCT_TEMPLATES[id]!;
    const params = defaultParams(tpl);
    const r = generate(tpl, params);
    const steps = assemblySteps(tpl, params, r);
    const placed = steps.flatMap((s) => s.panels.map((p) => p.id));
    expect(placed.sort()).toEqual(r.panels.map((p) => p.id).sort());
    expect(steps[0]!.base).toBe(true);
    expect(steps.slice(1).every((s) => !s.base)).toBe(true);
  });

  it('wardrobe order: carcass before shelves, doors last; hinges counted on the door step', () => {
    const tpl = PRODUCT_TEMPLATES.wardrobe!;
    const params = { ...defaultParams(tpl), hingeBrand: 'hettich' };
    const steps = assemblySteps(tpl, params, generate(tpl, params));
    const keys = steps.map((s) => s.key);
    expect(keys.indexOf('sides')).toBeLessThan(keys.indexOf('shelves'));
    expect(keys.at(-1)).toBe('doors');
    expect(steps.at(-1)!.hardware).toEqual(['hinge_hettich_sensys']);
  });

  it.each(['uz', 'ru'] as const)('a valid PDF in %s', async (lang) => {
    const tpl = PRODUCT_TEMPLATES.pedestal!;
    const params = defaultParams(tpl);
    const pdf = await buildAssemblyPdf({
      id: 'DFN-261113-AB12',
      lang,
      template: tpl,
      params,
      result: generate(tpl, params),
    });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });
});

describe('D-12 assembly link', () => {
  const secret = 'test-secret';

  it('the link carries a token that only the server can make', () => {
    const path = assemblyPath('DFN-261113-AB12', secret);
    expect(path).toBe(
      `/api/assembly?id=DFN-261113-AB12&t=${assemblyToken('DFN-261113-AB12', secret)}`,
    );
    expect(assemblyToken('DFN-261113-AB12', 'other')).not.toBe(
      assemblyToken('DFN-261113-AB12', secret),
    );
  });

  it('a valid link gets the PDF; a wrong token or an unknown ID gets 404', async () => {
    const store = new MemoryLeadStore();
    await store.append(lead('wardrobe', { lang: 'ru' }));
    const get = (path: string) => handleAssembly(new Request(`http://x${path}`), { store, secret });

    const ok = await get(assemblyPath('DFN-261113-AB12', secret));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('application/pdf');
    expect(new TextDecoder().decode(new Uint8Array(await ok.arrayBuffer()).slice(0, 5))).toBe(
      '%PDF-',
    );

    expect((await get('/api/assembly?id=DFN-261113-AB12&t=nope')).status).toBe(404);
    expect((await get(assemblyPath('DFN-261113-ZZ99', secret))).status).toBe(404);
    expect((await get('/api/assembly?id=../../etc&t=x')).status).toBe(404);
  });
});
