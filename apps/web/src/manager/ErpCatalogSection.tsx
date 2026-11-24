import { type PriceList } from '@dafna/engine';
import { useContext, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import {
  ERP_ERRORS,
  ErpContext,
  ErpThumb,
  PictureChoice,
  usePictures,
  type ErpApi,
  type KindGroup,
} from './erp';
import {
  NEW_HARDWARE,
  NEW_MATERIAL,
  money,
  type CatalogDraft,
  type HardwareDraft,
  type MaterialDraft,
} from './model';

/**
 * D-31 "1C katalogi": the whole of Dafna's 1C (eman_materials) by kind (ЛДСП, ЛМДФ, Кромка, …),
 * with price and stock. The manager marks what the kiosk shows: "Kioskga qo'shish" turns a 1C
 * board into a material (LDSP / MDF) or a 1C hinge / slide into a hardware brand of the kiosk,
 * linked to its 1C article and priced from 1C; "Kioskdan olish" hides it again (nothing is
 * ever deleted, so stored applications regenerate).
 */
export interface ErpKind {
  key: string;
  name: string;
  folder: boolean;
  /** D-32: top kinds only - the default group by name */
  group?: KindGroup;
}
export interface ErpRow {
  key: string;
  name: string;
  article: string;
  unit: string;
  price: number | null;
  currency: string | null;
  stock: number | null;
}

type AddKind = 'ldsp' | 'mdf' | 'hinge' | 'slide';
const ADD_LABEL: Record<AddKind, string> = {
  ldsp: 'Plita: LDSP',
  mdf: 'Plita: MDF / LMDF',
  hinge: 'Petlya',
  slide: "Yo'naltiruvchi",
};
const THICKNESS = [16, 16.7, 18, 22, 25];
const PAGE = 50;

/** D-31: a first guess of what a 1C item is, from its name */
export function guessFromName(name: string): {
  kind: AddKind;
  thicknessMm: number;
  brand: string;
  softClose: boolean;
  group: 'wood' | 'plain';
  sheet: { lengthMm: number; widthMm: number };
} {
  const n = name.toLowerCase();
  const kind: AddKind = /петл|hinge/.test(n)
    ? 'hinge'
    : /направляющ|slide/.test(n)
      ? 'slide'
      : /мдф|mdf/.test(n) && !/лдсп/.test(n)
        ? 'mdf'
        : 'ldsp';
  const t = Number((/(\d{1,2}(?:[.,]\d)?)\s*мм/i.exec(name)?.[1] ?? '16').replace(',', '.'));
  const thicknessMm = THICKNESS.includes(t) ? t : 16;
  const BRANDS: [RegExp, string][] = [
    [/кроностар|kronostar/i, 'Kronostar'],
    [/эггер|egger/i, 'Egger'],
    [/кастамону|kastamonu/i, 'Kastamonu'],
    [/кроноспан|kronospan/i, 'Kronospan'],
    [/свисс\s*крон|swiss\s*krono/i, 'Swiss Krono'],
    [/ультрадекор|ultradecor/i, 'Ultradecor'],
    [/старвуд|starwood/i, 'Starwood'],
    [/деконекст|deconext/i, 'Deconext'],
    [/samet|самет/i, 'Samet'],
    [/camet|камет/i, 'Camet'],
    [/hettich|хеттих/i, 'Hettich'],
    [/blum|блюм/i, 'Blum'],
    [/master/i, 'Samet'],
  ];
  const brand = BRANDS.find(([re]) => re.test(name))?.[1] ?? '';
  const softClose = /доводчик|soft\s*close/i.test(name);
  const group = /дуб|орех|ясень|клён|клен|вяз|сосна|бук|oak|wood|walnut/i.test(name)
    ? 'wood'
    : 'plain';
  // the sheet size from the 1C name: "5,0325" m² = 2750 × 1830, "5,796" = 2800 × 2070, …
  const sheet = /5[.,]796|2800\s*[*x×]\s*2070|2[.,]8\s*[*x×]\s*2[.,]07/i.test(name)
    ? { lengthMm: 2800, widthMm: 2070 }
    : /5[.,]0325|2750\s*[*x×]\s*1830/i.test(name)
      ? { lengthMm: 2750, widthMm: 1830 }
      : /4[.,]575|2500\s*[*x×]\s*1830/i.test(name)
        ? { lengthMm: 2500, widthMm: 1830 }
        : /2[.,]8\s*[*x×]\s*1[.,]22|2800\s*[*x×]\s*1220/i.test(name)
          ? { lengthMm: 2800, widthMm: 1220 }
          : { lengthMm: 2800, widthMm: 2070 };
  return { kind, thicknessMm, brand, softClose, group, sheet };
}

/** the 1C name without the sheet area / size noise, for the kiosk */
export function cleanName(name: string): string {
  // D-37: "ЛДСП" (the usual board) is dropped; "ЛМДФ" / "МДФ" stay - 1C has the same decor as
  // both (e.g. Ультрадекор Железный камень), and an MDF board is not a pedestal / desk carcass
  return name
    .replace(/^(лдсп|дсп)\s+/i, '')
    .replace(/\s*\d[.,]\d{2,4}(\s*кв)?\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** so'm per sheet (boards) or per unit (hardware) from a 1C price */
export function somPrice(
  r: Pick<ErpRow, 'price' | 'currency' | 'unit'>,
  list: PriceList,
  sheet?: { lengthMm: number; widthMm: number },
): number | undefined {
  if (r.price === null || r.price <= 0) return undefined;
  let v: number | undefined;
  if (!r.currency || /сум|sum|uzs|so'?m/i.test(r.currency)) v = r.price;
  else if (/usd|доллар|\$/i.test(r.currency) && list.usdRate) v = r.price * list.usdRate;
  if (v === undefined) return undefined;
  if (sheet && /м2|м²|m2|кв/i.test(r.unit)) v = (v * sheet.lengthMm * sheet.widthMm) / 1e6;
  return Math.round(v);
}

type Tab = 'all' | KindGroup;
const TABS: { id: Tab; label: string }[] = [
  { id: 'material', label: 'Materiallar' },
  { id: 'hardware', label: 'Furnitura' },
  { id: 'other', label: 'Boshqa' },
  { id: 'all', label: 'Hammasi' },
];

export function ErpCatalogSection({
  list,
  draft,
  setDraft,
}: {
  list: PriceList;
  draft: CatalogDraft;
  setDraft: (d: CatalogDraft) => void;
}) {
  const api = useContext(ErpContext);
  /** D-32: the root kinds by group (materials first: that is what Dafna takes most) */
  const [tab, setTab] = useState<Tab>('material');
  const groupOfKind = (k: ErpKind): KindGroup => list.erpKindGroups?.[k.key] ?? k.group ?? 'other';
  const [path, setPath] = useState<ErpKind[]>([]);
  const [kinds, setKinds] = useState<ErpKind[] | null>(null);
  const [rows, setRows] = useState<ErpRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<ErpRow | null>(null);

  const leaf = path.at(-1);
  // D-34: eman.uz pictures of the rows shown
  const pics = usePictures((rows ?? []).map((r) => r.article));

  useEffect(() => {
    if (!api) return;
    // a search result has no kind to load
    if (leaf && !leaf.folder && !leaf.key) return;
    let live = true;
    void (async () => {
      setBusy(true);
      setError(null);
      if (!leaf || leaf.folder) {
        const r = await api.kinds(leaf?.key ?? '');
        if (!live) return;
        setBusy(false);
        if (!r.ok) return setError(ERP_ERRORS[r.code] ?? ERP_ERRORS.network!);
        setKinds(r.value);
        setRows(null);
      } else {
        const r = await api.items(leaf.key, skip);
        if (!live) return;
        setBusy(false);
        if (!r.ok) return setError(ERP_ERRORS[r.code] ?? ERP_ERRORS.network!);
        setRows(r.value.items);
        setTotal(r.value.total);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, leaf?.key, skip]);

  if (!api)
    return (
      <section className="mgr-section">
        <p className="mgr-note">1C ulanmagan.</p>
      </section>
    );

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    setError(null);
    const r = await api.search(
      query.trim(),
      tab === 'material' || tab === 'hardware' ? { group: tab } : undefined,
    );
    if (!r.ok) {
      setBusy(false);
      return setError(ERP_ERRORS[r.code] ?? ERP_ERRORS.network!);
    }
    const prices = await api.prices(r.value.map((i) => i.article).filter(Boolean));
    setBusy(false);
    setPath([{ key: '', name: `Qidiruv: «${query.trim()}»`, folder: false }]);
    setRows(
      r.value.map((i) => {
        const p = prices.ok ? prices.value[i.article] : undefined;
        return {
          ...i,
          price: p?.price ?? null,
          currency: p?.currency ?? null,
          stock: p?.stock ?? null,
        };
      }),
    );
    setTotal(r.value.length);
  };

  /** our item linked to a 1C article: saved (price list) or just added (draft) */
  const linkOf = (article: string) => {
    if (!article) return null;
    const id = Object.entries(list.erpCodes ?? {}).find(([, a]) => a === article)?.[0];
    const m = draft.materials.findIndex((x) => (id && x.id === id) || x.erpArticle === article);
    if (m >= 0)
      return { type: 'material' as const, index: m, visible: draft.materials[m]!.visible };
    const h = draft.hardware.findIndex((x) => (id && x.id === id) || x.erpArticle === article);
    if (h >= 0) return { type: 'hardware' as const, index: h, visible: draft.hardware[h]!.visible };
    return id ? { type: 'builtin' as const, index: -1, visible: true } : null;
  };

  const setVisible = (l: NonNullable<ReturnType<typeof linkOf>>, visible: boolean) => {
    if (l.type === 'material')
      setDraft({
        ...draft,
        materials: draft.materials.map((m, i) => (i === l.index ? { ...m, visible } : m)),
      });
    if (l.type === 'hardware')
      setDraft({
        ...draft,
        hardware: draft.hardware.map((h, i) => (i === l.index ? { ...h, visible } : h)),
      });
  };

  return (
    <section className="mgr-section" data-testid="mgr-erp-catalog">
      <header className="mgr-section-head">
        <div>
          <h2>1C katalogi</h2>
          <p className="mgr-note">
            EMAN 1C dagi hamma mahsulot (narxi va qoldig&apos;i bilan). Kioskda chiqishi kerak
            bo&apos;lgan plita, petlya yoki yo&apos;naltiruvchini «Kioskga qo&apos;shish» bilan
            belgilang — u 1C artikuli va narxi bilan qo&apos;shiladi. «Saqlash»ni bosishni unutmang.
          </p>
        </div>
      </header>

      {/* D-32: materials / hardware / other, as the manager grouped the 1C kinds */}
      <div className="segmented mgr-tabs" role="tablist" aria-label="1C guruhlari">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'segment active' : 'segment'}
            onClick={() => {
              setTab(t.id);
              setPath([]);
              setSkip(0);
            }}
            data-testid={`erp-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form className="mgr-toolbar" onSubmit={search}>
        <input
          type="search"
          placeholder="1C dan qidirish: nomi yoki artikul"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="erp-cat-q"
        />
        <Button variant="secondary" type="submit" disabled={busy || query.trim().length < 2}>
          Qidirish
        </Button>
      </form>

      <nav className="mgr-crumbs" aria-label="1C turlari">
        <button
          type="button"
          onClick={() => {
            setPath([]);
            setSkip(0);
          }}
        >
          Hammasi
        </button>
        {path.map((k, i) => (
          <button
            key={`${k.key}-${i}`}
            type="button"
            onClick={() => {
              setPath(path.slice(0, i + 1));
              setSkip(0);
            }}
          >
            › {k.name}
          </button>
        ))}
      </nav>

      {error && (
        <p className="mgr-error" role="alert">
          {error}
        </p>
      )}
      {busy && <p className="mgr-note">Yuklanmoqda…</p>}

      {!busy && kinds && (!leaf || leaf.folder) && (
        <div className="mgr-kinds" data-testid="erp-kinds">
          {kinds
            .filter((k) => path.length > 0 || tab === 'all' || groupOfKind(k) === tab)
            .map((k) => (
              <div key={k.key} className="mgr-kind-wrap">
                <button
                  type="button"
                  className="mgr-kind"
                  onClick={() => {
                    setPath([...path, k]);
                    setSkip(0);
                  }}
                  data-testid={`erp-kind-${k.name}`}
                >
                  {k.folder ? '📁 ' : ''}
                  {k.name}
                </button>
              </div>
            ))}
          {kinds.length === 0 && <p className="mgr-note">Bu yerda bo&apos;lim yo&apos;q.</p>}
        </div>
      )}

      {!busy && rows && leaf && !leaf.folder && (
        <>
          <div className="mgr-card mgr-table-wrap">
            <table className="mgr-table">
              <thead>
                <tr>
                  <th aria-label="Rasm" />
                  <th>1C dagi nomi</th>
                  <th>Artikul</th>
                  <th>Narxi</th>
                  <th>Qoldiq</th>
                  <th>Kioskda</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const l = linkOf(r.article);
                  return (
                    <tr key={r.key} data-testid={`erp-row-${r.article}`}>
                      <td>
                        <ErpThumb src={pics[r.article]} alt={r.name} />
                      </td>
                      <td>
                        <span className="mgr-name">
                          {r.name}
                          <small>{r.unit}</small>
                        </span>
                      </td>
                      <td>{r.article || '—'}</td>
                      <td>{r.price !== null ? `${money(r.price)} ${r.currency ?? ''}` : '—'}</td>
                      <td>{r.stock ?? '—'}</td>
                      <td>
                        {l && l.visible ? (
                          <span className="mgr-inline">
                            <b className="mgr-yes">Kioskda</b>
                            {l.type !== 'builtin' && (
                              <Button variant="secondary" onClick={() => setVisible(l, false)}>
                                Kioskdan olish
                              </Button>
                            )}
                          </span>
                        ) : l ? (
                          <Button variant="secondary" onClick={() => setVisible(l, true)}>
                            Qaytarish
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            disabled={!r.article}
                            onClick={() => setAdding(r)}
                            data-testid={`erp-add-${r.article}`}
                          >
                            Kioskga qo&apos;shish
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {leaf.key && total > PAGE && (
            <div className="mgr-toolbar">
              <Button
                variant="secondary"
                disabled={skip === 0}
                onClick={() => setSkip(Math.max(0, skip - PAGE))}
              >
                ‹ Oldingi
              </Button>
              <span className="mgr-count">
                {skip + 1}–{Math.min(skip + PAGE, total)} / {total}
              </span>
              <Button
                variant="secondary"
                disabled={skip + PAGE >= total}
                onClick={() => setSkip(skip + PAGE)}
              >
                Keyingi ›
              </Button>
            </div>
          )}
        </>
      )}

      {adding && (
        <AddFromErp
          row={adding}
          picture={pics[adding.article]}
          list={list}
          onCancel={() => setAdding(null)}
          onAdd={(d) => {
            if (d.type === 'material')
              setDraft({ ...draft, materials: [...draft.materials, d.item] });
            else setDraft({ ...draft, hardware: [...draft.hardware, d.item] });
            setAdding(null);
          }}
        />
      )}
    </section>
  );
}

type Added = { type: 'material'; item: MaterialDraft } | { type: 'hardware'; item: HardwareDraft };

/** the form that turns a 1C item into a kiosk material / hardware brand */
function AddFromErp({
  row,
  picture,
  list,
  onAdd,
  onCancel,
}: {
  row: ErpRow;
  /** D-34: its eman.uz picture */
  picture?: string | null;
  list: PriceList;
  onAdd: (a: Added) => void;
  onCancel: () => void;
}) {
  const api = useContext(ErpContext);
  const [take, setTake] = useState(true);
  const [busy, setBusy] = useState(false);
  const g = guessFromName(row.name);
  const [kind, setKind] = useState<AddKind>(g.kind);
  const [name, setName] = useState(cleanName(row.name));
  const [brand, setBrand] = useState(g.brand);
  const [thicknessMm, setThickness] = useState(g.thicknessMm);
  const [colorHex, setColor] = useState(NEW_MATERIAL.colorHex);
  const [group, setGroup] = useState<'wood' | 'plain'>(g.group);
  const [usage, setUsage] = useState<MaterialDraft['usage']>(['corpus', 'door', 'top']);
  const [softClose, setSoft] = useState(g.softClose);
  const board = kind === 'ldsp' || kind === 'mdf';
  const price = somPrice(row, list, board ? g.sheet : undefined);

  const add = async () => {
    // D-34: the eman.uz picture is copied into our photo store first
    let pic: string | undefined;
    if (take && picture && api) {
      setBusy(true);
      const r = await api.copyPicture(row.article);
      setBusy(false);
      if (r.ok) pic = r.value;
    }
    const erp = { erpArticle: row.article, erpPrice: price };
    if (board)
      onAdd({
        type: 'material',
        item: {
          ...NEW_MATERIAL,
          kind,
          name,
          brand,
          code: '',
          thicknessMm,
          colorHex,
          group,
          grain: group === 'wood',
          usage,
          note: `1C: ${row.name}`.slice(0, 200),
          ...erp,
          erpSheet: g.sheet,
          erpPicture: pic,
        } as MaterialDraft,
      });
    else
      onAdd({
        type: 'hardware',
        item: {
          ...NEW_HARDWARE,
          kind,
          brand: brand || '—',
          model: name,
          softClose,
          note: `1C: ${row.name}`.slice(0, 200),
          photoUrl: pic,
          ...erp,
        } as HardwareDraft,
      });
  };

  return (
    <div className="mgr-modal" role="dialog" aria-label="Kioskga qo'shish" data-testid="erp-add">
      <div className="mgr-card mgr-modal-card">
        <header className="mgr-modal-head">
          <h3>Kioskga qo&apos;shish</h3>
          <Button variant="secondary" onClick={onCancel}>
            Bekor qilish
          </Button>
        </header>
        <p className="mgr-note">
          1C: {row.name} · artikul {row.article}
          {price !== undefined && ` · ${money(price)} so'm${board ? ' / list' : ''}`}
        </p>
        <PictureChoice src={picture} take={take} setTake={setTake} />
        <div className="mgr-grid">
          <label className="mgr-field">
            <span>Nima</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as AddKind)}>
              {(Object.keys(ADD_LABEL) as AddKind[]).map((k) => (
                <option key={k} value={k}>
                  {ADD_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="mgr-field">
            <span>{board ? 'Kioskdagi nomi' : 'Model'}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="erp-add-name"
            />
          </label>
          <label className="mgr-field">
            <span>Brend</span>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </label>
          {board ? (
            <>
              <label className="mgr-field">
                <span>Qalinligi</span>
                <select value={thicknessMm} onChange={(e) => setThickness(Number(e.target.value))}>
                  {THICKNESS.map((t) => (
                    <option key={t} value={t}>
                      {t} mm
                    </option>
                  ))}
                </select>
              </label>
              <label className="mgr-field">
                <span>Rangi</span>
                <input type="color" value={colorHex} onChange={(e) => setColor(e.target.value)} />
              </label>
              <label className="mgr-field">
                <span>Guruh</span>
                <select
                  value={group}
                  onChange={(e) => setGroup(e.target.value as 'wood' | 'plain')}
                >
                  <option value="plain">Bir rang</option>
                  <option value="wood">Yog&apos;och</option>
                </select>
              </label>
              <fieldset className="mgr-field">
                <span>Qayerda</span>
                {(
                  [
                    ['corpus', 'Korpus'],
                    ['door', 'Fasad / eshik'],
                    ['top', 'Stoleshnitsa'],
                  ] as const
                ).map(([u, label]) => (
                  <label key={u} className="mgr-inline">
                    <input
                      type="checkbox"
                      checked={usage.includes(u)}
                      onChange={(e) =>
                        setUsage(e.target.checked ? [...usage, u] : usage.filter((x) => x !== u))
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            </>
          ) : (
            <label className="mgr-field">
              <span>Yumshoq yopiladi</span>
              <input
                type="checkbox"
                checked={softClose}
                onChange={(e) => setSoft(e.target.checked)}
              />
            </label>
          )}
        </div>
        {board && (
          <p className="mgr-note">
            Rasm dekor fotosi bo&apos;ladi (1 m × 1 m deb olinadi): o&apos;lchamini «Materiallar»
            bo&apos;limida to&apos;g&apos;rilaysiz.
          </p>
        )}
        <Button
          variant="primary"
          onClick={() => void add()}
          disabled={busy || !name.trim() || (board && usage.length === 0)}
          data-testid="erp-add-confirm"
        >
          Qo&apos;shish
        </Button>
      </div>
    </div>
  );
}

export type { ErpApi };
