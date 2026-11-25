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

/** the applications, loaded once per visit of a section ("Yangilash" loads them again) */
export function useOrders(fetchImpl?: typeof fetch) {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
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
  };
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchImpl]);
  const replace = (o: OrderRow) =>
    setOrders((list) => list?.map((x) => (x.ref === o.ref && x.id === o.id ? o : x)) ?? null);
  return { orders, sheetUrl, error, loading, reload, replace };
}

/**
 * D-47 "Buyurtmalar" (Figma "Admin / Buyurtmalar"): the applications of the Google Sheet
 * "Arizalar" - tabs by status, search, period / product / source filters, pages; a row opens a
 * drawer with the details, the status and the manager's note (saved to the sheet with the
 * manager's name). The sheet stays the store: nothing is copied anywhere else.
 */
export function OrdersSection({
  fetchImpl,
  openId,
  onOpened,
}: {
  fetchImpl?: typeof fetch;
  /** an order to open at once ("Bosh sahifa" row) */
  openId?: string | null;
  onOpened?: () => void;
}) {
  const { orders, sheetUrl, error, loading, reload, replace } = useOrders(fetchImpl);
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
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        customerName(o).toLowerCase().includes(q) ||
        (digits.length >= 3 && o.phone.replace(/\D/g, '').includes(digits))
      );
    });
  }, [orders, query, period, product, source]);

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
  useEffect(() => setPage(0), [tab, query, period, product, source, pageSize]);

  return (
    <section className="mgr-section" data-testid="mgr-orders">
      <header className="mgr-section-head">
        <div>
          <h2>Buyurtmalar</h2>
          <p className="mgr-note">
            Saytdan va kiosklardan kelgan arizalar (Google Sheet «Arizalar»). Holat va izoh shu
            yerda o&apos;zgartiriladi — jadvalga kim o&apos;zgartirgani bilan yoziladi.
          </p>
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
      {error && (
        <p className="mgr-error" role="alert">
          {error}
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
              <th>Menejer</th>
              <th>Manba</th>
              <th aria-label="Ochish" />
            </tr>
          </thead>
          <tbody>
            {orders === null ? (
              <tr>
                <td colSpan={9} className="mgr-empty">
                  {loading ? 'Yuklanmoqda…' : '—'}
                </td>
              </tr>
            ) : slice.length === 0 ? (
              <tr>
                <td colSpan={9} className="mgr-empty">
                  {orders.length === 0
                    ? 'Hali ariza kelmagan.'
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
                  <td>{o.manager || '—'}</td>
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

/** the open application on the right: details, status, note */
function OrderDrawer({
  order,
  fetchImpl,
  onClose,
  onSaved,
}: {
  order: OrderRow;
  fetchImpl?: typeof fetch;
  onClose: () => void;
  onSaved: (o: OrderRow) => void;
}) {
  const [status, setStatus] = useState(order.status);
  const [note, setNote] = useState(order.managerNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed = status !== order.status || note !== order.managerNote;

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await updateOrder(
      order,
      {
        ...(status !== order.status ? { status } : {}),
        ...(note !== order.managerNote ? { managerNote: note } : {}),
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
