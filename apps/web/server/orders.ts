import { assemblyPath } from './assemblyLink';
import type { AuthOf } from './prices';
import { isOperator, type Assignee } from './staffAuth';
import { LEAD_STATUSES, type LeadStore, type StoredLead } from './types';

/**
 * D-47 "Buyurtmalar" on the manager page: the applications of the Google Sheet "Arizalar" for
 * signed-in staff, and the manager's two fields (Holat, Menejer izohi) written back with the
 * name of who changed them. The sheet stays the store: the page reads it, nothing is copied.
 *
 *   GET  /api/orders                                   -> {orders, sheetUrl, people}
 *   POST /api/orders {ref, id, status?, managerNote?, assignee?}  -> {order}
 *
 * D-54: the admin and managers see every application and give it to someone ("Mas'ul": an
 * operator or a manager, by login; `people` = who can take one). An operator sees only the
 * applications given to them and changes their status / note - never who has them.
 */
export interface OrdersDeps {
  store: LeadStore;
  auth: AuthOf;
  /** the Google Sheet's address (a button "Google Sheetda ochish"); null in dev */
  sheetUrl: string | null;
  /** D-12 key of the assembly-instructions link (the order's PDF in the row's drawer) */
  linkSecret?: string;
  /** D-54: active managers and operators (an application is given to one of them) */
  people?: () => Promise<Assignee[]>;
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
  /** D-54: the login of who has the application ('' = nobody yet) */
  assignee: string;
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
  assignee: r.assignee ?? '',
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
  // D-54: an operator works only on what was given to them
  const operator = isOperator(user);

  if (req.method === 'GET') {
    const rows = (await deps.store.listAll()).filter(
      (r) => r.id && (!operator || r.assignee === user.login),
    );
    // newest first
    const orders = rows
      .map((r) => toOrderRow(r, deps.linkSecret))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // the sheet holds every application: not an operator's link
    if (operator) return json(200, { orders, sheetUrl: null, people: [] });
    return json(200, { orders, sheetUrl: deps.sheetUrl, people: (await deps.people?.()) ?? [] });
  }
  if (req.method !== 'POST') return json(405, { error: { code: 'method_not_allowed' } });

  let body: {
    ref?: unknown;
    id?: unknown;
    status?: unknown;
    managerNote?: unknown;
    assignee?: unknown;
  };
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
  // D-54: who has it - the office decides, to an active manager / operator or nobody ('')
  const assignee =
    body.assignee === undefined ? undefined : String(body.assignee).trim().toLowerCase();
  if (assignee !== undefined) {
    if (operator) return json(403, { error: { code: 'forbidden' } });
    if (assignee !== '' && !((await deps.people?.()) ?? []).some((p) => p.login === assignee))
      return json(400, { error: { code: 'invalid_assignee' } });
  }
  // the row must still be the same application (someone may have sorted the sheet by hand)
  const row = (await deps.store.listAll()).find((r) => r.ref === ref);
  if (!row || row.id !== body.id) return json(409, { error: { code: 'row_moved' } });
  if (operator && row.assignee !== user.login) return json(403, { error: { code: 'not_yours' } });
  await deps.store.updateByManager(ref, { status, managerNote, assignee, manager: user.name });
  return json(200, {
    order: toOrderRow(
      {
        ...row,
        ...(status !== undefined ? { status } : {}),
        ...(managerNote !== undefined ? { managerNote } : {}),
        ...(assignee !== undefined ? { assignee } : {}),
        manager: user.name,
      },
      deps.linkSecret,
    ),
  });
}
