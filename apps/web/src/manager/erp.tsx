import { hardwareV1, type PriceList } from '@dafna/engine';
import { createContext, useContext, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import { EDGE_BAND_KEY, defaultSheet } from './model';

/**
 * D-30: Dafna's 1C on the manager page. Dafna takes only part of 1C (laminate, chipboard, some
 * hardware): the manager searches 1C next to a "1C kodi" field and links that item; the
 * "1C narxlarini olish" button then pulls the current price of every linked item into the
 * fields (saved with "Saqlash" as usual).
 */
export const ERP_URL = '/api/erp';

export interface ErpItem {
  key: string;
  name: string;
  article: string;
  unit: string;
  /** D-32: the item's kind path in 1C (a search within a group) */
  kind?: string;
}

/** D-32: what a search looks for: materials or hardware (hinges / slides only) */
export type KindGroup = 'material' | 'hardware' | 'other';
export interface SearchScope {
  group?: 'material' | 'hardware';
  sub?: 'hinge' | 'slide';
}
export interface ErpPrice {
  name: string;
  unit: string;
  price: number | null;
  currency: string | null;
  stock: number | null;
}

export type ErpOutcome<T> = { ok: true; value: T } | { ok: false; code: string };

async function post<T>(
  pin: string,
  body: unknown,
  pick: (d: Record<string, unknown>) => T | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<ErpOutcome<T>> {
  try {
    const res = await fetchImpl(ERP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-manager-pin': pin },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const value = data ? pick(data) : undefined;
    if (res.ok && value !== undefined) return { ok: true, value };
    const code = (data?.error as { code?: string } | undefined)?.code;
    return { ok: false, code: code ?? 'network' };
  } catch {
    return { ok: false, code: 'network' };
  }
}

export interface ErpKindRow {
  key: string;
  name: string;
  folder: boolean;
  /** D-32: top kinds only - the default group by name */
  group?: KindGroup;
}
export type ErpItemRow = ErpItem & Omit<ErpPrice, 'name' | 'unit'>;

export interface ErpApi {
  search: (q: string, scope?: SearchScope) => Promise<ErpOutcome<ErpItem[]>>;
  prices: (articles: string[]) => Promise<ErpOutcome<Record<string, ErpPrice>>>;
  /** D-34: the eman.uz picture of each article (null = none) */
  pictures: (articles: string[]) => Promise<ErpOutcome<Record<string, string | null>>>;
  /** D-34: copies the eman.uz picture of an article into our photo store */
  copyPicture: (article: string) => Promise<ErpOutcome<string>>;
  /** D-31: the kinds under a kind folder ('' = the top) */
  kinds: (parent: string) => Promise<ErpOutcome<ErpKindRow[]>>;
  /** D-31: a page of the items of a kind, with price and stock */
  items: (
    kind: string,
    skip: number,
  ) => Promise<ErpOutcome<{ items: ErpItemRow[]; total: number }>>;
}

export function erpApi(
  pin: string,
  fetchImpl?: typeof fetch,
  /** D-32: the manager's group of each top 1C kind */
  groups: Record<string, KindGroup> = {},
): ErpApi {
  return {
    search: (q, scope) =>
      post(
        pin,
        scope?.group ? { action: 'search', q, ...scope, groups } : { action: 'search', q },
        (d) => d.items as ErpItem[] | undefined,
        fetchImpl,
      ),
    prices: (articles) =>
      post(
        pin,
        { action: 'prices', articles },
        (d) => d.prices as Record<string, ErpPrice> | undefined,
        fetchImpl,
      ),
    pictures: (articles) =>
      post(
        pin,
        { action: 'pictures', articles },
        (d) => d.pictures as Record<string, string | null> | undefined,
        fetchImpl,
      ),
    copyPicture: (article) =>
      post(
        pin,
        { action: 'copyPicture', q: article },
        (d) => (typeof d.url === 'string' ? d.url : undefined),
        fetchImpl,
      ),
    kinds: (parent) =>
      post(
        pin,
        parent ? { action: 'kinds', parent } : { action: 'kinds' },
        (d) => d.kinds as ErpKindRow[] | undefined,
        fetchImpl,
      ),
    items: (kind, skip) =>
      post(
        pin,
        { action: 'items', kind, skip },
        (d) =>
          Array.isArray(d.items)
            ? { items: d.items as ErpItemRow[], total: Number(d.total ?? 0) }
            : undefined,
        fetchImpl,
      ),
  };
}

export const ErpContext = createContext<ErpApi | null>(null);

export const ERP_ERRORS: Record<string, string> = {
  erp_not_configured: "1C ulanmagan: Vercel'da EMAN_1C_TOKEN qo'shilmagan",
  erp_unavailable: "1C javob bermadi, keyinroq urinib ko'ring",
  rate_limited: "Juda ko'p so'rov: biroz kuting",
  wrong_pin: "PIN noto'g'ri",
  network: "Internet yoki server bilan aloqa yo'q",
};
const errText = (code: string) => ERP_ERRORS[code] ?? ERP_ERRORS.network!;

const SCOPE_LABEL: Record<string, string> = {
  material: 'materiallar',
  hardware: 'furnitura',
  hinge: 'petlyalar',
  slide: "yo'naltiruvchilar",
};

/** "1C kodi" field with a "1C dan topish" button (a search over 1C's items) */
export function ErpCodeInput({
  value,
  onChange,
  testId,
  label,
  scope,
}: {
  value: string;
  onChange: (article: string) => void;
  testId?: string;
  label?: string;
  /** D-32: the search looks only here (the Materials page: materials, …) */
  scope?: SearchScope;
}) {
  const api = useContext(ErpContext);
  const [open, setOpen] = useState(false);
  return (
    <span className="mgr-erp-wrap">
      <input
        type="text"
        className="mgr-erp"
        value={value}
        placeholder="—"
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        data-testid={testId}
      />
      {api && (
        <button
          type="button"
          className="mgr-erp-find"
          onClick={() => setOpen(true)}
          data-testid={testId ? `${testId}-find` : undefined}
        >
          1C
        </button>
      )}
      {open && api && (
        <ErpPicker
          api={api}
          scope={scope}
          onPick={(a) => {
            onChange(a);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

function ErpPicker({
  api,
  scope,
  onPick,
  onClose,
}: {
  api: ErpApi;
  scope?: SearchScope;
  onPick: (article: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ErpItem[] | null>(null);
  const find = async (e: FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    const r = await api.search(q.trim(), scope);
    setBusy(false);
    if (!r.ok) return setError(errText(r.code));
    setItems(r.value);
  };
  return (
    <div className="mgr-modal" role="dialog" aria-label="1C dan topish" data-testid="erp-picker">
      <div className="mgr-card mgr-modal-card">
        <header className="mgr-modal-head">
          <h3>
            1C dan topish
            {scope?.group && (
              <small className="mgr-sub" data-testid="erp-scope">
                {' '}
                · faqat {SCOPE_LABEL[scope.sub ?? scope.group]}
              </small>
            )}
          </h3>
          <Button variant="secondary" onClick={onClose}>
            Yopish
          </Button>
        </header>
        <form className="mgr-toolbar" onSubmit={find}>
          <input
            type="search"
            autoFocus
            value={q}
            placeholder="Nomi yoki artikul: masalan «ЛДСП 16 белый», «MASTER 18MM»"
            onChange={(e) => setQ(e.target.value)}
            data-testid="erp-q"
          />
          <Button variant="primary" type="submit" disabled={busy || q.trim().length < 2}>
            {busy ? 'Qidirilmoqda…' : 'Qidirish'}
          </Button>
        </form>
        {error && (
          <p className="mgr-error" role="alert">
            {error}
          </p>
        )}
        {items && items.length === 0 && <p className="mgr-note">Hech narsa topilmadi.</p>}
        {items && items.length > 0 && (
          <ul className="mgr-erp-list">
            {items.map((it) => (
              <li key={it.key}>
                <button
                  type="button"
                  disabled={!it.article}
                  onClick={() => onPick(it.article)}
                  data-testid={`erp-item-${it.article}`}
                >
                  <span>{it.name}</span>
                  <small>
                    {it.article ? `artikul ${it.article}` : "artikuli yo'q"}
                    {it.unit && ` · ${it.unit}`}
                    {it.kind && ` · ${it.kind}`}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const SOM = /сум|sum|so'?m|uzs/i;
const USD = /usd|доллар|dollar|\$/i;
const PER_M2 = /м2|м²|m2|m²|кв/i;

export interface ErpApplyResult {
  list: PriceList;
  updated: string[];
  notFound: string[];
  noPrice: string[];
  /** a currency the page cannot turn into so'm (USD without a rate, unknown) */
  currency: string[];
}

/**
 * D-30: the 1C prices of every linked item into the price list: hardware per unit, the edge band
 * per metre, boards per sheet (a price per m² is turned into the sheet price). USD becomes so'm
 * with the list's usdRate; other currencies are left alone.
 */
export function applyErpPrices(
  list: PriceList,
  prices: Record<string, ErpPrice>,
  hardwareIds: ReadonlySet<string> = new Set(hardwareV1.items.map((i) => i.id)),
): ErpApplyResult {
  const out: ErpApplyResult = { list, updated: [], notFound: [], noPrice: [], currency: [] };
  let next: PriceList = { ...list, hardware: { ...list.hardware } };
  for (const [id, article] of Object.entries(list.erpCodes ?? {})) {
    if (!article) continue;
    const p = prices[article];
    if (!p) {
      out.notFound.push(id);
      continue;
    }
    if (p.price === null || p.price <= 0) {
      out.noPrice.push(id);
      continue;
    }
    let som: number | null = null;
    if (p.currency && SOM.test(p.currency)) som = p.price;
    else if (p.currency && USD.test(p.currency) && list.usdRate) som = p.price * list.usdRate;
    if (som === null) {
      out.currency.push(id);
      continue;
    }
    som = Math.round(som);
    if (id === EDGE_BAND_KEY) next = { ...next, edgePerM: som };
    else if (hardwareIds.has(id)) next.hardware[id] = som;
    else {
      const sheet = next.boardSheets?.[id] ?? { price: 0, ...defaultSheet(id) };
      const price = PER_M2.test(p.unit)
        ? Math.round((som * sheet.lengthMm * sheet.widthMm) / 1e6)
        : som;
      next = { ...next, boardSheets: { ...next.boardSheets, [id]: { ...sheet, price } } };
    }
    out.updated.push(id);
  }
  out.list = next;
  return out;
}

/** D-34: the eman.uz pictures of the shown 1C articles (loaded after the list) */
export function usePictures(articles: string[]): Record<string, string | null> {
  const api = useContext(ErpContext);
  const [pics, setPics] = useState<Record<string, string | null>>({});
  const key = articles.filter(Boolean).join('|');
  useEffect(() => {
    if (!api || !key) return;
    let live = true;
    void api.pictures(key.split('|').slice(0, 60)).then((r) => {
      if (live && r.ok) setPics((p) => ({ ...p, ...r.value }));
    });
    return () => {
      live = false;
    };
  }, [api, key]);
  return pics;
}

/** D-34: a small picture of a 1C item from eman.uz (nothing when it has none) */
export function ErpThumb({ src, alt }: { src: string | null | undefined; alt: string }) {
  if (!src) return <span className="mgr-thumb mgr-thumb-empty" aria-hidden="true" />;
  return <img className="mgr-thumb" src={src} alt={alt} loading="lazy" />;
}

/** D-34: "take the eman.uz picture" in the add forms; returns the stored URL or undefined */
export function PictureChoice({
  src,
  take,
  setTake,
}: {
  src: string | null | undefined;
  take: boolean;
  setTake: (v: boolean) => void;
}) {
  if (!src) return <p className="mgr-note">eman.uz da bu mahsulotning rasmi yo&apos;q.</p>;
  return (
    <label className="mgr-inline mgr-pic-choice">
      <img className="mgr-pic" src={src} alt="" />
      <span>
        <input
          type="checkbox"
          checked={take}
          onChange={(e) => setTake(e.target.checked)}
          data-testid="erp-take-picture"
        />{' '}
        eman.uz dagi rasmini olish
      </span>
    </label>
  );
}
