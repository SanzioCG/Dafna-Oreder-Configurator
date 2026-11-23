import type { PriceList, PriceService } from '@dafna/engine';
import { Button } from '../ui/Button';
import { BASIS, PRODUCTS } from './model';

/**
 * D-20 "Xizmatlar": the work and services added to the price, each by its unit — per m² of
 * board (labour, assembly…), per metre of edge band (edge banding), per product (delivery…)
 * or a % of the other costs. Limited to some products, or every product.
 */
export function ServicesSection({ list, edit }: { list: PriceList; edit: (l: PriceList) => void }) {
  const services = list.services ?? [];
  const set = (i: number, patch: Partial<PriceService>) =>
    edit({ ...list, services: services.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const add = () => {
    let n = services.length + 1;
    while (services.some((s) => s.id === `s_${n}`)) n++;
    edit({
      ...list,
      services: [...services, { id: `s_${n}`, name: '', basis: 'm2', products: [], price: 0 }],
    });
  };
  return (
    <section className="mgr-section" data-testid="mgr-services">
      <header className="mgr-section-head">
        <div>
          <h2>Xizmatlar</h2>
          <p className="mgr-note">
            Narxga qo&apos;shiladigan ishlar. Har biri o&apos;z birligida hisoblanadi: masalan
            kromkalash — 1 metr kromka uchun, yig&apos;ish va ish haqi — 1 m² plita uchun, yetkazish
            — 1 dona mahsulot uchun. Mahsulot belgilanmasa — hamma mahsulotga qo&apos;llanadi.
          </p>
        </div>
        <Button variant="primary" onClick={add} data-testid="mgr-service-add">
          + Yangi xizmat
        </Button>
      </header>

      <div className="mgr-card mgr-table-wrap">
        {services.length === 0 ? (
          <p className="mgr-note">Hali xizmat yo&apos;q.</p>
        ) : (
          <table className="mgr-table">
            <thead>
              <tr>
                <th>Xizmat nomi</th>
                <th>Nimaga qarab hisoblanadi</th>
                <th>Narxi</th>
                <th>Qaysi mahsulotlarga</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {services.map((s, i) => (
                <tr key={s.id} data-testid={`mgr-service-${i}`}>
                  <td>
                    <input
                      type="text"
                      value={s.name}
                      placeholder="Masalan: Kromkalash"
                      onChange={(e) => set(i, { name: e.target.value })}
                      aria-label={`${i + 1}-xizmat: nomi`}
                      data-testid={`mgr-service-name-${i}`}
                      className="mgr-w-name"
                    />
                  </td>
                  <td>
                    <select
                      value={s.basis}
                      onChange={(e) => set(i, { basis: e.target.value as PriceService['basis'] })}
                      aria-label={`${i + 1}-xizmat: hisob birligi`}
                      data-testid={`mgr-service-basis-${i}`}
                    >
                      {BASIS.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="mgr-input">
                      <input
                        type="number"
                        min={0}
                        value={s.price}
                        onChange={(e) => set(i, { price: Number(e.target.value) })}
                        aria-label={`${i + 1}-xizmat: narxi`}
                        data-testid={`mgr-service-price-${i}`}
                        className="mgr-w-price"
                      />
                      <em>{BASIS.find((b) => b.value === s.basis)?.unit}</em>
                    </span>
                  </td>
                  <td>
                    <span className="mgr-checks">
                      {PRODUCTS.map((p) => (
                        <label key={p.type}>
                          <input
                            type="checkbox"
                            checked={s.products.includes(p.type)}
                            onChange={(e) =>
                              set(i, {
                                products: e.target.checked
                                  ? [...s.products, p.type]
                                  : s.products.filter((x) => x !== p.type),
                              })
                            }
                          />
                          {p.label}
                        </label>
                      ))}
                      {s.products.length === 0 && <em className="mgr-sub">hammasi</em>}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="mgr-del"
                      onClick={() =>
                        edit({ ...list, services: services.filter((_, j) => j !== i) })
                      }
                      aria-label={`${i + 1}-xizmatni o'chirish`}
                    >
                      O&apos;chirish
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
