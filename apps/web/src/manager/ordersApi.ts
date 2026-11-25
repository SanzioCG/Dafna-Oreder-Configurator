import type { Role } from '../auth/staffSession';
import { formatPhone } from '../lead/phone';

/**
 * D-47: client of GET / POST /api/orders - the applications of the Google Sheet "Arizalar" for the
 * manager page ("Bosh sahifa", "Buyurtmalar"). The staff session cookie goes by itself.
 */
export const ORDERS_URL = '/api/orders';

/** the sheet's "Holat" values, in order (= server/types.ts LEAD_STATUSES; a test keeps them equal) */
export const ORDER_STATUSES = [
  'Yangi',
  "Qo'ng'iroq qilindi",
  'Tasdiqlandi',
  'Ishlab chiqarishga berildi',
  'Bekor qilindi',
] as const;

/** one application as the page shows it (no engine parameters, no technical columns) */
export interface OrderRow {
  /** the sheet row (an update names it; the server checks it still holds this ID) */
  ref: number;
  id: string;
  /** Tashkent time "2026-11-24 16:40:00" */
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
  /** the kiosk's ID; empty = the website */
  kiosk: string;
  telegram: string;
  managerNote: string;
  /** who last changed the status / note */
  manager: string;
  /** D-54: the login of who has the application ("Mas'ul"); '' = nobody yet */
  assignee: string;
  orderId: string;
  orderItem: string;
  quantity: number;
  /** the customer's assembly instructions PDF */
  pdfPath?: string;
}

export type OrdersOutcome<T> = { ok: true; value: T } | { ok: false; code: string };

async function call<T>(
  init: { method: 'GET' | 'POST'; body?: unknown },
  pick: (d: Record<string, unknown>) => T | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<OrdersOutcome<T>> {
  try {
    const res = await fetchImpl(ORDERS_URL, {
      method: init.method,
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const value = data && res.ok ? pick(data) : undefined;
    if (value !== undefined) return { ok: true, value };
    const code = (data?.error as { code?: string } | undefined)?.code;
    return { ok: false, code: code ?? 'network' };
  } catch {
    return { ok: false, code: 'network' };
  }
}

/** D-54: who an application can be given to (active managers and operators) */
export interface Person {
  login: string;
  name: string;
  role: Role;
}

export interface OrdersList {
  orders: OrderRow[];
  /** "Google Sheetda ochish" (null in dev and for an operator) */
  sheetUrl: string | null;
  /** D-54: empty for an operator (they only see their own applications) */
  people: Person[];
}

export const listOrders = (fetchImpl?: typeof fetch) =>
  call<OrdersList>(
    { method: 'GET' },
    (d) =>
      Array.isArray(d.orders)
        ? {
            orders: d.orders as OrderRow[],
            sheetUrl: (d.sheetUrl as string | null) ?? null,
            people: Array.isArray(d.people) ? (d.people as Person[]) : [],
          }
        : undefined,
    fetchImpl,
  );

export const updateOrder = (
  row: Pick<OrderRow, 'ref' | 'id'>,
  patch: { status?: string; managerNote?: string; assignee?: string },
  fetchImpl?: typeof fetch,
) =>
  call<OrderRow>(
    { method: 'POST', body: { ref: row.ref, id: row.id, ...patch } },
    (d) => d.order as OrderRow | undefined,
    fetchImpl,
  );

export const ORDER_ERRORS: Record<string, string> = {
  unauthorized: 'Sessiya tugagan: qaytadan kiring',
  row_moved:
    "Jadval qo'lda o'zgartirilgan (qatorlar surilgan): sahifani yangilab, qaytadan urinib ko'ring",
  invalid_status: "Bunday holat yo'q",
  forbidden: 'Arizani kimga berishni menejer hal qiladi',
  not_yours: 'Bu ariza endi sizda emas (menejer boshqa xodimga bergan): sahifani yangilang',
  invalid_assignee: 'Bu xodim topilmadi yoki bloklangan: sahifani yangilang',
  server_misconfigured: 'Google Sheet ulanmagan (Vercel sozlamalari)',
  network: "Server bilan bog'lanib bo'lmadi. Qaytadan urinib ko'ring",
};
export const orderError = (code: string) => ORDER_ERRORS[code] ?? ORDER_ERRORS.network!;

/** "2026-11-24 16:40:00" -> {day: "2026-11-24", short: "24.11 16:40"} */
export function orderTime(createdAt: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(createdAt);
  if (!m) return { day: '', short: createdAt, time: '' };
  return {
    day: `${m[1]}-${m[2]}-${m[3]}`,
    short: `${m[3]}.${m[2]} ${m[4]}:${m[5]}`,
    time: `${m[4]}:${m[5]}`,
  };
}

/** today's date in Tashkent, "2026-11-25" (the sheet's times are Tashkent times) */
export const tashkentDay = (now = new Date(), shiftDays = 0) =>
  new Date(now.getTime() + shiftDays * 86_400_000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Tashkent',
  });

export const customerName = (o: OrderRow) => [o.firstName, o.lastName].filter(Boolean).join(' ');
export const orderSource = (o: OrderRow) => (o.kiosk ? `Kiosk ${o.kiosk}` : 'Sayt');

/** the pill colour of a status (admin.css .mgr-pill[data-tone]) */
export const statusTone = (s: string) =>
  (
    ({
      Yangi: 'info',
      "Qo'ng'iroq qilindi": 'warn',
      Tasdiqlandi: 'accent',
      'Ishlab chiqarishga berildi': 'ok',
      'Bekor qilindi': 'muted',
    }) as Record<string, string>
  )[s] ?? 'muted';

/** "+998901234567" -> "+998 90 123 45 67" (anything else as typed in the sheet) */
export const orderPhone = (o: Pick<OrderRow, 'phone'>) =>
  /^\+998\d{9}$/.test(o.phone) ? formatPhone(o.phone) : o.phone;
