import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { StatusPill, useOrders } from './OrdersSection';
import {
  customerName,
  orderPhone,
  orderSource,
  orderTime,
  tashkentDay,
  type OrderRow,
} from './ordersApi';

const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

/** "Seshanba, 24-noyabr" and the greeting by the Tashkent hour */
export function uzToday(now = new Date()) {
  const t = new Date(now.getTime() + 5 * 3_600_000); // Tashkent = UTC+5, no DST
  const hour = t.getUTCHours();
  return {
    date: `${WEEKDAYS[t.getUTCDay()]}, ${t.getUTCDate()}-${MONTHS[t.getUTCMonth()]}`,
    greeting: hour < 11 ? 'Xayrli tong' : hour < 18 ? 'Xayrli kun' : 'Xayrli kech',
  };
}

/** "2 soat oldin" / "3 kun oldin" from a Tashkent timestamp */
function ago(createdAt: string, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(createdAt);
  if (!m) return '';
  const at = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) - 5 * 3_600_000;
  const min = Math.max(0, Math.round((now.getTime() - at) / 60_000));
  if (min < 60) return `${min} daqiqa oldin`;
  if (min < 24 * 60) return `${Math.round(min / 60)} soat oldin`;
  return `${Math.round(min / (24 * 60))} kun oldin`;
}

/**
 * D-47 "Bosh sahifa" (Figma "Admin / Bosh sahifa"): today's applications at a glance - four
 * counters, today's list (the latest ones when none came today) and the last 30 days by product
 * and source. Everything is read from the Google Sheet "Arizalar"; a row opens it in
 * "Buyurtmalar". (The Figma "Oxirgi o'zgarishlar" feed needs a change log that is not kept yet.)
 */
export function HomeSection({
  userName,
  fetchImpl,
  onOpenOrders,
}: {
  userName: string;
  fetchImpl?: typeof fetch;
  /** "Hammasi" (no id) or a row (its id) -> "Buyurtmalar" */
  onOpenOrders: (id?: string) => void;
}) {
  const { orders, error } = useOrders(fetchImpl);
  const { date, greeting } = uzToday();

  const stats = useMemo(() => {
    const list = orders ?? [];
    const today = tashkentDay();
    const yesterday = tashkentDay(new Date(), -1);
    const since30 = tashkentDay(new Date(), -29);
    const day = (o: OrderRow) => orderTime(o.createdAt).day;
    const fresh = list.filter((o) => o.status === 'Yangi');
    const todays = list.filter((o) => day(o) === today);
    const month = list.filter((o) => day(o) >= since30);
    const tally = (key: (o: OrderRow) => string) => {
      const m = new Map<string, number>();
      for (const o of month) m.set(key(o), (m.get(key(o)) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return {
      today: todays.length,
      yesterday: list.filter((o) => day(o) === yesterday).length,
      fresh: fresh.length,
      // the list is newest first: the oldest unanswered one is the last
      oldestFresh: fresh.at(-1),
      confirmed: list.filter((o) => o.status === 'Tasdiqlandi').length,
      production: list.filter((o) => o.status === 'Ishlab chiqarishga berildi').length,
      todays,
      latest: todays.length > 0 ? todays : list.slice(0, 8),
      monthTotal: month.length,
      byProduct: tally((o) => o.product || '—'),
      bySource: tally((o) => (o.kiosk ? 'Kiosk' : 'Sayt')),
    };
  }, [orders]);

  const first = userName.split(/\s+/)[0] ?? userName;
  const cards: { label: string; value: number; sub: string; tone: string; id: string }[] = [
    {
      id: 'today',
      label: 'Bugungi arizalar',
      value: stats.today,
      sub: `kecha: ${stats.yesterday}`,
      tone: 'info',
    },
    {
      id: 'fresh',
      label: "Qo'ng'iroq kutmoqda (Yangi)",
      value: stats.fresh,
      sub: stats.oldestFresh
        ? `eng eskisi ${ago(stats.oldestFresh.createdAt)}`
        : 'hammasiga javob berilgan',
      tone: 'warn',
    },
    {
      id: 'confirmed',
      label: 'Tasdiqlandi',
      value: stats.confirmed,
      sub: 'ishlab chiqarishga berilmagan',
      tone: 'accent',
    },
    {
      id: 'production',
      label: 'Ishlab chiqarishda',
      value: stats.production,
      sub: 'holati «Ishlab chiqarishga berildi»',
      tone: 'ok',
    },
  ];

  return (
    <section className="mgr-section" data-testid="mgr-home">
      <header className="mgr-section-head">
        <div>
          <h2>
            {greeting}, {first}
          </h2>
          <p className="mgr-note">{date}</p>
        </div>
      </header>
      {error && (
        <p className="mgr-error" role="alert">
          {error}
        </p>
      )}
      <div className="mgr-stats">
        {cards.map((c) => (
          <div key={c.id} className="mgr-card mgr-stat" data-testid={`home-stat-${c.id}`}>
            <span className="mgr-stat-label">
              <i data-tone={c.tone} aria-hidden="true" />
              {c.label}
            </span>
            <strong>{orders === null ? '…' : c.value}</strong>
            <small>{orders === null ? '' : c.sub}</small>
          </div>
        ))}
      </div>
      <div className="mgr-home-grid">
        <div className="mgr-card mgr-table-wrap">
          <header className="mgr-card-head">
            <h3>
              {stats.todays.length > 0 || orders === null
                ? 'Bugungi buyurtmalar'
                : 'Oxirgi buyurtmalar'}
            </h3>
            <button
              type="button"
              className="mgr-link"
              onClick={() => onOpenOrders()}
              data-testid="home-all-orders"
            >
              Hammasi <ArrowRight className="mgr-icon" aria-hidden />
            </button>
          </header>
          <table className="mgr-table mgr-orders-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Mijoz</th>
                <th>Mahsulot</th>
                <th>Holat</th>
                <th className="mgr-num">{stats.todays.length > 0 ? 'Vaqt' : 'Sana'}</th>
              </tr>
            </thead>
            <tbody>
              {orders === null ? (
                <tr>
                  <td colSpan={5} className="mgr-empty">
                    Yuklanmoqda…
                  </td>
                </tr>
              ) : stats.latest.length === 0 ? (
                <tr>
                  <td colSpan={5} className="mgr-empty">
                    Hali ariza kelmagan.
                  </td>
                </tr>
              ) : (
                stats.latest.map((o) => (
                  <tr
                    key={`${o.ref}-${o.id}`}
                    className="mgr-row-open"
                    onClick={() => onOpenOrders(o.id)}
                    data-testid={`home-row-${o.id}`}
                  >
                    <td className="mgr-order-id">{o.id}</td>
                    <td>
                      <span className="mgr-customer">
                        {customerName(o)}
                        <small>{orderPhone(o)}</small>
                      </span>
                    </td>
                    <td>{o.product}</td>
                    <td>
                      <StatusPill status={o.status} />
                    </td>
                    <td className="mgr-num mgr-dim">
                      {stats.todays.length > 0
                        ? orderTime(o.createdAt).time
                        : orderTime(o.createdAt).short}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mgr-card mgr-home-side" data-testid="home-month">
          <header className="mgr-card-head">
            <h3>Oxirgi 30 kun</h3>
            <span className="mgr-count">{stats.monthTotal} ta ariza</span>
          </header>
          <MiniBars title="Mahsulot bo'yicha" rows={stats.byProduct} total={stats.monthTotal} />
          <MiniBars title="Manba bo'yicha" rows={stats.bySource} total={stats.monthTotal} />
          {stats.latest[0] && (
            <p className="mgr-note">
              Oxirgi ariza: {orderTime(stats.latest[0].createdAt).short},{' '}
              {orderSource(stats.latest[0])}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function MiniBars({
  title,
  rows,
  total,
}: {
  title: string;
  rows: [string, number][];
  total: number;
}) {
  return (
    <div className="mgr-bars">
      <p className="mgr-nav-title">{title}</p>
      {rows.length === 0 ? (
        <p className="mgr-note">—</p>
      ) : (
        rows.map(([k, n]) => (
          <div key={k} className="mgr-bar">
            <span>{k}</span>
            <span className="mgr-bar-track" aria-hidden="true">
              <span style={{ width: `${total ? Math.round((n / total) * 100) : 0}%` }} />
            </span>
            <strong>{n}</strong>
          </div>
        ))
      )}
    </div>
  );
}
