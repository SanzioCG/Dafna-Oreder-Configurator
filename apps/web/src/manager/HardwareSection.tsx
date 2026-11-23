import { hardwareV1, type PriceList } from '@dafna/engine';
import { useState } from 'react';
import { Button } from '../ui/Button';
import {
  HW_KIND,
  HW_USE,
  NEW_HARDWARE,
  UNIT_LABEL,
  money,
  type CatalogDraft,
  type HardwareDraft,
} from './model';

/**
 * D-20 "Furnitura": every hardware item (built-in and added) with its 1C code and price. Hinges
 * and slides can be added (they become brands in the kiosk's "Mexanizmlar" step); other kinds
 * (handles, legs, …) need product rules first and come later.
 */
export function HardwareSection({
  list,
  edit,
  draft,
  setDraft,
}: {
  list: PriceList;
  edit: (l: PriceList) => void;
  draft: CatalogDraft;
  setDraft: (d: CatalogDraft) => void;
}) {
  const [query, setQuery] = useState('');
  const setH = (i: number, patch: Partial<HardwareDraft>) =>
    setDraft({
      ...draft,
      hardware: draft.hardware.map((h, j) => (j === i ? { ...h, ...patch } : h)),
    });
  const unsaved = draft.hardware.map((h, i) => ({ h, i })).filter(({ h }) => h.id === undefined);
  const q = query.trim().toLowerCase();
  const items = hardwareV1.items.filter((h) => {
    const added = draft.hardware.find((x) => x.id === h.id);
    const text = [
      HW_KIND[h.kind],
      h.brand,
      h.model,
      h.erpName,
      added?.model,
      list.erpCodes?.[h.id],
      h.id,
    ].join(' ');
    return !q || text.toLowerCase().includes(q);
  });
  // D-28: grouped by brand (A-Z, items without a brand last), then kind, then model
  const brandOf = (h: (typeof items)[number]) => h.brand || 'Brendsiz';
  const sorted = [...items].sort(
    (a, b) =>
      Number(!a.brand) - Number(!b.brand) ||
      brandOf(a).localeCompare(brandOf(b)) ||
      (HW_KIND[a.kind] ?? a.kind).localeCompare(HW_KIND[b.kind] ?? b.kind) ||
      (a.model ?? a.id).localeCompare(b.model ?? b.id),
  );
  const brands = [...new Set(sorted.map(brandOf))];

  return (
    <section className="mgr-section" data-testid="mgr-hardware">
      <header className="mgr-section-head">
        <div>
          <h2>Furnitura</h2>
          <p className="mgr-note">
            Petlya, yo&apos;naltiruvchi, g&apos;ildirak, shtanga, rama. Yangi petlya yoki
            yo&apos;naltiruvchi kioskning «Mexanizmlar» qadamida yangi brend bo&apos;lib chiqadi.
            Boshqa turlar (ruchka, oyoq) keyingi bosqichda qo&apos;shiladi. Furnitura
            o&apos;chirilmaydi — faqat mijozdan yashiriladi.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setDraft({ ...draft, hardware: [...draft.hardware, { ...NEW_HARDWARE }] })}
          data-testid="mgr-hw-add"
        >
          + Yangi furnitura
        </Button>
      </header>

      {unsaved.length > 0 && (
        <div className="mgr-card" data-testid="mgr-hw-new">
          <h3>Yangi (saqlanmagan)</h3>
          {unsaved.map(({ h, i }, n) => (
            <div className="mgr-grid mgr-new-row" key={i}>
              <label className="mgr-field">
                <span>Turi</span>
                <select
                  value={h.kind}
                  onChange={(e) => setH(i, { kind: e.target.value as 'hinge' | 'slide' })}
                >
                  <option value="hinge">Petlya</option>
                  <option value="slide">Yo&apos;naltiruvchi (juft)</option>
                </select>
              </label>
              <label className="mgr-field">
                <span>Brend *</span>
                <input
                  type="text"
                  value={h.brand}
                  placeholder="Blum, Hettich, GTV…"
                  onChange={(e) => setH(i, { brand: e.target.value })}
                  data-testid={`mgr-hw-brand-${n}`}
                />
              </label>
              <label className="mgr-field">
                <span>Model *</span>
                <input
                  type="text"
                  value={h.model}
                  onChange={(e) => setH(i, { model: e.target.value })}
                  data-testid={`mgr-hw-model-${n}`}
                />
              </label>
              <label className="mgr-field">
                <span>Yumshoq yopiladi</span>
                <input
                  type="checkbox"
                  checked={h.softClose}
                  onChange={(e) => setH(i, { softClose: e.target.checked })}
                />
              </label>
              <label className="mgr-field">
                <span>Izoh</span>
                <input
                  type="text"
                  value={h.note ?? ''}
                  onChange={(e) => setH(i, { note: e.target.value })}
                />
              </label>
            </div>
          ))}
          <p className="mgr-note">
            Saqlangandan keyin narxi va 1C kodini quyidagi ro&apos;yxatda kiriting.
          </p>
        </div>
      )}

      <div className="mgr-toolbar">
        <input
          type="search"
          placeholder="Qidirish: nomi, brend, 1C kodi"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Furniturani qidirish"
        />
        <span className="mgr-count">
          {items.length} ta · {brands.length} brend
        </span>
      </div>

      <div className="mgr-card mgr-table-wrap">
        <table className="mgr-table">
          <thead>
            <tr>
              <th>Nomi</th>
              <th>Turi</th>
              <th>Tannarx, $</th>
              <th>Birlik</th>
              <th>Yumshoq yopiladi</th>
              <th>1C kodi</th>
              <th>Narxi, so&apos;m</th>
              <th>Holati</th>
            </tr>
          </thead>
          {brands.map((b) => (
            <tbody key={b} data-testid={`mgr-hw-brand-${b}`}>
              <tr className="mgr-group-row">
                <th colSpan={8}>
                  {b} <small>({sorted.filter((h) => brandOf(h) === b).length} ta)</small>
                </th>
              </tr>
              {sorted
                .filter((h) => brandOf(h) === b)
                .map((h) => {
                  const di = draft.hardware.findIndex((x) => x.id === h.id);
                  const added = di >= 0 ? draft.hardware[di] : undefined;
                  const name = added
                    ? `${added.brand} ${added.model}`
                    : h.model
                      ? `${h.brand} ${h.model}`.trim()
                      : h.brand;
                  const price = list.hardware[h.id] ?? 0;
                  return (
                    <tr key={h.id} data-testid={`mgr-hw-row-${h.id}`}>
                      <td>
                        <span className="mgr-name">
                          {name}
                          <small>
                            {h.erpName || h.id}
                            {added && <b className="mgr-badge">qo&apos;shilgan</b>}
                          </small>
                        </span>
                      </td>
                      <td>{HW_KIND[h.kind] ?? h.kind}</td>
                      <td>{h.costUsd !== undefined ? `$${h.costUsd}` : '—'}</td>
                      <td>{UNIT_LABEL[h.unit] ?? h.unit}</td>
                      <td>{h.softClose ? 'Ha' : "Yo'q"}</td>
                      <td>
                        <input
                          type="text"
                          className="mgr-erp"
                          value={list.erpCodes?.[h.id] ?? ''}
                          placeholder="—"
                          onChange={(e) =>
                            edit({
                              ...list,
                              erpCodes: { ...list.erpCodes, [h.id]: e.target.value },
                            })
                          }
                          aria-label={`${name}: 1C kodi`}
                          data-testid={`mgr-erp-${h.id}`}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={price}
                          onChange={(e) =>
                            edit({
                              ...list,
                              hardware: { ...list.hardware, [h.id]: Number(e.target.value) },
                            })
                          }
                          aria-label={`${name}: narxi`}
                          data-testid={`mgr-hw-${h.id}`}
                        />
                        {price > 0 && <small className="mgr-sub">{money(price)}</small>}
                      </td>
                      <td>
                        {added ? (
                          <label className="mgr-inline">
                            <input
                              type="checkbox"
                              checked={added.visible}
                              onChange={(e) => setH(di, { visible: e.target.checked })}
                              aria-label={`${name}: sotuvda`}
                            />
                            {added.visible ? 'Sotuvda' : 'Yashirin'}
                          </label>
                        ) : (
                          <span className={h.use === 'kiosk' || !h.use ? 'mgr-yes' : 'mgr-sub'}>
                            {HW_USE[h.use ?? 'kiosk']}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
