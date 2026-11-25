import { describe, expect, it } from 'vitest';
import { MemoryLeadStore } from './memory';
import { handleOrders, type OrderRow } from './orders';
import { headerAuth, usersAuth } from './testAuth';
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
  assignee: '',
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

describe('D-54 roles: the office gives applications to operators', () => {
  const users = {
    adm: { login: 'admin', name: 'Admin', role: 'admin' as const },
    man: { login: 'malika', name: 'Malika', role: 'manager' as const },
    op1: { login: 'aziz', name: 'Aziz', role: 'operator' as const },
    op2: { login: 'dilnoza', name: 'Dilnoza', role: 'operator' as const },
  };
  const people = [
    { login: 'malika', name: 'Malika', role: 'manager' as const },
    { login: 'aziz', name: 'Aziz', role: 'operator' as const },
    { login: 'dilnoza', name: 'Dilnoza', role: 'operator' as const },
  ];
  async function roles() {
    const store = new MemoryLeadStore();
    await store.append(lead('DFN-1', '2026-11-24 10:00:00', { assignee: 'aziz' }));
    await store.append(lead('DFN-2', '2026-11-25 09:30:00'));
    const deps = {
      store,
      auth: usersAuth(users),
      sheetUrl: 'https://docs.google.com/x',
      people: async () => people,
    };
    return { store, deps };
  }
  const list = async (deps: Parameters<typeof handleOrders>[1], key: string) =>
    (await (await handleOrders(req('GET', undefined, key), deps)).json()) as {
      orders: OrderRow[];
      sheetUrl: string | null;
      people: unknown[];
    };

  it('the admin and managers see every application and who can take one', async () => {
    const { deps } = await roles();
    for (const key of ['adm', 'man']) {
      const body = await list(deps, key);
      expect(body.orders.map((o) => [o.id, o.assignee])).toEqual([
        ['DFN-2', ''],
        ['DFN-1', 'aziz'],
      ]);
      expect(body.people).toEqual(people);
      expect(body.sheetUrl).toBe('https://docs.google.com/x');
    }
  });

  it('an operator sees only what was given to them - no sheet link, no staff list', async () => {
    const { deps } = await roles();
    const aziz = await list(deps, 'op1');
    expect(aziz.orders.map((o) => o.id)).toEqual(['DFN-1']);
    expect(aziz).toMatchObject({ sheetUrl: null, people: [] });
    expect((await list(deps, 'op2')).orders).toEqual([]);
  });

  it('a manager gives an application to an operator (written to the sheet), or takes it back', async () => {
    const { store, deps } = await roles();
    const ok = await handleOrders(
      req('POST', { ref: 3, id: 'DFN-2', assignee: ' Dilnoza ' }, 'man'),
      deps,
    );
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { order: OrderRow }).order).toMatchObject({
      assignee: 'dilnoza',
      manager: 'Malika',
    });
    expect(store.rows[1]).toMatchObject({ assignee: 'dilnoza', manager: 'Malika' });
    expect((await list(deps, 'op2')).orders.map((o) => o.id)).toEqual(['DFN-2']);
    // back to nobody
    await handleOrders(req('POST', { ref: 3, id: 'DFN-2', assignee: '' }, 'adm'), deps);
    expect(store.rows[1]!.assignee).toBe('');
  });

  it('only to an active manager / operator', async () => {
    const { deps } = await roles();
    for (const assignee of ['admin', 'ghost'])
      expect(
        (await handleOrders(req('POST', { ref: 3, id: 'DFN-2', assignee }, 'man'), deps)).status,
      ).toBe(400);
  });

  it('an operator changes the status / note of their own applications only, never who has them', async () => {
    const { store, deps } = await roles();
    const own = await handleOrders(
      req(
        'POST',
        { ref: 2, id: 'DFN-1', status: "Qo'ng'iroq qilindi", managerNote: 'Ertaga' },
        'op1',
      ),
      deps,
    );
    expect(own.status).toBe(200);
    expect(store.rows[0]).toMatchObject({
      status: "Qo'ng'iroq qilindi",
      managerNote: 'Ertaga',
      manager: 'Aziz',
      assignee: 'aziz',
    });
    const other = await handleOrders(
      req('POST', { ref: 3, id: 'DFN-2', status: 'Tasdiqlandi' }, 'op1'),
      deps,
    );
    expect(other.status).toBe(403);
    expect(store.rows[1]!.status).toBe('Yangi');
    const pass = await handleOrders(
      req('POST', { ref: 2, id: 'DFN-1', assignee: 'dilnoza' }, 'op1'),
      deps,
    );
    expect(pass.status).toBe(403);
    expect(store.rows[0]!.assignee).toBe('aziz');
  });
});
