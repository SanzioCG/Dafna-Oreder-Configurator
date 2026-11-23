import {
  EMPTY_EXTENSION,
  PRODUCT_TEMPLATES,
  allMaterials,
  applyCatalogExtension,
  catalogForTemplate,
  computeBom,
  computePrice,
  defaultParams,
  generate,
  getMaterial,
  hardwareV1,
  toMaterial,
  type CatalogExtension,
  type CustomHardware,
  type CustomMaterial,
  type Material,
  type PriceList,
  type PriceService,
} from '@dafna/engine';
import { useMemo, useState, type FormEvent } from 'react';
import { translate } from '../i18n/I18n';
import { Button } from '../ui/Button';
import { managerLoad, managerSave, type ManagerOutcome } from './managerApi';

/**
 * D-19 / D-20: the manager's admin page (`/manager`, own PIN: env MANAGER_PIN).
 * - Narxlar: profit %, labour, edge band, assembly, services, sheet prices of the boards and
 *   hardware prices, each with its 1C (ERP) article; the kiosk price is computed from them on
 *   the server and customers only ever see the final number.
 * - Materiallar / Furnitura: new boards and hinges / slides. They appear in the kiosk at once.
 *   Nothing is ever deleted (only hidden from customers), and a saved entry's construction
 *   fields are locked, so every stored application still regenerates.
 * Sheet prices will come from Dafna's 1C; until it is connected they are typed here.
 * An internal page for Dafna's office: Uzbek only.
 */

/** the sheet size GibLab assumes (server/giblab.ts sheetSize): EGGER and HDF/MDF 2800 × 2070,
 * other chipboard 2750 × 1830 — the manager corrects it per board */
const defaultSheet = (id: string) => {
  const m = getMaterial(allMaterials, id);
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

const BASIS: { value: PriceService['basis']; label: string }[] = [
  { value: 'm2', label: '1 m² plita' },
  { value: 'edge_m', label: '1 metr kromka' },
  { value: 'product', label: '1 dona mahsulot' },
  { value: 'pct', label: '% (boshqa xarajatlardan)' },
];

const USAGE: { value: CustomMaterial['usage'][number]; label: string }[] = [
  { value: 'corpus', label: 'Korpus' },
  { value: 'door', label: 'Fasad / eshik' },
  { value: 'top', label: 'Stoleshnitsa' },
];

/** boards a product can be made of (built-in + added; metal frame finishes are bought parts) */
const boards = (ext: CatalogExtension): Material[] => [
  ...allMaterials.materials.filter((m) => m.kind !== 'metal'),
  ...ext.materials.map(toMaterial),
];

const boardLabel = (m: Material) =>
  [m.code, translate('uz', m.decorName), `${m.thicknessMm} mm`].filter(Boolean).join(' · ');

const money = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const ERRORS: Record<string, string> = {
  wrong_pin: "PIN noto'g'ri",
  rate_limited: "Juda ko'p urinish: 10 daqiqadan keyin qayta urining",
  not_configured: "Menejer PIN'i serverda sozlanmagan (Vercel: MANAGER_PIN)",
  invalid_price: "Narxlardan biri noto'g'ri",
  invalid_catalog: "Material yoki furnituradan biri to'liq emas",
  network: "Server bilan aloqa yo'q",
};
const errorText = (o: Extract<ManagerOutcome, { ok: false }>) =>
  (ERRORS[o.code] ?? ERRORS.network!) + (o.field ? ` (${o.field})` : '');

/** a list with every board / hardware / product row present (missing ones = 0) */
function complete(list: PriceList, ext: CatalogExtension): PriceList {
  const boardSheets = { ...list.boardSheets };
  for (const b of boards(ext)) boardSheets[b.id] ??= { price: 0, ...defaultSheet(b.id) };
  const hardware = { ...list.hardware };
  for (const h of hardwareV1.items) hardware[h.id] ??= 0;
  const assembly = { ...list.assembly };
  for (const p of PRODUCTS) assembly[p.type] ??= 0;
  return { ...list, boardSheets, hardware, assembly, services: list.services ?? [] };
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
            <th>Xizmatlar</th>
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
              <td>{money(r.servicesTotal)}</td>
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

function ErpInput({
  list,
  id,
  label,
  edit,
}: {
  list: PriceList;
  id: string;
  label: string;
  edit: (l: PriceList) => void;
}) {
  return (
    <input
      type="text"
      className="mgr-erp"
      value={list.erpCodes?.[id] ?? ''}
      placeholder="—"
      onChange={(e) => edit({ ...list, erpCodes: { ...list.erpCodes, [id]: e.target.value } })}
      aria-label={`${label}: 1C kodi`}
      data-testid={`mgr-erp-${id}`}
    />
  );
}

function PricesTab({
  list,
  ext,
  edit,
}: {
  list: PriceList;
  ext: CatalogExtension;
  edit: (l: PriceList) => void;
}) {
  const setNum = (key: 'markupPct' | 'laborPerM2' | 'edgePerM') => (v: number) =>
    edit({ ...list, [key]: v });
  const services = list.services ?? [];
  const setService = (i: number, patch: Partial<PriceService>) =>
    edit({ ...list, services: services.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <>
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

      <section className="mgr-card" data-testid="mgr-services">
        <h2>Xizmatlar</h2>
        <p className="mgr-note">
          Narxga qo&apos;shiladigan ishlar: kesish, parmalash, yetkazish, o&apos;rnatish… Mahsulot
          belgilanmasa — hammasiga qo&apos;llanadi.
        </p>
        {services.length > 0 && (
          <table className="mgr-table">
            <thead>
              <tr>
                <th>Nomi</th>
                <th>Nimaga qarab</th>
                <th>Mahsulotlar</th>
                <th>Narx, so&apos;m / %</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {services.map((s, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="text"
                      value={s.name}
                      onChange={(e) => setService(i, { name: e.target.value })}
                      aria-label={`Xizmat ${i + 1}: nomi`}
                      data-testid={`mgr-service-name-${i}`}
                    />
                  </td>
                  <td>
                    <select
                      value={s.basis}
                      onChange={(e) =>
                        setService(i, { basis: e.target.value as PriceService['basis'] })
                      }
                      aria-label={`Xizmat ${i + 1}: hisob turi`}
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
                    <div className="mgr-checks">
                      {PRODUCTS.map((p) => (
                        <label key={p.type}>
                          <input
                            type="checkbox"
                            checked={s.products.includes(p.type)}
                            onChange={(e) =>
                              setService(i, {
                                products: e.target.checked
                                  ? [...s.products, p.type]
                                  : s.products.filter((x) => x !== p.type),
                              })
                            }
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={s.price}
                      onChange={(e) => setService(i, { price: Number(e.target.value) })}
                      aria-label={`Xizmat ${i + 1}: narxi`}
                      data-testid={`mgr-service-price-${i}`}
                    />
                  </td>
                  <td>
                    <Button
                      variant="text"
                      onClick={() =>
                        edit({ ...list, services: services.filter((_, j) => j !== i) })
                      }
                    >
                      O&apos;chirish
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div>
          <Button
            onClick={() =>
              edit({
                ...list,
                services: [
                  ...services,
                  {
                    id: `s_${services.length + 1}`,
                    name: '',
                    basis: 'product',
                    products: [],
                    price: 0,
                  },
                ],
              })
            }
            data-testid="mgr-service-add"
          >
            + Xizmat qo&apos;shish
          </Button>
        </div>
      </section>

      <Preview list={list} />

      <section className="mgr-card">
        <h2>Listlar (plitalar)</h2>
        <p className="mgr-note" data-testid="mgr-erp-note">
          List narxlari Dafna 1C&apos;dan olinadi. 1C hali ulanmagan: narxni shu yerda kiriting. «1C
          kodi» — 1C&apos;dagi artikul: ulanganda narx shu kod bo&apos;yicha olinadi. Narxi 0
          bo&apos;lgan list uchun sinov narxi (1 m²) ishlatiladi.
        </p>
        <table className="mgr-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>1C kodi</th>
              <th>1 list narxi, so&apos;m</th>
              <th>List o&apos;lchami, mm</th>
              <th>1 m²</th>
            </tr>
          </thead>
          <tbody>
            {boards(ext).map((b) => {
              const s = list.boardSheets?.[b.id] ?? { price: 0, ...defaultSheet(b.id) };
              const put = (patch: Partial<typeof s>) =>
                edit({ ...list, boardSheets: { ...list.boardSheets, [b.id]: { ...s, ...patch } } });
              const perM2 = s.price > 0 ? s.price / ((s.lengthMm * s.widthMm) / 1e6) : 0;
              const label = boardLabel(b);
              return (
                <tr key={b.id}>
                  <td>{label}</td>
                  <td>
                    <ErpInput list={list} id={b.id} label={label} edit={edit} />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={s.price}
                      onChange={(e) => put({ price: Number(e.target.value) })}
                      aria-label={`${label}: list narxi`}
                      data-testid={`mgr-sheet-${b.id}`}
                    />
                  </td>
                  <td className="mgr-size">
                    <input
                      type="number"
                      min={500}
                      value={s.lengthMm}
                      onChange={(e) => put({ lengthMm: Number(e.target.value) })}
                      aria-label={`${label}: uzunligi`}
                    />
                    ×
                    <input
                      type="number"
                      min={500}
                      value={s.widthMm}
                      onChange={(e) => put({ widthMm: Number(e.target.value) })}
                      aria-label={`${label}: eni`}
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
        <h2>Furnitura narxlari</h2>
        <table className="mgr-table">
          <thead>
            <tr>
              <th>Nomi</th>
              <th>1C kodi</th>
              <th>Narxi, so&apos;m</th>
            </tr>
          </thead>
          <tbody>
            {hardwareV1.items.map((h) => {
              const added = ext.hardware.find((x) => x.id === h.id);
              const label = added
                ? `${HW_KIND[h.kind] ?? h.kind} · ${added.brand} ${added.model}`
                : `${HW_KIND[h.kind] ?? h.kind} · ${h.brand}${h.softClose ? ' · yumshoq yopiladi' : ''}`;
              return (
                <tr key={h.id}>
                  <td>{label}</td>
                  <td>
                    <ErpInput list={list} id={h.id} label={label} edit={edit} />
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
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}

/** a material being added (no id until saved) or a saved one */
type MaterialDraft = Omit<CustomMaterial, 'id'> & { id?: string };
type HardwareDraft = Omit<CustomHardware, 'id' | 'brandKey'> & { id?: string; brandKey?: string };
export interface CatalogDraft {
  materials: MaterialDraft[];
  hardware: HardwareDraft[];
}

const NEW_MATERIAL: MaterialDraft = {
  kind: 'ldsp',
  name: '',
  code: '',
  thicknessMm: 16,
  colorHex: '#c8b49a',
  group: 'wood',
  usage: ['corpus', 'door'],
  visible: true,
};

function MaterialsTab({
  draft,
  setDraft,
}: {
  draft: CatalogDraft;
  setDraft: (d: CatalogDraft) => void;
}) {
  const set = (i: number, patch: Partial<MaterialDraft>) =>
    setDraft({
      ...draft,
      materials: draft.materials.map((m, j) => (j === i ? { ...m, ...patch } : m)),
    });
  return (
    <section className="mgr-card" data-testid="mgr-materials">
      <h2>Qo&apos;shilgan materiallar</h2>
      <p className="mgr-note">
        Yangi plita saqlangandan keyin kioskda darhol tanlash mumkin bo&apos;ladi. Material
        o&apos;chirilmaydi — eski arizalar uchun saqlanadi; mijozdan yashirish uchun «Mijozga
        ko&apos;rinadi» belgisini oling. Turi, qalinligi va ishlatilishi saqlangandan keyin
        o&apos;zgarmaydi (sexga ketgan arizalar shunga bog&apos;liq). Narxini «Narxlar»
        bo&apos;limida kiriting.
      </p>
      {draft.materials.length > 0 && (
        <table className="mgr-table">
          <thead>
            <tr>
              <th>Nomi</th>
              <th>Dekor kodi</th>
              <th>Turi</th>
              <th>Qalinligi</th>
              <th>Rang</th>
              <th>Ishlatilishi</th>
              <th>Mijozga ko&apos;rinadi</th>
            </tr>
          </thead>
          <tbody>
            {draft.materials.map((m, i) => {
              const locked = m.id !== undefined;
              return (
                <tr key={m.id ?? `new-${i}`} data-testid={`mgr-material-${i}`}>
                  <td>
                    <input
                      type="text"
                      value={m.name}
                      onChange={(e) => set(i, { name: e.target.value })}
                      aria-label={`Material ${i + 1}: nomi`}
                      data-testid={`mgr-material-name-${i}`}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={m.code ?? ''}
                      onChange={(e) => set(i, { code: e.target.value })}
                      aria-label={`Material ${i + 1}: dekor kodi`}
                    />
                  </td>
                  <td>
                    <select
                      value={m.kind}
                      disabled={locked}
                      onChange={(e) => set(i, { kind: e.target.value as MaterialDraft['kind'] })}
                      aria-label={`Material ${i + 1}: turi`}
                    >
                      <option value="ldsp">LDSP</option>
                      <option value="mdf">MDF / LMDF</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={m.thicknessMm}
                      disabled={locked}
                      onChange={(e) => set(i, { thicknessMm: Number(e.target.value) })}
                      aria-label={`Material ${i + 1}: qalinligi`}
                    >
                      {[16, 16.7, 18, 22, 25].map((t) => (
                        <option key={t} value={t}>
                          {t} mm
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="mgr-color">
                      <input
                        type="color"
                        value={m.colorHex}
                        onChange={(e) => set(i, { colorHex: e.target.value })}
                        aria-label={`Material ${i + 1}: rangi`}
                      />
                      <select
                        value={m.group}
                        onChange={(e) => set(i, { group: e.target.value as 'plain' | 'wood' })}
                        aria-label={`Material ${i + 1}: guruhi`}
                      >
                        <option value="plain">Bir rang</option>
                        <option value="wood">Yog&apos;och</option>
                      </select>
                    </div>
                  </td>
                  <td>
                    <div className="mgr-checks">
                      {USAGE.map((u) => (
                        <label key={u.value}>
                          <input
                            type="checkbox"
                            disabled={locked}
                            checked={m.usage.includes(u.value)}
                            onChange={(e) =>
                              set(i, {
                                usage: e.target.checked
                                  ? [...m.usage, u.value]
                                  : m.usage.filter((x) => x !== u.value),
                              })
                            }
                          />
                          {u.label}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={m.visible}
                      onChange={(e) => set(i, { visible: e.target.checked })}
                      aria-label={`Material ${i + 1}: mijozga ko'rinadi`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div>
        <Button
          onClick={() =>
            setDraft({ ...draft, materials: [...draft.materials, { ...NEW_MATERIAL }] })
          }
          data-testid="mgr-material-add"
        >
          + Material qo&apos;shish
        </Button>
      </div>
    </section>
  );
}

function HardwareTab({
  draft,
  setDraft,
}: {
  draft: CatalogDraft;
  setDraft: (d: CatalogDraft) => void;
}) {
  const set = (i: number, patch: Partial<HardwareDraft>) =>
    setDraft({
      ...draft,
      hardware: draft.hardware.map((h, j) => (j === i ? { ...h, ...patch } : h)),
    });
  return (
    <section className="mgr-card" data-testid="mgr-hardware">
      <h2>Qo&apos;shilgan furnitura</h2>
      <p className="mgr-note">
        Yangi petlya yoki yo&apos;naltiruvchi kioskning «Mexanizmlar» qadamida yangi brend
        bo&apos;lib chiqadi. O&apos;chirilmaydi, faqat mijozdan yashiriladi. Narxini «Narxlar»
        bo&apos;limida kiriting.
      </p>
      {draft.hardware.length > 0 && (
        <table className="mgr-table">
          <thead>
            <tr>
              <th>Turi</th>
              <th>Brend</th>
              <th>Model</th>
              <th>Yumshoq yopiladi</th>
              <th>Mijozga ko&apos;rinadi</th>
            </tr>
          </thead>
          <tbody>
            {draft.hardware.map((h, i) => (
              <tr key={h.id ?? `new-${i}`}>
                <td>
                  <select
                    value={h.kind}
                    disabled={h.id !== undefined}
                    onChange={(e) => set(i, { kind: e.target.value as 'hinge' | 'slide' })}
                    aria-label={`Furnitura ${i + 1}: turi`}
                  >
                    <option value="hinge">Petlya</option>
                    <option value="slide">Yo&apos;naltiruvchi</option>
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    value={h.brand}
                    onChange={(e) => set(i, { brand: e.target.value })}
                    aria-label={`Furnitura ${i + 1}: brend`}
                    data-testid={`mgr-hw-brand-${i}`}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={h.model}
                    onChange={(e) => set(i, { model: e.target.value })}
                    aria-label={`Furnitura ${i + 1}: model`}
                    data-testid={`mgr-hw-model-${i}`}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={h.softClose}
                    onChange={(e) => set(i, { softClose: e.target.checked })}
                    aria-label={`Furnitura ${i + 1}: yumshoq yopiladi`}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={h.visible}
                    onChange={(e) => set(i, { visible: e.target.checked })}
                    aria-label={`Furnitura ${i + 1}: mijozga ko'rinadi`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div>
        <Button
          onClick={() =>
            setDraft({
              ...draft,
              hardware: [
                ...draft.hardware,
                { kind: 'hinge', brand: '', model: '', softClose: true, visible: true },
              ],
            })
          }
          data-testid="mgr-hw-add"
        >
          + Furnitura qo&apos;shish
        </Button>
      </div>
    </section>
  );
}

type Tab = 'prices' | 'materials' | 'hardware';
const TABS: { id: Tab; label: string }[] = [
  { id: 'prices', label: 'Narxlar' },
  { id: 'materials', label: 'Materiallar' },
  { id: 'hardware', label: 'Furnitura' },
];

export function ManagerPage({ fetchImpl }: { fetchImpl?: typeof fetch }) {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<PriceList | null>(null);
  const [ext, setExt] = useState<CatalogExtension>(EMPTY_EXTENSION);
  const [draft, setDraftState] = useState<CatalogDraft>(EMPTY_EXTENSION);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>('prices');

  /** the stored catalog becomes the engine's (labels, preview) and the editable draft */
  const takeCatalog = (c: CatalogExtension) => {
    applyCatalogExtension(c);
    setExt(c);
    setDraftState({ materials: c.materials, hardware: c.hardware });
  };

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await managerLoad(pin, fetchImpl);
    setBusy(false);
    if (!r.ok) return setError(errorText(r));
    const c = r.catalog ?? EMPTY_EXTENSION;
    takeCatalog(c);
    setAuthed(true);
    setList(complete(r.list, c));
    setUpdatedAt(r.updatedAt);
  };

  const save = async () => {
    if (!list) return;
    setBusy(true);
    setError(null);
    const r = await managerSave(pin, list, draft, fetchImpl);
    setBusy(false);
    if (!r.ok) return setError(errorText(r));
    const c = r.catalog ?? ext;
    takeCatalog(c);
    setList(complete(r.list, c));
    setUpdatedAt(r.updatedAt);
    setSaved(true);
  };

  const edit = (next: PriceList) => {
    setList(next);
    setSaved(false);
  };
  const setDraft = (d: CatalogDraft) => {
    setDraftState(d);
    setSaved(false);
  };

  if (!authed || !list) {
    return (
      <main className="mgr-page mgr-login">
        <form className="mgr-card" onSubmit={login}>
          <h1>Dafna: menejer</h1>
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

  return (
    <main className="mgr-page">
      <header className="mgr-head">
        <div>
          <h1>Dafna: menejer</h1>
          <p data-testid="mgr-updated">
            {list.demo || !updatedAt
              ? "Narxlar hali saqlanmagan: kioskda sinov narxlari ko'rinmoqda"
              : `Narxlar oxirgi saqlangan: ${updatedAt}`}
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
      <nav className="mgr-tabs" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            className={tab === x.id ? 'mgr-tab active' : 'mgr-tab'}
            onClick={() => setTab(x.id)}
            data-testid={`mgr-tab-${x.id}`}
          >
            {x.label}
          </button>
        ))}
      </nav>
      {error && (
        <p className="mgr-error" role="alert">
          {error}
        </p>
      )}
      {tab === 'prices' && <PricesTab list={list} ext={ext} edit={edit} />}
      {tab === 'materials' && <MaterialsTab draft={draft} setDraft={setDraft} />}
      {tab === 'hardware' && <HardwareTab draft={draft} setDraft={setDraft} />}
    </main>
  );
}
