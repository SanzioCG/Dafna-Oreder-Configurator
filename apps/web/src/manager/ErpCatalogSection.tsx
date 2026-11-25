import { type PriceList } from '@dafna/engine';
import { ChevronRight, Folder, FolderOpen, Search } from 'lucide-react';
import { useContext, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import {
  ERP_ERRORS,
  ErpContext,
  ErpThumb,
  PictureChoice,
  pictureWarning,
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
 * with price and stock. The manager marks what the kiosk shows: "Saytga qo'shish" turns a 1C
 * board into a material (LDSP / MDF) or a 1C hinge / slide into a hardware brand of the kiosk,
 * linked to its 1C article and priced from 1C; "Saytdan olish" hides it again (nothing is
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

type Tab = KindGroup;
const GROUPS: { id: KindGroup; label: string }[] = [
  { id: 'material', label: 'Materiallar' },
  { id: 'hardware', label: 'Furnitura' },
  { id: 'other', label: 'Boshqa' },
];

/**
 * D-42: a 1C item taken in one click (the switch or "Saytda ko'rsatish" for several): its kind,
 * name, brand, thickness and sheet guessed from the 1C name, price from 1C. A board only from
 * the materials group, a hinge / slide only when the name says so; anything else needs the form.
 */
export function quickDraft(
  row: ErpRow,
  group: KindGroup | null,
  list: PriceList,
  picture?: string,
): Added | null {
  if (!row.article) return null;
  const g = guessFromName(row.name);
  const board = g.kind === 'ldsp' || g.kind === 'mdf';
  if (board && group !== 'material') return null;
  if (!board && group === 'other') return null;
  const price = somPrice(row, list, board ? g.sheet : undefined);
  const erp = { erpArticle: row.article, erpPrice: price };
  const note = `1C: ${row.name}`.slice(0, 200);
  if (board)
    return {
      type: 'material',
      item: {
        ...NEW_MATERIAL,
        kind: g.kind,
        name: cleanName(row.name),
        brand: g.brand,
        code: '',
        thicknessMm: g.thicknessMm,
        group: g.group,
        grain: g.group === 'wood',
        usage: ['corpus', 'door', 'top'],
        note,
        ...erp,
        erpSheet: g.sheet,
        erpPicture: picture,
      } as MaterialDraft,
    };
  return {
    type: 'hardware',
    item: {
      ...NEW_HARDWARE,
      kind: g.kind,
      brand: g.brand || '—',
      model: cleanName(row.name),
      softClose: g.softClose,
      note,
      photoUrl: picture,
      ...erp,
    } as HardwareDraft,
  };
}

/** D-42: a folder of the 1C tree (a group of top kinds, or a kind) */
type Node = { id: string; name: string; kind?: ErpKind; group?: KindGroup };

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
  const groupOfKind = (k: ErpKind): KindGroup => list.erpKindGroups?.[k.key] ?? k.group ?? 'other';
  /** the tree: kinds under each loaded kind ('' = the top), which folders are open */
  const [children, setChildren] = useState<Record<string, ErpKind[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['g:material']));
  const [loadingKind, setLoadingKind] = useState<string | null>(null);
  /** D-50: items per kind (sub-kinds included); null until 1C answers (they come after the tree) */
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  /** the kind whose items are shown (or a search) */
  const [selected, setSelected] = useState<{
    kind: ErpKind | null;
    group: Tab | null;
    label: string;
  } | null>(null);
  const [rows, setRows] = useState<ErpRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<ErpRow | null>(null);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());

  // D-34: eman.uz pictures of the rows shown
  const pics = usePictures((rows ?? []).map((r) => r.article));

  /** loads the kinds under a kind ('' = the top) once */
  const loadKinds = async (parent: string) => {
    if (!api || children[parent]) return;
    setLoadingKind(parent);
    const r = await api.kinds(parent);
    setLoadingKind(null);
    if (!r.ok) return setError(ERP_ERRORS[r.code] ?? ERP_ERRORS.network!);
    setChildren((c) => ({ ...c, [parent]: r.value }));
  };

  useEffect(() => {
    void loadKinds('');
    // D-50: the numbers next to the folders (a slower read; the tree does not wait for it)
    let live = true;
    void api?.counts().then((r) => {
      if (live && r.ok) setCounts(r.value);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  /** D-50: a kind's items, or a group's (the sum of its top kinds) */
  const countOf = (n: Node): number | null => {
    if (!counts) return null;
    if (n.kind) return counts[n.kind.key] ?? 0;
    if (n.group)
      return (children[''] ?? [])
        .filter((k) => groupOfKind(k) === n.group)
        .reduce((sum, k) => sum + (counts[k.key] ?? 0), 0);
    return null;
  };

  // the items of the selected kind (a search fills the rows itself)
  useEffect(() => {
    const kind = selected?.kind;
    if (!api || !kind) return;
    let live = true;
    void (async () => {
      setBusy(true);
      setError(null);
      const r = await api.items(kind.key, skip);
      if (!live) return;
      setBusy(false);
      if (!r.ok) return setError(ERP_ERRORS[r.code] ?? ERP_ERRORS.network!);
      setRows(r.value.items);
      setTotal(r.value.total);
    })();
    return () => {
      live = false;
    };
  }, [api, selected?.kind, skip]);

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
    setChecked(new Set());
    const group = selected?.group ?? null;
    const r = await api.search(
      query.trim(),
      group === 'material' || group === 'hardware' ? { group } : undefined,
    );
    if (!r.ok) {
      setBusy(false);
      return setError(ERP_ERRORS[r.code] ?? ERP_ERRORS.network!);
    }
    const prices = await api.prices(r.value.map((i) => i.article).filter(Boolean));
    setBusy(false);
    setSelected({ kind: null, group, label: `Qidiruv: «${query.trim()}»` });
    setSkip(0);
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

  /** shows / hides linked items, and takes the unlinked ones in one click (quickDraft) */
  const showOnSite = async (targets: ErpRow[], visible: boolean) => {
    let next = draft;
    const skipped: string[] = [];
    let taken = 0;
    /** D-53: pictures not copied, and why (the last reason) */
    let noPicture = 0;
    let pictureCode = '';
    setBusy(true);
    for (const r of targets) {
      const l = linkOf(r.article);
      if (l?.type === 'material')
        next = {
          ...next,
          materials: next.materials.map((m, i) => (i === l.index ? { ...m, visible } : m)),
        };
      else if (l?.type === 'hardware')
        next = {
          ...next,
          hardware: next.hardware.map((h, i) => (i === l.index ? { ...h, visible } : h)),
        };
      else if (!l && visible) {
        // D-34: the eman.uz picture goes into our photo store first
        let pic: string | undefined;
        if (pics[r.article]) {
          const c = await api.copyPicture(r.article);
          if (c.ok) pic = c.value;
          else {
            noPicture++;
            pictureCode = c.code;
          }
        }
        const d = quickDraft(r, selected?.group ?? null, list, pic);
        if (!d) skipped.push(r.name);
        else if (d.type === 'material') next = { ...next, materials: [...next.materials, d.item] };
        else next = { ...next, hardware: [...next.hardware, d.item] };
        if (d) taken++;
      }
    }
    setBusy(false);
    setDraft(next);
    setChecked(new Set());
    const parts = [];
    if (taken) parts.push(`${taken} ta mahsulot saytga qo'shildi`);
    if (skipped.length)
      parts.push(
        `${skipped.length} tasini avtomatik qo'shib bo'lmadi (turini aniqlab bo'lmadi) — ularni bittalab «Saytga qo'shish» formasi bilan qo'shing`,
      );
    if (noPicture) parts.push(`${noPicture} ta: ${pictureWarning(pictureCode)}`);
    setNote(parts.length ? `${parts.join('; ')}. «Saqlash»ni bosing.` : null);
  };

  /** one row's switch: a known item flips, a new one opens the form */
  const toggle = (r: ErpRow) => {
    const l = linkOf(r.article);
    if (!l) return setAdding(r);
    if (l.type !== 'builtin') void showOnSite([r], !l.visible);
  };

  const nodeKids = (n: Node): Node[] => {
    if (n.group)
      return (children[''] ?? [])
        .filter((k) => groupOfKind(k) === n.group)
        .map((k) => ({ id: k.key, name: k.name, kind: k }));
    if (n.kind?.folder)
      return (children[n.kind.key] ?? []).map((k) => ({ id: k.key, name: k.name, kind: k }));
    return [];
  };
  const groupOfNode = (path: Node[]) => path.find((p) => p.group)?.group ?? null;

  const open = (n: Node, path: Node[]) => {
    const isOpen = expanded.has(n.id);
    if (n.group || n.kind?.folder) {
      const next = new Set(expanded);
      if (isOpen) next.delete(n.id);
      else next.add(n.id);
      setExpanded(next);
      if (n.kind?.folder && !isOpen) void loadKinds(n.kind.key);
      if (n.group) setSelected({ kind: null, group: n.group, label: n.name });
      return;
    }
    if (n.kind) {
      setSelected({ kind: n.kind, group: groupOfNode(path), label: n.name });
      setSkip(0);
      setChecked(new Set());
      setRows(null);
    }
  };

  const renderNode = (n: Node, path: Node[], depth: number) => {
    const isFolder = !!(n.group || n.kind?.folder);
    const isOpen = expanded.has(n.id);
    const active = selected?.kind ? selected.kind.key === n.kind?.key : false;
    const kids = isOpen ? nodeKids(n) : [];
    return (
      <li key={n.id}>
        <button
          type="button"
          className={active ? 'mgr-tree-item active' : 'mgr-tree-item'}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => open(n, [...path, n])}
          aria-expanded={isFolder ? isOpen : undefined}
          data-testid={`erp-kind-${n.name}`}
        >
          {isFolder ? (
            <ChevronRight
              className={isOpen ? 'mgr-icon mgr-chev open' : 'mgr-icon mgr-chev'}
              aria-hidden
            />
          ) : (
            <span className="mgr-chev-space" aria-hidden="true" />
          )}
          {isFolder && isOpen ? (
            <FolderOpen className="mgr-icon" aria-hidden />
          ) : (
            <Folder className="mgr-icon" aria-hidden />
          )}
          <span className="mgr-tree-name">{n.name}</span>
          {countOf(n) !== null && (
            <span className="mgr-tree-count" data-testid={`erp-count-${n.name}`}>
              {countOf(n)}
            </span>
          )}
        </button>
        {isOpen && (
          <ul>
            {n.kind && loadingKind === n.kind.key && (
              <li className="mgr-tree-note" style={{ paddingLeft: 32 + depth * 16 }}>
                Yuklanmoqda…
              </li>
            )}
            {kids.map((k) => renderNode(k, [...path, n], depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const shownRows = rows ?? [];
  const allChecked = shownRows.length > 0 && shownRows.every((r) => checked.has(r.article));
  const checkedRows = shownRows.filter((r) => checked.has(r.article));

  return (
    <section className="mgr-section" data-testid="mgr-erp-catalog">
      <header className="mgr-section-head">
        <div>
          <h2>1C katalogi</h2>
          <p className="mgr-note">
            EMAN 1C dagi hamma mahsulot (narxi va qoldig&apos;i bilan). Saytda faqat «Saytda
            ko&apos;rinadi» yoqilganlari chiqadi. «Saqlash»ni bosishni unutmang.
          </p>
        </div>
      </header>

      <div className="mgr-erp-layout">
        <nav className="mgr-card mgr-tree" aria-label="1C papkalari" data-testid="erp-kinds">
          <p className="mgr-tree-title">Papkalar</p>
          {!children[''] && loadingKind === '' && <p className="mgr-tree-note">Yuklanmoqda…</p>}
          <ul>
            {GROUPS.map((g) => renderNode({ id: `g:${g.id}`, name: g.label, group: g.id }, [], 0))}
          </ul>
        </nav>

        <div className="mgr-erp-main">
          <form className="mgr-toolbar" onSubmit={search}>
            <span className="mgr-search">
              <Search className="mgr-icon" aria-hidden />
              <input
                type="search"
                placeholder="Qidirish: nomi yoki artikul"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="erp-cat-q"
              />
            </span>
            <Button variant="secondary" type="submit" disabled={busy || query.trim().length < 2}>
              Qidirish
            </Button>
            {selected && rows && (
              <span className="mgr-count mgr-push">
                {selected.label}: {total} ta
              </span>
            )}
          </form>

          {checkedRows.length > 0 && (
            <div className="mgr-bulk" data-testid="erp-bulk">
              <strong>{checkedRows.length} ta tanlandi</strong>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void showOnSite(checkedRows, true)}
                data-testid="erp-bulk-show"
              >
                Saytda ko&apos;rsatish
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void showOnSite(checkedRows, false)}
              >
                Yashirish
              </Button>
              <Button variant="secondary" onClick={() => setChecked(new Set())}>
                Bekor qilish
              </Button>
            </div>
          )}

          {error && (
            <p className="mgr-error" role="alert">
              {error}
            </p>
          )}
          {note && (
            <p className="mgr-note mgr-erp-note" role="status" data-testid="erp-note">
              {note}
            </p>
          )}

          <div className="mgr-card mgr-table-wrap">
            {busy && !rows ? (
              <p className="mgr-empty">Yuklanmoqda…</p>
            ) : !rows ? (
              <p className="mgr-empty">Chapdagi papkadan bo&apos;limni tanlang yoki qidiring.</p>
            ) : rows.length === 0 ? (
              <p className="mgr-empty">Hech narsa topilmadi.</p>
            ) : (
              <table className="mgr-table">
                <thead>
                  <tr>
                    <th className="mgr-col-check">
                      <input
                        type="checkbox"
                        aria-label="Hammasini tanlash"
                        checked={allChecked}
                        onChange={(e) =>
                          setChecked(
                            e.target.checked
                              ? new Set(shownRows.filter((r) => r.article).map((r) => r.article))
                              : new Set(),
                          )
                        }
                      />
                    </th>
                    <th>Nomi (1C)</th>
                    <th>Artikul</th>
                    <th className="mgr-num">Narxi</th>
                    <th className="mgr-num">Qoldiq</th>
                    <th>Saytda ko&apos;rinadi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const l = linkOf(r.article);
                    const on = !!l?.visible;
                    return (
                      <tr
                        key={r.key}
                        className={checked.has(r.article) ? 'checked' : undefined}
                        data-testid={`erp-row-${r.article}`}
                      >
                        <td className="mgr-col-check">
                          <input
                            type="checkbox"
                            aria-label={`${r.name}: tanlash`}
                            disabled={!r.article}
                            checked={checked.has(r.article)}
                            onChange={(e) => {
                              const next = new Set(checked);
                              if (e.target.checked) next.add(r.article);
                              else next.delete(r.article);
                              setChecked(next);
                            }}
                          />
                        </td>
                        <td>
                          <span className="mgr-erp-row">
                            <ErpThumb src={pics[r.article]} alt={r.name} />
                            <span className="mgr-name">
                              {r.name}
                              <small>{r.unit}</small>
                            </span>
                          </span>
                        </td>
                        <td>{r.article || '—'}</td>
                        <td className="mgr-num">
                          {r.price !== null ? `${money(r.price)} ${r.currency ?? ''}` : '—'}
                        </td>
                        <td className="mgr-num">{r.stock ?? '—'}</td>
                        <td>
                          <span className="mgr-inline">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={on}
                              aria-label={`${r.name}: saytda ko'rinadi`}
                              className="mgr-switch"
                              disabled={!r.article || busy || l?.type === 'builtin'}
                              onClick={() => toggle(r)}
                              data-testid={`erp-add-${r.article}`}
                            />
                            {!l && (
                              <button
                                type="button"
                                className="mgr-link"
                                disabled={!r.article}
                                onClick={() => setAdding(r)}
                              >
                                Batafsil
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {selected?.kind && rows && total > PAGE && (
              <footer className="mgr-pager">
                <span className="mgr-count">
                  {skip + 1}–{Math.min(skip + PAGE, total)} / {total} ta
                </span>
                <span className="mgr-inline">
                  <Button
                    variant="secondary"
                    disabled={skip === 0 || busy}
                    onClick={() => setSkip(Math.max(0, skip - PAGE))}
                    aria-label="Oldingi sahifa"
                  >
                    ‹
                  </Button>
                  <span className="mgr-count">
                    {Math.floor(skip / PAGE) + 1} / {Math.ceil(total / PAGE)}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={skip + PAGE >= total || busy}
                    onClick={() => setSkip(skip + PAGE)}
                    aria-label="Keyingi sahifa"
                  >
                    ›
                  </Button>
                </span>
              </footer>
            )}
          </div>
        </div>
      </div>

      {adding && (
        <AddFromErp
          row={adding}
          picture={pics[adding.article]}
          list={list}
          onCancel={() => setAdding(null)}
          onAdd={(d, warning) => {
            if (d.type === 'material')
              setDraft({ ...draft, materials: [...draft.materials, d.item] });
            else setDraft({ ...draft, hardware: [...draft.hardware, d.item] });
            setAdding(null);
            // D-53: the item is added; a picture that was not saved is said
            setNote(warning ? `${warning}. «Saqlash»ni bosing.` : null);
          }}
        />
      )}
    </section>
  );
}

export type Added =
  { type: 'material'; item: MaterialDraft } | { type: 'hardware'; item: HardwareDraft };

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
  /** D-53: `warning` = the picture was not saved (why) */
  onAdd: (a: Added, warning?: string) => void;
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
    let warning: string | undefined;
    if (take && picture && api) {
      setBusy(true);
      const r = await api.copyPicture(row.article);
      setBusy(false);
      if (r.ok) pic = r.value;
      else warning = pictureWarning(r.code);
    }
    const erp = { erpArticle: row.article, erpPrice: price };
    if (board)
      onAdd(
        {
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
        },
        warning,
      );
    else
      onAdd(
        {
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
        },
        warning,
      );
  };

  return (
    <div className="mgr-modal" role="dialog" aria-label="Saytga qo'shish" data-testid="erp-add">
      <div className="mgr-card mgr-modal-card">
        <header className="mgr-modal-head">
          <h3>Saytga qo&apos;shish</h3>
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
            <span>{board ? 'Saytdagi nomi' : 'Model'}</span>
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
