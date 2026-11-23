import {
  PRODUCT_TEMPLATES,
  catalogForTemplate,
  computeBom,
  computePrice,
  defaultParams,
  generate,
  type PriceList,
} from '@dafna/engine';
import { useMemo } from 'react';
import { PRODUCTS, money } from './model';

/**
 * D-20 "Foyda va narx": the overall profit % and what the customer pays for each product's
 * default model with the list being edited (before saving).
 */
export function ProfitSection({ list, edit }: { list: PriceList; edit: (l: PriceList) => void }) {
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
      <Preview list={list} />
    </section>
  );
}

/** the default model of each product, priced with the list being edited */
export function Preview({ list }: { list: PriceList }) {
  const rows = useMemo(
    () =>
      Object.values(PRODUCT_TEMPLATES).map((t) => {
        const p = defaultParams(t);
        const r = computePrice(
          computeBom(t, p, generate(t, p)),
          catalogForTemplate(t),
          list,
          t.productType,
        );
        return { t, r };
      }),
    [list],
  );
  return (
    <div className="mgr-card mgr-table-wrap" data-testid="mgr-preview">
      <h3>Namuna: asosiy modellarning narxi (saqlashdan oldin ko&apos;rinadi)</h3>
      <table className="mgr-table">
        <thead>
          <tr>
            <th>Mahsulot</th>
            <th>Plitalar</th>
            <th>Kromka</th>
            <th>Furnitura</th>
            <th>Xizmatlar</th>
            <th>Foyda</th>
            <th>Mijoz ko&apos;radi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, r }) => (
            <tr key={t.templateId}>
              <td>{PRODUCTS.find((p) => p.type === t.productType)?.label ?? t.templateId}</td>
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
    </div>
  );
}
