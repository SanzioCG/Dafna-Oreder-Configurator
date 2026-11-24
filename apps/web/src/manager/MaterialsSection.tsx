import { allMaterials, type Material, type MaterialTexture, type PriceList } from '@dafna/engine';
import { useMemo, useState } from 'react';
import { translate } from '../i18n/I18n';
import { Button } from '../ui/Button';
import { ErpCodeInput } from './erp';
import {
  EDGE_BAND_KEY,
  KIND_LABEL,
  NEW_MATERIAL,
  USAGE,
  defaultSheet,
  money,
  ERRORS,
  type CatalogDraft,
  type MaterialDraft,
  type UploadTexture,
} from './model';
import { shrinkImage } from './image';

/**
 * D-20 "Materiallar": every board (the built-in catalog and the ones added here) with all its
 * data, its 1C code and its sheet price; the edge band price on top. A row opens its card.
 * A built-in board's catalog data is fixed (versioned catalog); an added board's construction
 * data (kind, thickness, usage, grain, moisture) is locked once saved.
 */
interface Row {
  key: string;
  /** saved id (built-in or added); undefined = new, not saved yet */
  id?: string;
  builtIn: boolean;
  draftIndex?: number;
  name: string;
  code?: string;
  brand?: string;
  kind: string;
  thicknessMm: number;
  colorHex: string;
  grain: boolean;
  moisture: boolean;
  usage: string;
  visible: boolean;
}

const usageOf = (m: Material) =>
  m.kind === 'hdf' ? 'Orqa devor, tortma tagi' : m.kind === 'mdf' ? 'Fasad' : 'Korpus / fasad';

function rows(draft: CatalogDraft): Row[] {
  const builtIn: Row[] = allMaterials.materials
    .filter((m) => m.kind !== 'metal')
    .map((m) => ({
      key: m.id,
      id: m.id,
      builtIn: true,
      name: translate('uz', m.decorName),
      code: m.code,
      brand: undefined,
      kind: m.kind,
      thicknessMm: m.thicknessMm,
      colorHex: m.colorHex,
      grain: m.group === 'wood',
      moisture: /moisture/.test(m.id),
      usage: usageOf(m),
      visible: m.customerVisible,
    }));
  const added: Row[] = draft.materials.map((m, i) => ({
    key: m.id ?? `new-${i}`,
    id: m.id,
    builtIn: false,
    draftIndex: i,
    name: m.name || '(nomsiz)',
    code: m.code,
    brand: m.brand,
    kind: m.kind,
    thicknessMm: m.thicknessMm,
    colorHex: m.colorHex,
    grain: m.grain === true,
    moisture: m.moistureResistant === true,
    usage: USAGE.filter((u) => m.usage.includes(u.value))
      .map((u) => u.label)
      .join(', '),
    visible: m.visible,
  }));
  return [...added, ...builtIn];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mgr-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function YesNo({ v }: { v: boolean }) {
  return <span className={v ? 'mgr-yes' : 'mgr-no'}>{v ? 'Ha' : "Yo'q"}</span>;
}

export function MaterialsSection({
  list,
  edit,
  draft,
  setDraft,
  uploadTexture,
}: {
  list: PriceList;
  edit: (l: PriceList) => void;
  draft: CatalogDraft;
  setDraft: (d: CatalogDraft) => void;
  uploadTexture: UploadTexture;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const all = useMemo(() => rows(draft), [draft]);
  const q = query.trim().toLowerCase();
  const shown = all.filter(
    (r) =>
      (!kind || r.kind === kind) &&
      (!q ||
        [r.name, r.code, r.brand, list.erpCodes?.[r.id ?? '']].join(' ').toLowerCase().includes(q)),
  );

  const sheet = (id: string) => list.boardSheets?.[id] ?? { price: 0, ...defaultSheet(id) };
  const putSheet = (id: string, patch: Partial<ReturnType<typeof sheet>>) =>
    edit({ ...list, boardSheets: { ...list.boardSheets, [id]: { ...sheet(id), ...patch } } });
  const putErp = (id: string, v: string) =>
    edit({ ...list, erpCodes: { ...list.erpCodes, [id]: v } });
  const setM = (i: number, patch: Partial<MaterialDraft>) =>
    setDraft({
      ...draft,
      materials: draft.materials.map((m, j) => (j === i ? { ...m, ...patch } : m)),
    });

  const putTexture = (id: string, t: MaterialTexture | null) => {
    const textures = { ...draft.textures };
    if (t) textures[id] = t;
    else delete textures[id];
    setDraft({ ...draft, textures });
  };
  /** an unsaved new material can be dropped (a saved one is never deleted, only hidden) */
  const dropNew = (i: number) => {
    setDraft({ ...draft, materials: draft.materials.filter((_, j) => j !== i) });
    setOpen(null);
  };

  const addNew = () => {
    // one blank new material at a time: open it instead of adding another
    const blank = draft.materials.findIndex((m) => m.id === undefined && !m.name.trim());
    if (blank >= 0) return setOpen(`new-${blank}`);
    setDraft({ ...draft, materials: [{ ...NEW_MATERIAL }, ...draft.materials] });
    // the new draft takes index 0; earlier drafts move down
    setOpen('new-0');
  };

  return (
    <section className="mgr-section" data-testid="mgr-materials">
      <header className="mgr-section-head">
        <div>
          <h2>Materiallar</h2>
          <p className="mgr-note">
            Barcha plitalar: asosiy katalog va shu yerda qo&apos;shilganlar. Qatorni bosing —
            materialning to&apos;liq kartochkasi ochiladi. Narx 1 list uchun kiritiladi, 1 m² narxi
            o&apos;zi hisoblanadi. «1C kodi» — 1C&apos;dagi artikul (narxlar shu kod bo&apos;yicha
            olinadi). Narxi 0 bo&apos;lsa, sinov narxi ishlatiladi.
          </p>
        </div>
        <Button variant="primary" onClick={addNew} data-testid="mgr-material-add">
          + Yangi material
        </Button>
      </header>

      <div className="mgr-card mgr-edge" data-testid="mgr-edge-band">
        <strong>Kromka lentasi</strong>
        <Field label="Narxi, 1 metr">
          <span className="mgr-input">
            <input
              type="number"
              min={0}
              value={list.edgePerM}
              onChange={(e) => edit({ ...list, edgePerM: Number(e.target.value) })}
              data-testid="mgr-edge-price"
            />
            <em>so&apos;m</em>
          </span>
        </Field>
        <Field label="1C kodi">
          <ErpCodeInput
            value={list.erpCodes?.[EDGE_BAND_KEY] ?? ''}
            onChange={(v) => putErp(EDGE_BAND_KEY, v)}
            label="Kromka: 1C kodi"
            testId="mgr-erp-edge"
          />
        </Field>
        <p className="mgr-note">Kromkalash ishi «Xizmatlar» bo&apos;limida (1 metr uchun).</p>
      </div>

      <div className="mgr-toolbar">
        <input
          type="search"
          placeholder="Qidirish: nomi, dekor kodi, 1C kodi"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Materiallarni qidirish"
          data-testid="mgr-material-search"
        />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Turi bo'yicha">
          <option value="">Barcha turlar</option>
          <option value="ldsp">LDSP</option>
          <option value="mdf">MDF / LMDF</option>
          <option value="hdf">HDF</option>
        </select>
        <span className="mgr-count">{shown.length} ta</span>
      </div>

      <div className="mgr-card mgr-table-wrap">
        <table className="mgr-table mgr-rows">
          <thead>
            <tr>
              <th>Material</th>
              <th>Turi</th>
              <th>Qalinligi</th>
              <th>Tekstura</th>
              <th>1C kodi</th>
              <th>List, mm</th>
              <th>1 list narxi</th>
              <th>1 m²</th>
              <th>Holati</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const s = r.id ? sheet(r.id) : null;
              const perM2 = s && s.price > 0 ? s.price / ((s.lengthMm * s.widthMm) / 1e6) : 0;
              const isOpen = open === r.key;
              return [
                <tr
                  key={r.key}
                  className={isOpen ? 'mgr-row open' : 'mgr-row'}
                  onClick={() => setOpen(isOpen ? null : r.key)}
                  data-testid={`mgr-material-row-${r.key}`}
                >
                  <td>
                    <span className="mgr-mat">
                      <span
                        className="mgr-swatch"
                        style={{
                          background:
                            r.id && draft.textures?.[r.id]
                              ? `center / cover url(${draft.textures[r.id]!.url})`
                              : r.colorHex,
                        }}
                      />
                      <span className="mgr-name">
                        {r.name}
                        <small>
                          {[r.brand, r.code].filter(Boolean).join(' · ') || '—'}
                          {!r.builtIn && <b className="mgr-badge">qo&apos;shilgan</b>}
                          {!r.id && <b className="mgr-badge warn">saqlanmagan</b>}
                        </small>
                      </span>
                    </span>
                  </td>
                  <td>{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td>{r.thicknessMm} mm</td>
                  <td>
                    <YesNo v={r.grain} />
                  </td>
                  <td>{(r.id && list.erpCodes?.[r.id]) || '—'}</td>
                  <td>{s ? `${s.lengthMm} × ${s.widthMm}` : '—'}</td>
                  <td>{s && s.price > 0 ? money(s.price) : '—'}</td>
                  <td>{perM2 > 0 ? money(perM2) : '—'}</td>
                  <td>
                    {r.visible ? (
                      <span className="mgr-yes">Sotuvda</span>
                    ) : (
                      <span className="mgr-no">Yashirin</span>
                    )}
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${r.key}-card`} className="mgr-card-row">
                    <td colSpan={9}>
                      <MaterialCard
                        row={r}
                        draft={
                          r.draftIndex !== undefined ? draft.materials[r.draftIndex] : undefined
                        }
                        setDraft={(patch) =>
                          r.draftIndex !== undefined && setM(r.draftIndex, patch)
                        }
                        sheet={r.id ? sheet(r.id) : null}
                        putSheet={(patch) => r.id && putSheet(r.id, patch)}
                        erp={r.id ? (list.erpCodes?.[r.id] ?? '') : ''}
                        putErp={(v) => r.id && putErp(r.id, v)}
                        texture={r.id ? draft.textures?.[r.id] : undefined}
                        putTexture={(t) => r.id && putTexture(r.id, t)}
                        uploadTexture={uploadTexture}
                        onDrop={
                          r.draftIndex !== undefined && !r.id
                            ? () => dropNew(r.draftIndex!)
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MaterialCard({
  row,
  draft,
  setDraft,
  sheet,
  putSheet,
  erp,
  putErp,
  texture,
  putTexture,
  uploadTexture,
  onDrop,
}: {
  texture?: MaterialTexture;
  putTexture: (t: MaterialTexture | null) => void;
  uploadTexture: UploadTexture;
  onDrop?: () => void;
  row: Row;
  draft?: MaterialDraft;
  setDraft: (patch: Partial<MaterialDraft>) => void;
  sheet: { price: number; lengthMm: number; widthMm: number } | null;
  putSheet: (patch: Partial<{ price: number; lengthMm: number; widthMm: number }>) => void;
  erp: string;
  putErp: (v: string) => void;
}) {
  const locked = row.builtIn || draft?.id !== undefined;
  const perM2 =
    sheet && sheet.price > 0 ? sheet.price / ((sheet.lengthMm * sheet.widthMm) / 1e6) : 0;
  return (
    <div className="mgr-detail" data-testid="mgr-material-card">
      <div className="mgr-detail-col">
        <h3>Ma&apos;lumotlar</h3>
        {row.builtIn && (
          <p className="mgr-note">
            Asosiy katalog materiali: ma&apos;lumotlari dasturda (versiyalangan katalog). Bu yerda
            narxi va 1C kodi kiritiladi.
          </p>
        )}
        {locked && !row.builtIn && (
          <p className="mgr-note">
            Turi, qalinligi, tekstura, namlikka chidamliligi va ishlatilishi saqlangandan keyin
            o&apos;zgarmaydi: sexga ketgan arizalar shunga bog&apos;liq.
          </p>
        )}
        <div className="mgr-grid">
          <Field label="Nomi *">
            <input
              type="text"
              value={draft ? draft.name : row.name}
              disabled={!draft}
              onChange={(e) => setDraft({ name: e.target.value })}
              data-testid="mgr-material-name"
            />
          </Field>
          <Field label="Ishlab chiqaruvchi">
            <input
              type="text"
              value={draft ? (draft.brand ?? '') : (row.brand ?? '')}
              disabled={!draft}
              placeholder="Egger, Kronospan…"
              onChange={(e) => setDraft({ brand: e.target.value })}
            />
          </Field>
          <Field label="Dekor kodi">
            <input
              type="text"
              value={draft ? (draft.code ?? '') : (row.code ?? '')}
              disabled={!draft}
              placeholder="H3157 ST12"
              onChange={(e) => setDraft({ code: e.target.value })}
            />
          </Field>
          <Field label="Turi">
            <select
              value={row.kind}
              disabled={locked}
              onChange={(e) => setDraft({ kind: e.target.value as MaterialDraft['kind'] })}
            >
              <option value="ldsp">LDSP</option>
              <option value="mdf">MDF / LMDF</option>
              {row.kind === 'hdf' && <option value="hdf">HDF</option>}
            </select>
          </Field>
          <Field label="Qalinligi">
            <select
              value={row.thicknessMm}
              disabled={locked}
              onChange={(e) => setDraft({ thicknessMm: Number(e.target.value) })}
            >
              {[3, 16, 16.7, 18, 22, 25]
                .filter((t) => t !== 3 || row.thicknessMm === 3)
                .map((t) => (
                  <option key={t} value={t}>
                    {t} mm
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Rangi">
            <span className="mgr-color">
              <input
                type="color"
                value={row.colorHex}
                disabled={!draft}
                onChange={(e) => setDraft({ colorHex: e.target.value })}
              />
              <select
                value={draft ? draft.group : row.grain ? 'wood' : 'plain'}
                disabled={!draft}
                onChange={(e) => setDraft({ group: e.target.value as 'plain' | 'wood' })}
              >
                <option value="plain">Bir rang</option>
                <option value="wood">Yog&apos;och dekor</option>
              </select>
            </span>
          </Field>
        </div>
        <div className="mgr-grid">
          <Field label="Tekstura yo'nalishi bor">
            <input
              type="checkbox"
              checked={row.grain}
              disabled={locked}
              onChange={(e) => setDraft({ grain: e.target.checked })}
            />
          </Field>
          <Field label="Namlikka chidamli">
            <input
              type="checkbox"
              checked={row.moisture}
              disabled={locked}
              onChange={(e) => setDraft({ moistureResistant: e.target.checked })}
            />
          </Field>
          <Field label="Mijozga ko'rinadi (sotuvda)">
            <input
              type="checkbox"
              checked={row.visible}
              disabled={!draft}
              onChange={(e) => setDraft({ visible: e.target.checked })}
            />
          </Field>
        </div>
        <Field label="Qayerda ishlatiladi *">
          {draft ? (
            <span className="mgr-checks">
              {USAGE.map((u) => (
                <label key={u.value}>
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={draft.usage.includes(u.value)}
                    onChange={(e) =>
                      setDraft({
                        usage: e.target.checked
                          ? [...draft.usage, u.value]
                          : draft.usage.filter((x) => x !== u.value),
                      })
                    }
                  />
                  {u.label}
                </label>
              ))}
            </span>
          ) : (
            <span>{row.usage}</span>
          )}
        </Field>
        {draft && (
          <Field label="Izoh (yetkazib beruvchi, muddat…)">
            <input
              type="text"
              value={draft.note ?? ''}
              onChange={(e) => setDraft({ note: e.target.value })}
            />
          </Field>
        )}
      </div>

      <div className="mgr-detail-col">
        <h3>Narx va 1C</h3>
        {sheet ? (
          <>
            <Field label="1C kodi (artikul)">
              <ErpCodeInput
                value={erp}
                onChange={putErp}
                label="1C kodi"
                testId={`mgr-erp-${row.id}`}
              />
            </Field>
            <Field label="1 list narxi">
              <span className="mgr-input">
                <input
                  type="number"
                  min={0}
                  value={sheet.price}
                  onChange={(e) => putSheet({ price: Number(e.target.value) })}
                  data-testid={`mgr-sheet-${row.id}`}
                />
                <em>so&apos;m</em>
              </span>
            </Field>
            <Field label="List o'lchami, mm">
              <span className="mgr-size">
                <input
                  type="number"
                  min={500}
                  value={sheet.lengthMm}
                  onChange={(e) => putSheet({ lengthMm: Number(e.target.value) })}
                  aria-label="List uzunligi"
                />
                ×
                <input
                  type="number"
                  min={500}
                  value={sheet.widthMm}
                  onChange={(e) => putSheet({ widthMm: Number(e.target.value) })}
                  aria-label="List eni"
                />
              </span>
            </Field>
            <p className="mgr-big">
              1 m²: <strong>{perM2 > 0 ? `${money(perM2)} so'm` : 'sinov narxi'}</strong>
            </p>
          </>
        ) : (
          <p className="mgr-note">
            Yangi material: avval «Saqlash» ni bosing, keyin narxi, 1C kodi va teksturasini
            kiriting.
          </p>
        )}
        {row.id && (
          <TextureBlock
            id={row.id}
            texture={texture}
            putTexture={putTexture}
            uploadTexture={uploadTexture}
          />
        )}
        {onDrop && (
          <button
            type="button"
            className="mgr-del"
            onClick={onDrop}
            data-testid="mgr-material-drop"
          >
            Bekor qilish (saqlanmagan materialni olib tashlash)
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * D-21: the decor photo: shown on the 3D model and on the kiosk swatch. The photo shows a real
 * area of the board (width x height, mm), so the 3D view tiles it at true scale.
 */
function TextureBlock({
  id,
  texture,
  putTexture,
  uploadTexture,
}: {
  id: string;
  texture?: MaterialTexture;
  putTexture: (t: MaterialTexture | null) => void;
  uploadTexture: UploadTexture;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const image = await shrinkImage(file);
      const r = await uploadTexture(id, image);
      if (!r.ok) setError(ERRORS[r.code] ?? ERRORS.network!);
      else
        putTexture({
          url: r.url,
          widthMm: texture?.widthMm ?? 1000,
          heightMm: texture?.heightMm ?? 1000,
        });
    } catch {
      setError("Rasmni o'qib bo'lmadi");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mgr-texture" data-testid="mgr-texture">
      <h3>Tekstura (dekor rasmi)</h3>
      <p className="mgr-note">
        Rasm 3D ko&apos;rinishda va kioskdagi rang tanlovida chiqadi. Dekorning tekis, yorug&apos;
        rasmini yuklang (JPG yoki PNG); katta rasm avtomatik kichraytiriladi.
      </p>
      {texture && (
        <img
          className="mgr-texture-img"
          src={texture.url}
          alt="Tekstura"
          data-testid="mgr-texture-img"
        />
      )}
      <label className="mgr-upload">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => void pick(e.target.files?.[0])}
          data-testid="mgr-texture-file"
        />
        <span>{busy ? 'Yuklanmoqda…' : texture ? 'Boshqa rasm yuklash' : 'Rasm yuklash'}</span>
      </label>
      {texture && (
        <>
          <label className="mgr-field">
            <span>Rasm qancha joyni ko&apos;rsatadi, mm (eni × bo&apos;yi)</span>
            <span className="mgr-size">
              <input
                type="number"
                min={50}
                value={texture.widthMm}
                onChange={(e) => putTexture({ ...texture, widthMm: Number(e.target.value) })}
                aria-label="Rasm eni, mm"
              />
              ×
              <input
                type="number"
                min={50}
                value={texture.heightMm}
                onChange={(e) => putTexture({ ...texture, heightMm: Number(e.target.value) })}
                aria-label="Rasm bo'yi, mm"
              />
            </span>
          </label>
          <button type="button" className="mgr-del" onClick={() => putTexture(null)}>
            Teksturani olib tashlash
          </button>
        </>
      )}
      {error && (
        <p className="mgr-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
