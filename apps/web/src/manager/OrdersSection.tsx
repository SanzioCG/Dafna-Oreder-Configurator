import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  FileText,
  MoreHorizontal,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import type { Role } from '../auth/staffSession';
import { Button } from '../ui/Button';
import {
  ORDER_STATUSES,
  customerName,
  listOrders,
  orderError,
  orderPhone,
  orderSource,
  orderTime,
  statusTone,
  tashkentDay,
  updateOrder,
  type OrderRow,
  type Person,
} from './ordersApi';

type Period = 'all' | 'today' | '7' | '30';
/** in this order (an object would put the numeric keys "7", "30" first) */
const PERIODS: [Period, string][] = [
  ['all', 'Butun davr'],
  ['today', 'Bugun'],
  ['7', 'Oxirgi 7 kun'],
  ['30', 'Oxirgi 30 kun'],
];
type Source = 'all' | 'site' | 'kiosk';
const SOURCES: Record<Source, string> = { all: 'Manba: hammasi', site: 'Sayt', kiosk: 'Kiosklar' };
const PAGE_SIZES = [25, 50, 100];

/** a status as a coloured pill (admin.css .mgr-pill) */
export function StatusPill({ status }: { status: string }) {
  return (
    <span className="mgr-pill" data-tone={statusTone(status)}>
      {status}
    </span>
  );
}

/**
 * D-54: who can take an application ("Mas'ul"), operators first; a login no longer in the list
 * (blocked) stays visible as it is
 */
function AssigneeOptions({ people, current }: { people: Person[]; current: string }) {
  const groups: [Role, string][] = [
    ['operator', 'Operatorlar'],
    ['manager', 'Menejerlar'],
  ];
  return (
    <>
      <option value="">— Biriktirilmagan —</option>
      {current && !people.some((p) => p.login === current) && (
        <option value={current}>{current} (faol emas)</option>
      )}
      {groups.map(([role, label]) => {
        const list = people.filter((p) => p.role === role);
        return list.length === 0 ? null : (
          <optgroup key={role} label={label}>
            {list.map((p) => (
              <option key={p.login} value={p.login}>
                {p.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

/** the applications, loaded once per visit of a section ("Yangilash" loads them again) */
export function useOrders(fetchImpl?: typeof fetch) {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  /** D-54: who an application can be given to (empty for an operator) */
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = async () => {
    setLoading(true);
    setError(null);
    const r = await listOrders(fetchImpl);
    setLoading(false);
    if (!r.ok) return setError(orderError(r.code));
    setOrders(r.value.orders);
    setSheetUrl(r.value.sheetUrl);
    setPeople(r.value.people);
  };
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchImpl]);
  const replace = (o: OrderRow) =>
    setOrders((list) => list?.map((x) => (x.ref === o.ref && x.id === o.id ? o : x)) ?? null);
  return { orders, sheetUrl, people, error, loading, reload, replace };
}

/**
 * D-47 "Buyurtmalar" (Figma "Admin / Buyurtmalar"): the applications of the Google Sheet
 * "Arizalar" - tabs by status, search, period / product / source filters, pages; a row opens a
 * drawer with the details, the status and the manager's note (saved to the sheet with the
 * manager's name). The sheet stays the store: nothing is copied anywhere else.
 * D-54: the admin and managers give each application to an operator ("Mas'ul", in the row or the
 * drawer); an operator sees only the applications given to them.
 */
export function OrdersSection({
  fetchImpl,
  role,
  openId,
  onOpened,
}: {
  fetchImpl?: typeof fetch;
  /** D-54: the signed-in staff member's role */
  role: Role;
  /** an order to open at once ("Bosh sahifa" row) */
  openId?: string | null;
  onOpened?: () => void;
}) {
  const { orders, sheetUrl, people, error, loading, reload, replace } = useOrders(fetchImpl);
  /** D-54: the admin / a manager (gives applications out); an operator sees their own */
  const office = role !== 'operator';
  /** D-54: "Mas'ul" filter: 'all', 'none' (nobody yet) or a login */
  const [who, setWho] = useState('all');
  /** D-54: the row being given to someone right now, and why it failed */
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [product, setProduct] = useState('all');
  const [source, setSource] = useState<Source>('all');
  const [newestFirst, setNewestFirst] = useState(true);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<OrderRow | null>(null);

  // "Bosh sahifa" -> this order's drawer
  useEffect(() => {
    if (!openId || !orders) return;
    const o = orders.find((x) => x.id === openId);
    if (o) setOpen(o);
    onOpened?.();
  }, [openId, orders, onOpened]);

  const products = useMemo(
    () => [...new Set((orders ?? []).map((o) => o.product).filter(Boolean))].sort(),
    [orders],
  );

  /** every filter but the status tab (the tabs count what the other filters leave) */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const today = tashkentDay();
    const since =
      period === 'today'
        ? today
        : period === 'all'
          ? ''
          : tashkentDay(new Date(), -(Number(period) - 1));
    return (orders ?? []).filter((o) => {
      if (since && orderTime(o.createdAt).day < since) return false;
      if (product !== 'all' && o.product !== product) return false;
      if (source === 'site' && o.kiosk) return false;
      if (source === 'kiosk' && !o.kiosk) return false;
      if (who === 'none' ? o.assignee !== '' : who !== 'all' && o.assignee !== who) return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        customerName(o).toLowerCase().includes(q) ||
        (digits.length >= 3 && o.phone.replace(/\D/g, '').includes(digits))
      );
    });
  }, [orders, query, period, product, source, who]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: filtered.length };
    for (const s of ORDER_STATUSES) c[s] = 0;
    for (const o of filtered) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [filtered]);

  const shown = useMemo(() => {
    const rows = tab === 'all' ? filtered : filtered.filter((o) => o.status === tab);
    return newestFirst ? rows : [...rows].reverse();
  }, [filtered, tab, newestFirst]);

  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const at = Math.min(page, pages - 1);
  const slice = shown.slice(at * pageSize, at * pageSize + pageSize);
  // any filter change goes back to the first page
  useEffect(() => setPage(0), [tab, query, period, product, source, who, pageSize]);

  /** D-54: gives an application to someone at once (the row's "Mas'ul") */
  const assign = async (o: OrderRow, assignee: string) => {
    setAssigning(o.id);
    setAssignError(null);
    const r = await updateOrder(o, { assignee }, fetchImpl);
    setAssigning(null);
    if (!r.ok) return setAssignError(orderError(r.code));
    replace(r.value);
  };
  const cols = office ? 9 : 8;

  return (
    <section className="mgr-section" data-testid="mgr-orders">
      <header className="mgr-section-head">
        <div>
          <h2>Buyurtmalar</h2>
          {office ? (
            <p className="mgr-note">
              Saytdan va kiosklardan kelgan arizalar (Google Sheet «Arizalar»). Har arizani
              «Mas&apos;ul» ustunida operatorga bering — operator faqat o&apos;ziga berilganlarini
              ko&apos;radi. Holat va izoh jadvalga kim o&apos;zgartirgani bilan yoziladi.
            </p>
          ) : (
            <p className="mgr-note">
              Sizga berilgan arizalar. Mijozga qo&apos;ng&apos;iroq qilib, holat va izohni shu yerda
              yozing.
            </p>
          )}
        </div>
        <span className="mgr-inline">
          <Button
            variant="secondary"
            icon={<RefreshCw className="mgr-icon" aria-hidden />}
            onClick={() => void reload()}
            disabled={loading}
            data-testid="orders-reload"
          >
            Yangilash
          </Button>
          {sheetUrl && (
            <a
              className="btn btn-secondary"
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="orders-sheet"
            >
              <ExternalLink className="mgr-icon" aria-hidden />
              Google Sheetda ochish
            </a>
          )}
        </span>
      </header>
      {(error || assignError) && (
        <p className="mgr-error" role="alert">
          {error ?? assignError}
        </p>
      )}

      <div className="mgr-status-tabs" role="tablist" aria-label="Holat">
        {(['all', ...ORDER_STATUSES] as string[]).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={tab === s}
            className={tab === s ? 'active' : undefined}
            onClick={() => setTab(s)}
            data-testid={`orders-tab-${s === 'all' ? 'all' : ORDER_STATUSES.indexOf(s as (typeof ORDER_STATUSES)[number])}`}
          >
            {s === 'all' ? 'Hammasi' : s}
            <span className="mgr-tab-count">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="mgr-toolbar">
        <span className="mgr-search">
          <Search className="mgr-icon" aria-hidden />
          <input
            type="search"
            placeholder="Qidirish: ID, ism, telefon"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Qidirish"
            data-testid="orders-search"
          />
        </span>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          aria-label="Davr"
          data-testid="orders-period"
        >
          {PERIODS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          aria-label="Mahsulot"
          data-testid="orders-product"
        >
          <option value="all">Mahsulot: hammasi</option>
          {products.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as Source)}
          aria-label="Manba"
          data-testid="orders-source"
        >
          {(Object.keys(SOURCES) as Source[]).map((k) => (
            <option key={k} value={k}>
              {SOURCES[k]}
            </option>
          ))}
        </select>
        {office && (
          <select
            value={who}
            onChange={(e) => setWho(e.target.value)}
            aria-label="Mas'ul"
            data-testid="orders-who"
          >
            <option value="all">Mas&apos;ul: hammasi</option>
            <option value="none">Biriktirilmagan</option>
            {people.map((p) => (
              <option key={p.login} value={p.login}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mgr-card mgr-table-wrap">
        <table className="mgr-table mgr-orders-table">
          <thead>
            <tr>
              <th>ID</th>
              <th aria-sort={newestFirst ? 'descending' : 'ascending'}>
                <button
                  type="button"
                  className="mgr-sort"
                  onClick={() => setNewestFirst(!newestFirst)}
                  data-testid="orders-sort"
                >
                  Sana
                  {newestFirst ? (
                    <ChevronDown className="mgr-icon" aria-hidden />
                  ) : (
                    <ChevronUp className="mgr-icon" aria-hidden />
                  )}
                </button>
              </th>
              <th>Mijoz</th>
              <th>Mahsulot</th>
              <th>O&apos;lcham, mm</th>
              <th>Holat</th>
              {office && <th>Mas&apos;ul</th>}
              <th>Manba</th>
              <th aria-label="Ochish" />
            </tr>
          </thead>
          <tbody>
            {orders === null ? (
              <tr>
                <td colSpan={cols} className="mgr-empty">
                  {loading ? 'Yuklanmoqda…' : '—'}
                </td>
              </tr>
            ) : slice.length === 0 ? (
              <tr>
                <td colSpan={cols} className="mgr-empty">
                  {orders.length === 0
                    ? office
                      ? 'Hali ariza kelmagan.'
                      : 'Sizga hali ariza berilmagan.'
                    : 'Bu filtrlar bo‘yicha ariza yo‘q.'}
                </td>
              </tr>
            ) : (
              slice.map((o) => (
                <tr
                  key={`${o.ref}-${o.id}`}
                  className="mgr-row-open"
                  onClick={() => setOpen(o)}
                  data-testid={`orders-row-${o.id}`}
                >
                  <td className="mgr-order-id">{o.id}</td>
                  <td className="mgr-dim">{orderTime(o.createdAt).short}</td>
                  <td>
                    <span className="mgr-customer">
                      {customerName(o)}
                      <small>{orderPhone(o)}</small>
                    </span>
                  </td>
                  <td>
                    {o.product}
                    {o.quantity > 1 && <small className="mgr-dim"> × {o.quantity}</small>}
                  </td>
                  <td className="mgr-dim">{o.sizeMm}</td>
                  <td>
                    <StatusPill status={o.status} />
                  </td>
                  {office && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className="mgr-assign"
                        value={o.assignee}
                        disabled={assigning === o.id}
                        onChange={(e) => void assign(o, e.target.value)}
                        aria-label={`${o.id}: mas'ul`}
                        data-testid={`orders-assign-${o.id}`}
                      >
                        <AssigneeOptions people={people} current={o.assignee} />
                      </select>
                    </td>
                  )}
                  <td className="mgr-dim">{orderSource(o)}</td>
                  <td>
                    <button
                      type="button"
                      className="mgr-close"
                      aria-label={`${o.id}: ochish`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(o);
                      }}
                    >
                      <MoreHorizontal className="mgr-icon" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {shown.length > 0 && (
          <footer className="mgr-pager">
            <span className="mgr-inline">
              <span className="mgr-count" data-testid="orders-range">
                {at * pageSize + 1}–{Math.min(shown.length, (at + 1) * pageSize)} / {shown.length}{' '}
                ta
              </span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Sahifada"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} ta
                  </option>
                ))}
              </select>
            </span>
            <span className="mgr-inline mgr-pages">
              <button
                type="button"
                disabled={at === 0}
                onClick={() => setPage(at - 1)}
                aria-label="Oldingi sahifa"
              >
                <ChevronLeft className="mgr-icon" aria-hidden />
              </button>
              {Array.from({ length: pages }, (_, i) => i)
                .filter((i) => pages <= 7 || Math.abs(i - at) <= 2 || i === 0 || i === pages - 1)
                .map((i) => (
                  <button
                    key={i}
                    type="button"
                    className={i === at ? 'active' : undefined}
                    aria-current={i === at ? 'page' : undefined}
                    onClick={() => setPage(i)}
                  >
                    {i + 1}
                  </button>
                ))}
              <button
                type="button"
                disabled={at >= pages - 1}
                onClick={() => setPage(at + 1)}
                aria-label="Keyingi sahifa"
              >
                <ChevronRight className="mgr-icon" aria-hidden />
              </button>
            </span>
          </footer>
        )}
      </div>

      {open && (
        <OrderDrawer
          key={`${open.ref}-${open.id}`}
          order={open}
          office={office}
          people={people}
          fetchImpl={fetchImpl}
          onClose={() => setOpen(null)}
          onSaved={(o) => {
            replace(o);
            setOpen(o);
          }}
        />
      )}
    </section>
  );
}

/** the open application on the right: details, status, note (D-54: who has it) */
function OrderDrawer({
  order,
  office,
  people,
  fetchImpl,
  onClose,
  onSaved,
}: {
  order: OrderRow;
  /** D-54: the admin / a manager can give it to someone */
  office: boolean;
  people: Person[];
  fetchImpl?: typeof fetch;
  onClose: () => void;
  onSaved: (o: OrderRow) => void;
}) {
  const [status, setStatus] = useState(order.status);
  const [note, setNote] = useState(order.managerNote);
  const [assignee, setAssignee] = useState(order.assignee);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed =
    status !== order.status || note !== order.managerNote || assignee !== order.assignee;

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await updateOrder(
      order,
      {
        ...(status !== order.status ? { status } : {}),
        ...(note !== order.managerNote ? { managerNote: note } : {}),
        ...(office && assignee !== order.assignee ? { assignee } : {}),
      },
      fetchImpl,
    );
    setBusy(false);
    if (!r.ok) return setError(orderError(r.code));
    setSaved(true);
    onSaved(r.value);
  };

  const facts: [string, string][] = [
    ['Mahsulot', order.quantity > 1 ? `${order.product} × ${order.quantity}` : order.product],
    ["O'lcham, mm", order.sizeMm],
    ['Korpus', order.corpus],
    ['Eshik / fasad', order.door],
    ['Qismlar', order.sections],
    ['Manba', orderSource(order)],
    ...(order.orderId && order.orderId !== order.id
      ? ([['Buyurtma', `${order.orderId} (${order.orderItem})`]] as [string, string][])
      : []),
    [
      'Telegram',
      order.telegram === 'sent'
        ? 'Yuborilgan'
        : order.telegram === 'failed'
          ? 'Yuborilmagan'
          : 'Kutilmoqda',
    ],
    ['Oxirgi o‘zgartirgan', order.manager || '—'],
  ];

  return (
    <>
      <div className="mgr-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="mgr-drawer" role="dialog" aria-label={order.id} data-testid="order-drawer">
        <header className="mgr-drawer-head">
          <div>
            <h2>{order.id}</h2>
            <small>{orderTime(order.createdAt).short}</small>
          </div>
          <button type="button" className="mgr-close" onClick={onClose} aria-label="Yopish">
            <X className="mgr-icon" aria-hidden />
          </button>
        </header>
        <div className="mgr-drawer-body mgr-order-body">
          <div className="mgr-card mgr-order-customer">
            <strong>{customerName(order)}</strong>
            <a href={`tel:${order.phone.replace(/[^\d+]/g, '')}`}>{orderPhone(order)}</a>
          </div>
          <dl className="mgr-facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || '—'}</dd>
              </div>
            ))}
          </dl>
          {order.pdfPath && (
            <a
              className="btn btn-secondary"
              href={order.pdfPath}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="order-pdf"
            >
              <FileText className="mgr-icon" aria-hidden />
              Yig&apos;ish yo&apos;riqnomasi (PDF)
            </a>
          )}
          {office && (
            <label className="mgr-field">
              <span>Mas&apos;ul (kim qo&apos;ng&apos;iroq qiladi)</span>
              <select
                value={assignee}
                onChange={(e) => {
                  setAssignee(e.target.value);
                  setSaved(false);
                }}
                data-testid="order-assignee"
              >
                <AssigneeOptions people={people} current={order.assignee} />
              </select>
            </label>
          )}
          <label className="mgr-field">
            <span>Holat</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setSaved(false);
              }}
              data-testid="order-status"
            >
              {/* an old value typed in the sheet by hand stays visible */}
              {!(ORDER_STATUSES as readonly string[]).includes(order.status) && (
                <option value={order.status}>{order.status}</option>
              )}
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="mgr-field">
            <span>Menejer izohi</span>
            <textarea
              rows={4}
              maxLength={1000}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setSaved(false);
              }}
              placeholder="Masalan: o'lchovga 26-noyabr, 15:00"
              data-testid="order-note"
            />
          </label>
          {error && (
            <p className="mgr-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="mgr-drawer-foot">
          <p className="mgr-note">{saved ? 'Jadvalga yozildi' : 'Google Sheetga yoziladi'}</p>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={busy || !changed}
            data-testid="order-save"
          >
            {busy ? 'Saqlanmoqda…' : 'Saqlash'}
          </Button>
        </footer>
      </aside>
    </>
  );
}
