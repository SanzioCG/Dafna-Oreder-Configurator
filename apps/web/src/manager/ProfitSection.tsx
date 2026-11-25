import {
  PRODUCT_TEMPLATES,
  allMaterials,
  catalogForTemplate,
  computeBom,
  computePrice,
  defaultParams,
  generate,
  getMaterial,
  nestBoards,
  sheetSizeOf,
  type Params,
  type PriceList,
  type Template,
} from '@dafna/engine';
import { useMemo } from 'react';
import { translate } from '../i18n/I18n';
import { PRODUCTS, money } from './model';

/**
 * D-20 "Foyda va narx": the overall profit %, how a board is charged (D-48: by area with the
 * waste % or by the whole sheets of the raskroy), and what the customer pays for each product's
 * default model with the list being edited (before saving), with its sheets per board; the
 * nearest LESTER models of dafna.uz priced the same way to compare.
 */
export function ProfitSection({ list, edit }: { list: PriceList; edit: (l: PriceList) => void }) {
  const billing = list.boardBilling ?? 'area';
  return (
    <section className="mgr-section" data-testid="mgr-profit">
      <header className="mgr-section-head">
        <div>
          <h2>Foyda va narx</h2>
          <p className="mgr-note">
            Mijoz narxi = (materiallar + kromka + furnitura + xizmatlar) + foyda. Foyda — barcha
            xarajatlar yig&apos;indisidan foiz. Mijoz faqat yakuniy narxni ko&apos;radi.
          </p>
        </div>
      </header>
      <div className="mgr-card mgr-profit">
        <label className="mgr-field">
          <span>Umumiy foyda</span>
          <span className="mgr-input mgr-input-big">
            <input
              type="number"
              min={0}
              max={300}
              step="any"
              value={list.markupPct}
              onChange={(e) => edit({ ...list, markupPct: Number(e.target.value) })}
              data-testid="mgr-markup"
            />
            <em>%</em>
          </span>
        </label>
      </div>
      <div className="mgr-card mgr-profit" data-testid="mgr-billing">
        <div className="mgr-field">
          <span>Plita (list) narxi qanday hisoblanadi</span>
          <div className="segmented" role="radiogroup" aria-label="Plita narxi">
            {(
              [
                ['area', "m² bo'yicha + chiqindi"],
                ['sheets', "Butun listlar bo'yicha (raskroy)"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={billing === v}
                className={billing === v ? 'segment active' : 'segment'}
                onClick={() => edit({ ...list, boardBilling: v })}
                data-testid={`mgr-billing-${v}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mgr-note">
            {billing === 'area'
              ? "Mahsulot detallarining maydoni × chiqindi foizi. Qolgan bo'laklar keyingi buyurtmalarga ishlatiladi deb hisoblanadi."
              : "Har bir plita uchun raskroy qilinadi (arra 4 mm, list cheti 10 mm, yog'och tekstura bo'ylab) va butun listlar soni × list narxi olinadi. Kichik mahsulotlar qimmatlashadi: qolgan bo'lak mijozga tushadi."}
          </p>
        </div>
        {billing === 'area' && (
          <label className="mgr-field">
            <span>Chiqindi (kesishdan qoladigan bo&apos;laklar)</span>
            <span className="mgr-input">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round((list.wasteFactor - 1) * 100)}
                onChange={(e) =>
                  edit({
                    ...list,
                    wasteFactor: 1 + Math.min(100, Math.max(0, Number(e.target.value))) / 100,
                  })
                }
                data-testid="mgr-waste"
              />
              <em>%</em>
            </span>
          </label>
        )}
      </div>
      <Preview list={list} />
      <LesterCompare list={list} />
    </section>
  );
}

/** a product priced with the list being edited, and its raskroy */
function priced(t: Template, params: Params, list: PriceList) {
  const result = generate(t, params);
  const catalog = catalogForTemplate(t);
  const nests = nestBoards(result, (id) => sheetSizeOf(id, list), catalog);
  const sheets = Object.fromEntries(nests.map((n) => [n.material, n.nest.sheets.length]));
  const r = computePrice(computeBom(t, params, result), catalog, list, t.productType, sheets);
  return { r, nests };
}

const boardName = (id: string) => {
  const m = getMaterial(allMaterials, id);
  return m ? `${translate('uz', m.decorName)} ${m.thicknessMm}` : id;
};

/** the default model of each product, priced with the list being edited */
export function Preview({ list }: { list: PriceList }) {
  const rows = useMemo(
    () =>
      Object.values(PRODUCT_TEMPLATES).map((t) => ({ t, ...priced(t, defaultParams(t), list) })),
    [list],
  );
  return (
    <div className="mgr-card mgr-table-wrap" data-testid="mgr-preview">
      <h3>Namuna: asosiy modellarning narxi (saqlashdan oldin ko&apos;rinadi)</h3>
      <table className="mgr-table">
        <thead>
          <tr>
            <th>Mahsulot</th>
            <th>Listlar (raskroy)</th>
            <th>Plitalar</th>
            <th>Kromka</th>
            <th>Furnitura</th>
            <th>Xizmatlar</th>
            <th>Foyda</th>
            <th>Mijoz ko&apos;radi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, r, nests }) => (
            <tr key={t.templateId}>
              <td>{PRODUCTS.find((p) => p.type === t.productType)?.label ?? t.templateId}</td>
              <td data-testid={`mgr-sheets-${t.templateId}`}>
                {nests.map((n) => (
                  <small key={n.material} className="mgr-sheet-line">
                    {boardName(n.material)}: <strong>{n.nest.sheets.length} list</strong> ·{' '}
                    {Math.round(n.nest.utilization * 100)}%
                  </small>
                ))}
              </td>
              <td>{money(r.boards)}</td>
              <td>{money(r.edges)}</td>
              <td>{money(r.hardware)}</td>
              <td>{money(r.servicesTotal + r.labor + r.assembly)}</td>
              <td>{money(r.markup)}</td>
              <td>
                <strong data-testid={`mgr-total-${t.templateId}`}>
                  {money(r.total)} so&apos;m
                </strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mgr-note mgr-table-note">
        Listlar: har bir plita uchun nechta butun list ketadi va undan necha foizi detalga
        ishlatiladi (bitta mahsulot yangi listlardan kesilganda). Haqiqiy kesish xaritasini GibLab
        tuzadi.
      </p>
    </div>
  );
}

/**
 * D-48: the LESTER models of dafna.uz (the Bazis files the templates were built from), their
 * price on the site on 2026-11-25, and the configurator's price of the same size.
 */
export const LESTER: {
  id: string;
  name: string;
  url: string;
  price: number;
  templateId: string;
  size: string;
  params: Params;
  note?: string;
}[] = [
  {
    id: 'tumba',
    name: '3 ta tortmali LESTER tumbasi',
    url: 'https://dafna.uz/uz/product/lester-tumba-3yasht-kashemir',
    price: 842_000,
    templateId: 'pedestal',
    size: '430 × 550 × 550',
    params: { width: 430, height: 550, depth: 550 },
  },
  {
    id: 'stol',
    name: 'LESTER stoli 150',
    url: 'https://dafna.uz/uz/product/lester-stol-150-kashemir',
    price: 1_706_000,
    templateId: 'desk',
    size: '1500 × 750 × 700',
    params: { width: 1500, height: 750, depth: 700 },
  },
  {
    id: 'ofis',
    name: 'Ofis uchun LESTER shkafi',
    url: 'https://dafna.uz/uz/product/lester-shkaf-ofis-kashemir',
    price: 1_364_000,
    templateId: 'wardrobe',
    size: '800 × 1830 × 400',
    params: { width: 800, height: 1830, depth: 400 },
    note: 'ichki qismi boshqacha (ofis javoni — tokchalar), taxminiy',
  },
];

function LesterCompare({ list }: { list: PriceList }) {
  const rows = useMemo(
    () =>
      LESTER.map((l) => {
        const t = PRODUCT_TEMPLATES[l.templateId]!;
        const { r } = priced(t, { ...defaultParams(t), ...l.params }, list);
        return { l, ours: r.total };
      }),
    [list],
  );
  return (
    <div className="mgr-card mgr-table-wrap" data-testid="mgr-lester">
      <h3>dafna.uz bilan solishtirish (LESTER seriyasi)</h3>
      <table className="mgr-table">
        <thead>
          <tr>
            <th>dafna.uz dagi mahsulot</th>
            <th>O&apos;lcham, mm</th>
            <th className="mgr-num">Saytdagi narx</th>
            <th className="mgr-num">Konfigurator</th>
            <th className="mgr-num">Farq</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ l, ours }) => {
            const diff = Math.round(((ours - l.price) / l.price) * 100);
            return (
              <tr key={l.id} data-testid={`mgr-lester-${l.id}`}>
                <td>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="mgr-link">
                    {l.name}
                  </a>
                  {l.note && <small className="mgr-sheet-line">{l.note}</small>}
                </td>
                <td className="mgr-dim">{l.size}</td>
                <td className="mgr-num">{money(l.price)}</td>
                <td className="mgr-num">
                  <strong>{money(ours)}</strong>
                </td>
                <td className="mgr-num">
                  <span className="mgr-pill" data-tone={Math.abs(diff) <= 10 ? 'ok' : 'warn'}>
                    {diff > 0 ? '+' : ''}
                    {diff}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mgr-note mgr-table-note">
        Saytdagi narxlar 2026-11-25 holatiga (kashmir rang). Konfigurator xuddi shu o&apos;lchamni
        hozirgi narxlar bilan hisoblaydi — farq katta bo&apos;lsa, plita narxi, xizmatlar yoki foyda
        foizini tekshiring.
      </p>
    </div>
  );
}
