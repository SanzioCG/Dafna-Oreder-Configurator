import { assemblyPath } from './assemblyLink';
import type { AuthOf } from './prices';
import { LEAD_STATUSES, type LeadStore, type StoredLead } from './types';

/**
 * D-47 "Buyurtmalar" on the manager page: the applications of the Google Sheet "Arizalar" for
 * signed-in staff, and the manager's two fields (Holat, Menejer izohi) written back with the
 * name of who changed them. The sheet stays the store: the page reads it, nothing is copied.
 *
 *   GET  /api/orders                                   -> {orders, sheetUrl}
 *   POST /api/orders {ref, id, status?, managerNote?}  -> {order}
 */
export interface OrdersDeps {
  store: LeadStore;
  auth: AuthOf;
  /** the Google Sheet's address (a button "Google Sheetda ochish"); null in dev */
  sheetUrl: string | null;
  /** D-12 key of the assembly-instructions link (the order's PDF in the row's drawer) */
  linkSecret?: string;
}

/** what the page shows of an application (no params JSON, no technical columns) */
export interface OrderRow {
  ref: number;
  id: string;
  createdAt: string;
  status: string;
  firstName: string;
  lastName: string;
  phone: string;
  product: string;
  sizeMm: string;
  corpus: string;
  door: string;
  sections: string;
  kiosk: string;
  telegram: string;
  managerNote: string;
  manager: string;
  orderId: string;
  orderItem: string;
  quantity: number;
  /** the customer's assembly instructions PDF (signed link), when the key is known */
  pdfPath?: string;
}

export const toOrderRow = (r: StoredLead, linkSecret?: string): OrderRow => ({
  ref: r.ref,
  id: r.id,
  createdAt: r.createdAt,
  status: r.status || 'Yangi',
  firstName: r.firstName,
  lastName: r.lastName,
  phone: r.phone,
  product: r.product || 'Shkaf',
  sizeMm: r.sizeMm,
  corpus: r.corpus,
  door: r.door,
  sections: r.sections,
  kiosk: r.kiosk,
  telegram: r.telegram,
  managerNote: r.managerNote,
  manager: r.manager ?? '',
  orderId: r.orderId,
  orderItem: r.orderItem,
  quantity: r.quantity,
  ...(linkSecret && r.id ? { pdfPath: assemblyPath(r.id, linkSecret) } : {}),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function handleOrders(req: Request, deps: OrdersDeps): Promise<Response> {
  const user = await deps.auth(req);
  if (!user) return json(401, { error: { code: 'unauthorized' } });

  if (req.method === 'GET') {
    const rows = (await deps.store.listAll()).filter((r) => r.id);
    // newest first
    const orders = rows
      .map((r) => toOrderRow(r, deps.linkSecret))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json(200, { orders, sheetUrl: deps.sheetUrl });
  }
  if (req.method !== 'POST') return json(405, { error: { code: 'method_not_allowed' } });

  let body: { ref?: unknown; id?: unknown; status?: unknown; managerNote?: unknown };
  try {
    const t = await req.text();
    if (t.length > 6000) return json(413, { error: { code: 'too_large' } });
    body = JSON.parse(t) as typeof body;
  } catch {
    return json(400, { error: { code: 'invalid_request' } });
  }
  const ref = Number(body.ref);
  if (!Number.isInteger(ref) || ref < 2 || typeof body.id !== 'string')
    return json(400, { error: { code: 'invalid_request' } });
  const status = body.status === undefined ? undefined : String(body.status);
  if (status !== undefined && !(LEAD_STATUSES as readonly string[]).includes(status))
    return json(400, { error: { code: 'invalid_status' } });
  const managerNote =
    body.managerNote === undefined ? undefined : String(body.managerNote).slice(0, 1000);
  // the row must still be the same application (someone may have sorted the sheet by hand)
  const row = (await deps.store.listAll()).find((r) => r.ref === ref);
  if (!row || row.id !== body.id) return json(409, { error: { code: 'row_moved' } });
  await deps.store.updateByManager(ref, { status, managerNote, manager: user.name });
  return json(200, {
    order: toOrderRow(
      {
        ...row,
        ...(status !== undefined ? { status } : {}),
        ...(managerNote !== undefined ? { managerNote } : {}),
        manager: user.name,
      },
      deps.linkSecret,
    ),
  });
}
