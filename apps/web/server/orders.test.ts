import { describe, expect, it } from 'vitest';
import { MemoryLeadStore } from './memory';
import { handleOrders, type OrderRow } from './orders';
import { headerAuth } from './testAuth';
import type { LeadRecord } from './types';

const lead = (id: string, createdAt: string, extra: Partial<LeadRecord> = {}): LeadRecord => ({
  id,
  createdAt,
  status: 'Yangi',
  firstName: 'Aziza',
  lastName: '',
  phone: '+998901234567',
  sizeMm: '1500 × 2100 × 600',
  corpus: 'Oq',
  door: 'Oq',
  sections: '2 ta qism',
  doors: '',
  kiosk: '',
  lang: 'uz',
  telegram: 'sent',
  managerNote: '',
  paramsJson: '{"secret":"engine params"}',
  schemaVersion: '',
  templateVersion: '',
  engineVersion: '',
  idempotencyKey: 'k-' + id,
  telegramAttempts: 1,
  product: 'Shkaf',
  templateId: 'wardrobe',
  orderId: '',
  orderItem: '',
  quantity: 1,
  manager: '',
  ...extra,
});

async function setup() {
  const store = new MemoryLeadStore();
  await store.append(lead('DFN-1', '2026-11-24 10:00:00'));
  await store.append(lead('DFN-2', '2026-11-25 09:30:00', { product: 'Stol' }));
  const deps = {
    store,
    auth: headerAuth('ok'),
    sheetUrl: 'https://docs.google.com/x',
    linkSecret: 's',
  };
  return { store, deps };
}
const req = (method: string, body?: unknown, key = 'ok') =>
  new Request('http://x/api/orders', {
    method,
    headers: { 'x-test-staff': key, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('D-47 "Buyurtmalar": the applications for signed-in staff', () => {
  it('signed-in staff only; newest first; no technical columns', async () => {
    const { deps } = await setup();
    expect((await handleOrders(req('GET', undefined, 'nope'), deps)).status).toBe(401);
    const r = await handleOrders(req('GET'), deps);
    const body = (await r.json()) as { orders: OrderRow[]; sheetUrl: string };
    expect(body.orders.map((o) => o.id)).toEqual(['DFN-2', 'DFN-1']);
    expect(body.sheetUrl).toBe('https://docs.google.com/x');
    // the customer's assembly PDF, signed like the QR code's link
    expect(body.orders[0]!.pdfPath).toMatch(/^\/api\/assembly\?id=DFN-2&t=/);
    expect(JSON.stringify(body)).not.toContain('engine params');
    expect(JSON.stringify(body)).not.toContain('k-DFN');
  });

  it('the status and note are written with who changed them', async () => {
    const { store, deps } = await setup();
    const r = await handleOrders(
      req('POST', { ref: 2, id: 'DFN-1', status: 'Tasdiqlandi', managerNote: "O'lchov ertaga" }),
      deps,
    );
    expect(r.status).toBe(200);
    expect(((await r.json()) as { order: OrderRow }).order).toMatchObject({
      status: 'Tasdiqlandi',
      managerNote: "O'lchov ertaga",
      manager: 'Test',
    });
    expect(store.rows[0]).toMatchObject({ status: 'Tasdiqlandi', manager: 'Test' });
  });

  it('an unknown status or a moved row is refused', async () => {
    const { deps } = await setup();
    expect(
      (await handleOrders(req('POST', { ref: 2, id: 'DFN-1', status: 'Boss' }), deps)).status,
    ).toBe(400);
    // row 2 holds DFN-1, not DFN-2 (the sheet was sorted by hand)
    const moved = await handleOrders(
      req('POST', { ref: 2, id: 'DFN-2', status: 'Tasdiqlandi' }),
      deps,
    );
    expect(moved.status).toBe(409);
  });
});
