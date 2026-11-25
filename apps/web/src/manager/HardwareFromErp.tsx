import { type PriceList } from '@dafna/engine';
import { useContext, useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import { cleanName, guessFromName, somPrice } from './ErpCatalogSection';
import {
  ERP_ERRORS,
  ErpContext,
  ErpThumb,
  PictureChoice,
  pictureWarning,
  usePictures,
  type ErpItem,
  type ErpPrice,
} from './erp';
import { NEW_HARDWARE, money, type HardwareDraft } from './model';

/**
 * D-33: "+ Yangi furnitura" takes the item from Dafna's 1C: search among hardware only, pick one,
 * then say what the kiosk shows (hinge or slide, brand, model, soft close, a text for the
 * customer). It is linked to its 1C article and priced from 1C on "Saqlash".
 */
export function HardwareFromErp({
  list,
  onAdd,
  onManual,
  onClose,
}: {
  list: PriceList;
  /** D-53: `warning` = the picture was not saved (why) */
  onAdd: (h: HardwareDraft, warning?: string) => void;
  /** 1C has no such item: add by hand as before */
  onManual: () => void;
  onClose: () => void;
}) {
  const api = useContext(ErpContext);
  const [sub, setSub] = useState<'hinge' | 'slide'>('hinge');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<(ErpItem & Partial<ErpPrice>)[] | null>(null);
  const [picked, setPicked] = useState<(ErpItem & Partial<ErpPrice>) | null>(null);
  // D-34: eman.uz pictures of the results
  const pics = usePictures((rows ?? []).map((r) => r.article));

  const find = async (e: FormEvent) => {
    e.preventDefault();
    if (!api || q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    const r = await api.search(q.trim(), { group: 'hardware', sub });
    if (!r.ok) {
      setBusy(false);
      return setError(ERP_ERRORS[r.code] ?? ERP_ERRORS.network!);
    }
    const p = await api.prices(r.value.map((i) => i.article).filter(Boolean));
    setBusy(false);
    setRows(r.value.map((i) => ({ ...i, ...(p.ok ? p.value[i.article] : {}), name: i.name })));
  };

  return (
    <div className="mgr-modal" role="dialog" aria-label="Yangi furnitura" data-testid="hw-from-erp">
      <div className="mgr-card mgr-modal-card">
        <header className="mgr-modal-head">
          <h3>Yangi furnitura — 1C dan</h3>
          <Button variant="secondary" onClick={onClose}>
            Yopish
          </Button>
        </header>
        {!api && <p className="mgr-note">1C ulanmagan.</p>}
        {api && !picked && (
          <>
            <div className="segmented" role="radiogroup" aria-label="Turi">
              {(
                [
                  ['hinge', 'Petlya'],
                  ['slide', "Yo'naltiruvchi"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={sub === v}
                  className={sub === v ? 'segment active' : 'segment'}
                  onClick={() => {
                    setSub(v);
                    setRows(null);
                  }}
                  data-testid={`hw-erp-sub-${v}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <form className="mgr-toolbar" onSubmit={find}>
              <input
                type="search"
                autoFocus
                value={q}
                placeholder="Brend yoki model: «Hettich Sensys», «Quadro», «Master 18MM»"
                onChange={(e) => setQ(e.target.value)}
                data-testid="hw-erp-q"
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
            {rows && rows.length === 0 && (
              <p className="mgr-note">1C furniturasi ichida topilmadi.</p>
            )}
            {rows && rows.length > 0 && (
              <ul className="mgr-erp-list">
                {rows.map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      disabled={!r.article}
                      onClick={() => setPicked(r)}
                      data-testid={`hw-erp-item-${r.article}`}
                    >
                      <span className="mgr-erp-row">
                        <ErpThumb src={pics[r.article]} alt="" />
                        {r.name}
                      </span>
                      <small>
                        {r.article ? `artikul ${r.article}` : "artikuli yo'q"}
                        {r.price != null && ` · ${money(r.price)} ${r.currency ?? ''}`}
                        {r.stock != null && ` · qoldiq ${r.stock}`}
                        {r.kind && ` · ${r.kind}`}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {picked && (
          <HardwareForm
            row={picked}
            picture={pics[picked.article]}
            sub={sub}
            list={list}
            onBack={() => setPicked(null)}
            onAdd={onAdd}
          />
        )}
        <p className="mgr-note">
          1C da yo&apos;qmi?{' '}
          <button type="button" className="mgr-link" onClick={onManual}>
            Qo&apos;lda qo&apos;shish
          </button>
        </p>
      </div>
    </div>
  );
}

function HardwareForm({
  row,
  picture,
  sub,
  list,
  onBack,
  onAdd,
}: {
  row: ErpItem & Partial<ErpPrice>;
  picture?: string | null;
  sub: 'hinge' | 'slide';
  list: PriceList;
  onBack: () => void;
  /** D-53: `warning` = the picture was not saved (why) */
  onAdd: (h: HardwareDraft, warning?: string) => void;
}) {
  const g = guessFromName(row.name);
  const [brand, setBrand] = useState(g.brand);
  const [model, setModel] = useState(modelOf(row.name, g.brand));
  const [softClose, setSoft] = useState(g.softClose);
  const [info, setInfo] = useState('');
  const api = useContext(ErpContext);
  const [take, setTake] = useState(true);
  const [busy, setBusy] = useState(false);
  const price = somPrice(
    { price: row.price ?? null, currency: row.currency ?? null, unit: row.unit },
    list,
  );
  return (
    <div className="mgr-grid" data-testid="hw-erp-form">
      <p className="mgr-note" style={{ gridColumn: '1 / -1' }}>
        1C: {row.name} · artikul {row.article}
        {price !== undefined && ` · ${money(price)} so'm`}
      </p>
      <label className="mgr-field">
        <span>Brend * (saytda guruh nomi)</span>
        <input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          data-testid="hw-erp-brand"
        />
      </label>
      <label className="mgr-field">
        <span>Model * (saytda kartochka nomi)</span>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          data-testid="hw-erp-model"
        />
      </label>
      <label className="mgr-field">
        <span>Yumshoq yopiladi</span>
        <input type="checkbox" checked={softClose} onChange={(e) => setSoft(e.target.checked)} />
      </label>
      <label className="mgr-field" style={{ gridColumn: '1 / -1' }}>
        <span>Mijoz uchun ma&apos;lumot (saytda kartochkada chiqadi)</span>
        <textarea
          rows={3}
          maxLength={400}
          value={info}
          placeholder="Masalan: Germaniya, 110° ochiladi, yumshoq yopiladi, 20 yil kafolat"
          onChange={(e) => setInfo(e.target.value)}
          data-testid="hw-erp-info"
        />
      </label>
      <div style={{ gridColumn: '1 / -1' }}>
        <PictureChoice src={picture} take={take} setTake={setTake} />
      </div>
      <div className="mgr-inline" style={{ gridColumn: '1 / -1' }}>
        <Button variant="secondary" onClick={onBack}>
          ‹ Boshqasini tanlash
        </Button>
        <Button
          variant="primary"
          disabled={busy || !brand.trim() || !model.trim()}
          onClick={async () => {
            // D-34: the eman.uz picture is copied into our photo store first
            let photoUrl: string | undefined;
            let warning: string | undefined;
            if (take && picture && api) {
              setBusy(true);
              const r = await api.copyPicture(row.article);
              setBusy(false);
              if (r.ok) photoUrl = r.value;
              else warning = pictureWarning(r.code);
            }
            onAdd(
              {
                ...NEW_HARDWARE,
                kind: sub,
                brand: brand.trim(),
                model: model.trim(),
                softClose,
                info: info.trim() || undefined,
                note: `1C: ${row.name}`.slice(0, 200),
                erpArticle: row.article,
                erpPrice: price,
                photoUrl,
              },
              warning,
            );
          }}
          data-testid="hw-erp-add"
        >
          Qo&apos;shish
        </Button>
      </div>
    </div>
  );
}

/** D-33: the kiosk model line from a 1C name: the part before "/", without the brand word */
export function modelOf(name: string, brand: string): string {
  let m = cleanName(name).split('/')[0]!.trim();
  if (brand && m.toLowerCase().startsWith(brand.toLowerCase())) m = m.slice(brand.length).trim();
  return m.slice(0, 60);
}
