import {
  PRODUCT_TEMPLATES,
  allMaterials,
  computeBom,
  computePrice,
  catalogForTemplate,
  defaultParams,
  generate,
  hardwareV1,
  type PriceList,
} from '@dafna/engine';
import { useMemo, useState, type FormEvent } from 'react';
import { translate } from '../i18n/I18n';
import { Button } from '../ui/Button';
import { managerLoad, managerSave, type ManagerOutcome } from './managerApi';

/**
 * D-19: the manager's price page (`/manager`, own PIN: env MANAGER_PIN). The manager keeps the
 * sheet prices of the boards, edge band, hardware, labour, assembly and the profit %; the kiosk
 * price is computed from them on the server and customers only ever see the final number.
 * Board sheet prices will come from Dafna's ERP; until the ERP is connected they are typed here.
 * An internal page for Dafna's office: Uzbek only.
 */
/** the sheet size GibLab assumes (server/giblab.ts sheetSize): EGGER and HDF/MDF 2800 × 2070,
 * other chipboard 2750 × 1830 — the manager corrects it per board */
const defaultSheet = (id: string) => {
  const m = allMaterials.materials.find((x) => x.id === id);
  return m && m.kind === 'ldsp' && !m.code
    ? { lengthMm: 2750, widthMm: 1830 }
    : { lengthMm: 2800, widthMm: 2070 };
};

const HW_KIND: Record<string, string> = {
  hinge: 'Petlya',
  slide: "Yo'naltiruvchi (juft)",
  castor: "G'ildirak",
  lift_frame: "Ko'tariladigan rama",
  rail: 'Shtanga (1 m)',
  rail_holder: 'Shtanga tutqichi',
};

const PRODUCTS: { type: string; label: string }[] = [
  { type: 'wardrobe', label: 'Shkaf' },
  { type: 'pedestal', label: 'Ofis tumbasi' },
  { type: 'desk', label: 'Stol' },
];

/** boards a product can be made of (metal frame finishes are bought parts, not sheets) */
const BOARDS = allMaterials.materials.filter((m) => m.kind !== 'metal');

const boardLabel = (id: string) => {
  const m = BOARDS.find((b) => b.id === id);
  if (!m) return id;
  return [m.code, translate('uz', m.decorName), `${m.thicknessMm} mm`].filter(Boolean).join(' · ');
};

const money = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const ERRORS: Record<string, string> = {
  wrong_pin: "PIN noto'g'ri",
  rate_limited: "Juda ko'p urinish: 10 daqiqadan keyin qayta urining",
  not_configured: "Menejer PIN'i serverda sozlanmagan (Vercel: MANAGER_PIN)",
  invalid_price: "Narxlardan biri noto'g'ri",
  network: "Server bilan aloqa yo'q",
};
const errorText = (o: Extract<ManagerOutcome, { ok: false }>) =>
  (ERRORS[o.code] ?? ERRORS.network!) + (o.field ? ` (${o.field})` : '');

/** a list with every board / hardware / product row present (missing ones = 0) */
function complete(list: PriceList): PriceList {
  const boardSheets = { ...list.boardSheets };
  for (const b of BOARDS) boardSheets[b.id] ??= { price: 0, ...defaultSheet(b.id) };
  const hardware = { ...list.hardware };
  for (const h of hardwareV1.items) hardware[h.id] ??= 0;
  const assembly = { ...list.assembly };
  for (const p of PRODUCTS) assembly[p.type] ??= 0;
  return { ...list, boardSheets, hardware, assembly };
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  testId?: string;
}) {
  return (
    <label className="mgr-field">
      <span>{label}</span>
      <span className="mgr-input">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          data-testid={testId}
        />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  );
}

/** the default model of each product, priced with the list being edited */
function Preview({ list }: { list: PriceList }) {
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
    <section className="mgr-card" data-testid="mgr-preview">
      <h2>Namuna: asosiy modellarning narxi</h2>
      <table className="mgr-table">
        <thead>
          <tr>
            <th>Mahsulot</th>
            <th>Materiallar</th>
            <th>Ish haqi</th>
            <th>Yig&apos;ish</th>
            <th>Foyda</th>
            <th>Mijoz ko&apos;radi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, r }) => (
            <tr key={t.templateId}>
              <td>{PRODUCTS.find((p) => p.type === t.productType)?.label ?? t.templateId}</td>
              <td>{money(r.boards + r.edges + r.hardware)}</td>
              <td>{money(r.labor)}</td>
              <td>{money(r.assembly)}</td>
              <td>{money(r.markup)}</td>
              <td>
                <strong data-testid={`mgr-total-${t.templateId}`}>{money(r.total)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function ManagerPage({ fetchImpl }: { fetchImpl?: typeof fetch }) {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<PriceList | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await managerLoad(pin, fetchImpl);
    setBusy(false);
    if (!r.ok) return setError(errorText(r));
    setAuthed(true);
    setList(complete(r.list));
    setUpdatedAt(r.updatedAt);
  };

  const save = async () => {
    if (!list) return;
    setBusy(true);
    setError(null);
    const r = await managerSave(pin, list, fetchImpl);
    setBusy(false);
    if (!r.ok) return setError(errorText(r));
    setList(complete(r.list));
    setUpdatedAt(r.updatedAt);
    setSaved(true);
  };

  const edit = (next: PriceList) => {
    setList(next);
    setSaved(false);
  };

  if (!authed || !list) {
    return (
      <main className="mgr-page mgr-login">
        <form className="mgr-card" onSubmit={login}>
          <h1>Narxlar: menejer</h1>
          <label className="mgr-field">
            <span>Menejer PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              data-testid="mgr-pin"
            />
          </label>
          {error && (
            <p className="mgr-error" role="alert">
              {error}
            </p>
          )}
          <Button variant="primary" type="submit" disabled={busy || pin.length < 4}>
            Kirish
          </Button>
        </form>
      </main>
    );
  }

  const setNum = (key: 'markupPct' | 'laborPerM2' | 'edgePerM') => (v: number) =>
    edit({ ...list, [key]: v });

  return (
    <main className="mgr-page">
      <header className="mgr-head">
        <div>
          <h1>Narxlar</h1>
          <p data-testid="mgr-updated">
            {list.demo || !updatedAt
              ? "Hali saqlanmagan: kioskda sinov narxlari ko'rinmoqda"
              : `Oxirgi saqlash: ${updatedAt}`}
          </p>
        </div>
        <Button
          variant="success"
          onClick={() => void save()}
          disabled={busy}
          data-testid="mgr-save"
        >
          {busy ? 'Saqlanmoqda…' : saved ? 'Saqlandi' : 'Saqlash'}
        </Button>
      </header>
      {error && (
        <p className="mgr-error" role="alert">
          {error}
        </p>
      )}

      <section className="mgr-card">
        <h2>Umumiy</h2>
        <div className="mgr-grid">
          <NumberField
            label="Foyda (barcha xarajatlardan)"
            value={list.markupPct}
            onChange={setNum('markupPct')}
            suffix="%"
            testId="mgr-markup"
          />
          <NumberField
            label="Ish haqi, 1 m² plita"
            value={list.laborPerM2}
            onChange={setNum('laborPerM2')}
            suffix="so'm"
          />
          <NumberField
            label="Kromka, 1 metr"
            value={list.edgePerM}
            onChange={setNum('edgePerM')}
            suffix="so'm"
          />
        </div>
        <h3>Yig&apos;ish (1 dona mahsulot)</h3>
        <div className="mgr-grid">
          {PRODUCTS.map((p) => (
            <NumberField
              key={p.type}
              label={p.label}
              value={list.assembly?.[p.type] ?? 0}
              onChange={(v) => edit({ ...list, assembly: { ...list.assembly, [p.type]: v } })}
              suffix="so'm"
              testId={`mgr-assembly-${p.type}`}
            />
          ))}
        </div>
      </section>

      <Preview list={list} />

      <section className="mgr-card">
        <h2>Listlar (plitalar)</h2>
        <p className="mgr-note" data-testid="mgr-erp-note">
          List narxlari Dafna ERP&apos;dan olinadi. ERP hali ulanmagan: narxni shu yerda kiriting.
          Narxi 0 bo&apos;lgan list uchun sinov narxi (1 m²) ishlatiladi.
        </p>
        <table className="mgr-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>1 list narxi, so&apos;m</th>
              <th>List o&apos;lchami, mm</th>
              <th>1 m²</th>
            </tr>
          </thead>
          <tbody>
            {BOARDS.map((b) => {
              const s = list.boardSheets?.[b.id] ?? { price: 0, ...defaultSheet(b.id) };
              const put = (patch: Partial<typeof s>) =>
                edit({ ...list, boardSheets: { ...list.boardSheets, [b.id]: { ...s, ...patch } } });
              const perM2 = s.price > 0 ? s.price / ((s.lengthMm * s.widthMm) / 1e6) : 0;
              return (
                <tr key={b.id}>
                  <td>{boardLabel(b.id)}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={s.price}
                      onChange={(e) => put({ price: Number(e.target.value) })}
                      aria-label={`${boardLabel(b.id)}: list narxi`}
                      data-testid={`mgr-sheet-${b.id}`}
                    />
                  </td>
                  <td className="mgr-size">
                    <input
                      type="number"
                      min={500}
                      value={s.lengthMm}
                      onChange={(e) => put({ lengthMm: Number(e.target.value) })}
                      aria-label={`${boardLabel(b.id)}: uzunligi`}
                    />
                    ×
                    <input
                      type="number"
                      min={500}
                      value={s.widthMm}
                      onChange={(e) => put({ widthMm: Number(e.target.value) })}
                      aria-label={`${boardLabel(b.id)}: eni`}
                    />
                  </td>
                  <td>{perM2 > 0 ? money(perM2) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mgr-card">
        <h2>Furnitura</h2>
        <table className="mgr-table">
          <thead>
            <tr>
              <th>Nomi</th>
              <th>Narxi, so&apos;m</th>
            </tr>
          </thead>
          <tbody>
            {hardwareV1.items.map((h) => (
              <tr key={h.id}>
                <td>
                  {HW_KIND[h.kind] ?? h.kind} · {h.brand}
                  {h.softClose ? ' · yumshoq yopiladi' : ''}
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={list.hardware[h.id] ?? 0}
                    onChange={(e) =>
                      edit({
                        ...list,
                        hardware: { ...list.hardware, [h.id]: Number(e.target.value) },
                      })
                    }
                    aria-label={`${h.id}: narxi`}
                    data-testid={`mgr-hw-${h.id}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
