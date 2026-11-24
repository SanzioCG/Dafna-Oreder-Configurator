import {
  EMPTY_EXTENSION,
  applyCatalogExtension,
  type CatalogExtension,
  type PriceList,
} from '@dafna/engine';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { authError, getMe, signIn, signOut, type StaffUser } from '../auth/staffSession';
import { Button } from '../ui/Button';
import { HardwareSection } from './HardwareSection';
import { MaterialsSection } from './MaterialsSection';
import { ProfitSection } from './ProfitSection';
import { ServicesSection } from './ServicesSection';
import { StaffSection } from './StaffSection';
import { ChangePasswordForm, ForgotForm, ResetForm } from './PasswordForms';
import { ERP_ERRORS, ErpContext, applyErpPrices, erpApi } from './erp';
import { ErpCatalogSection } from './ErpCatalogSection';
import { managerLoad, managerSave, managerUploadTexture, type ManagerOutcome } from './managerApi';
import { ERRORS, fieldText, toServiceModel, type CatalogDraft } from './model';

export type { CatalogDraft } from './model';

/**
 * D-19 / D-20: Dafna's admin page (`/manager`; D-38: staff sign in with a login and a password,
 * the admin also manages the staff in "Xodimlar"). Sections:
 * - Materiallar: every board with all its data, 1C code and sheet price; the edge band price;
 *   new boards (they appear in the kiosk at once);
 * - Furnitura: every hardware item with 1C code and price; new hinges / slides;
 * - Xizmatlar: work and services per m² of board, per metre of edge band, per product or %;
 * - Foyda va narx: the overall profit % and the resulting price of each product.
 * The kiosk price is computed from these on the server; customers only see the final number.
 * Nothing in the catalog is ever deleted (only hidden), so stored applications regenerate.
 * Board prices will come from Dafna's 1C (by the 1C code); until then they are typed here.
 * An internal page for Dafna's office: Uzbek only.
 */
type Section = 'erp' | 'materials' | 'hardware' | 'services' | 'profit' | 'staff';
const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: 'erp', label: '1C katalogi', hint: 'Kioskda nima chiqadi' },
  { id: 'materials', label: 'Materiallar', hint: 'Plitalar, kromka' },
  { id: 'hardware', label: 'Furnitura', hint: "Petlya, yo'naltiruvchi…" },
  { id: 'services', label: 'Xizmatlar', hint: 'm², metr, dona' },
  { id: 'profit', label: 'Foyda va narx', hint: 'Umumiy %' },
];
/** D-38: the admin only */
const STAFF_SECTION = { id: 'staff' as const, label: 'Xodimlar', hint: 'Kim kira oladi' };

const errorText = (o: Extract<ManagerOutcome, { ok: false }>) =>
  (ERRORS[o.code] ?? ERRORS.network!) + fieldText(o.field);

export function ManagerPage({ fetchImpl }: { fetchImpl?: typeof fetch }) {
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  /** D-38: the signed-in staff member (null = the sign-in form) */
  const [user, setUser] = useState<StaffUser | null>(null);
  /** the first check of an open session (no form flash) */
  const [checking, setChecking] = useState(true);
  /** D-39: signed in with the admin's temporary password - must set their own first */
  const [pending, setPending] = useState<StaffUser | null>(null);
  /** D-39: "Parolni o'zgartirish" open / "Parolni unutdim" open */
  const [changing, setChanging] = useState(false);
  const [forgot, setForgot] = useState(false);
  /** D-39: the e-mailed reset link (/manager?reset=…) */
  const [resetToken, setResetToken] = useState(
    () => new URLSearchParams(window.location.search).get('reset') ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<PriceList | null>(null);
  const [draft, setDraftState] = useState<CatalogDraft>(EMPTY_EXTENSION);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [section, setSection] = useState<Section>('materials');
  /** D-30: the last "1C narxlarini olish" result */
  const [erpNote, setErpNote] = useState<string | null>(null);
  // one client while the kind groups stay the same (effects depend on it)
  const kindGroups = list?.erpKindGroups;
  const erp = useMemo(() => erpApi(fetchImpl, kindGroups), [fetchImpl, kindGroups]);

  /** the stored catalog becomes the engine's (labels, preview) and the editable draft */
  const takeCatalog = (c: CatalogExtension) => {
    applyCatalogExtension(c);
    setDraftState({ materials: c.materials, hardware: c.hardware, textures: c.textures ?? {} });
  };

  /** the price list and catalog of a signed-in staff member */
  const load = async (who: StaffUser) => {
    if (who.mustChange) return setPending(who);
    setPending(null);
    const r = await managerLoad(fetchImpl);
    if (!r.ok) return setError(errorText(r));
    takeCatalog(r.catalog ?? EMPTY_EXTENSION);
    setList(toServiceModel(r.list));
    setUpdatedAt(r.updatedAt);
    setUser(who);
  };

  // D-38: an open session (the cookie) skips the form
  useEffect(() => {
    let live = true;
    void getMe(fetchImpl).then(async (r) => {
      if (live && r.ok) await load(r.value);
      if (live) setChecking(false);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchImpl]);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await signIn(loginName.trim(), password, fetchImpl);
    if (!r.ok) {
      setBusy(false);
      return setError(authError(r.code));
    }
    setPassword('');
    await load(r.value);
    setBusy(false);
  };

  const logout = async () => {
    await signOut(fetchImpl);
    setUser(null);
    setPending(null);
    setChanging(false);
    setList(null);
    setSection('materials');
  };

  /** D-39: leaves the reset page (the link is used up or not wanted) */
  const leaveReset = () => {
    window.history.replaceState(null, '', window.location.pathname);
    setResetToken('');
  };

  const save = async () => {
    if (!list) return;
    setBusy(true);
    setError(null);
    const r = await managerSave(list, draft, fetchImpl);
    setBusy(false);
    if (!r.ok) return setError(errorText(r));
    if (r.catalog) takeCatalog(r.catalog);
    setList(toServiceModel(r.list));
    setUpdatedAt(r.updatedAt);
    setDirty(false);
    setJustSaved(true);
  };

  /** D-30: the current 1C price of every linked item into the fields (saved with "Saqlash") */
  const pullErp = async () => {
    if (!list) return;
    const articles = Object.values(list.erpCodes ?? {}).filter(Boolean);
    if (articles.length === 0)
      return setErpNote(
        "Hali hech narsa 1C ga bog'lanmagan: «1C kodi» yonidagi «1C» tugmasi bilan toping",
      );
    setBusy(true);
    setErpNote(null);
    const r = await erp.prices(articles);
    setBusy(false);
    if (!r.ok) return setErpNote(ERP_ERRORS[r.code] ?? ERP_ERRORS.network!);
    const a = applyErpPrices(list, r.value);
    if (a.updated.length > 0) edit(a.list);
    const parts = [`1C dan ${a.updated.length} ta narx olindi`];
    if (a.notFound.length)
      parts.push(`${a.notFound.length} ta artikul 1C da topilmadi (${a.notFound.join(', ')})`);
    if (a.noPrice.length)
      parts.push(`${a.noPrice.length} tasining narxi yo'q (${a.noPrice.join(', ')})`);
    if (a.currency.length)
      parts.push(`${a.currency.length} tasining valyutasi so'm emas (${a.currency.join(', ')})`);
    setErpNote(`${parts.join('; ')}.${a.updated.length ? ' Tekshirib, «Saqlash»ni bosing.' : ''}`);
  };

  const edit = (next: PriceList) => {
    setList(next);
    setDirty(true);
    setJustSaved(false);
  };
  const setDraft = (d: CatalogDraft) => {
    setDraftState(d);
    setDirty(true);
    setJustSaved(false);
  };

  if (resetToken) return <ResetForm token={resetToken} onDone={leaveReset} fetchImpl={fetchImpl} />;
  if (pending)
    return (
      <ChangePasswordForm
        user={pending}
        forced
        onDone={(u) => void load(u)}
        onCancel={() => void logout()}
        fetchImpl={fetchImpl}
      />
    );
  if (user && changing)
    return (
      <ChangePasswordForm
        user={user}
        forced={false}
        onDone={(u) => {
          setUser(u);
          setChanging(false);
        }}
        onCancel={() => setChanging(false)}
        fetchImpl={fetchImpl}
      />
    );
  if (!user || !list) {
    if (checking) return <main className="mgr-page mgr-login" aria-busy="true" />;
    if (forgot) return <ForgotForm onBack={() => setForgot(false)} fetchImpl={fetchImpl} />;
    return (
      <main className="mgr-page mgr-login">
        <form className="mgr-card mgr-login-card" onSubmit={login}>
          <h1>Dafna — xodimlar uchun</h1>
          <p className="mgr-note">Materiallar, furnitura, xizmatlar va narxlar</p>
          <label className="mgr-field">
            <span>Login</span>
            <input
              autoComplete="username"
              autoCapitalize="none"
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              data-testid="mgr-login"
            />
          </label>
          <label className="mgr-field">
            <span>Parol</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="mgr-password"
            />
          </label>
          {error && (
            <p className="mgr-error" role="alert">
              {error}
            </p>
          )}
          <Button variant="primary" type="submit" disabled={busy || !loginName.trim() || !password}>
            Kirish
          </Button>
          <button
            type="button"
            className="mgr-link"
            onClick={() => setForgot(true)}
            data-testid="mgr-forgot"
          >
            Parolni unutdim
          </button>
        </form>
      </main>
    );
  }

  const status = dirty
    ? "Saqlanmagan o'zgarishlar bor"
    : list.demo || !updatedAt
      ? "Narxlar hali saqlanmagan: kioskda sinov narxlari ko'rinmoqda"
      : `Oxirgi saqlash: ${updatedAt}`;

  return (
    <ErpContext.Provider value={erp}>
      <div className="mgr-shell">
        <aside className="mgr-side">
          <div className="mgr-brand">
            <strong>Dafna</strong>
            <span>boshqaruv paneli</span>
          </div>
          <nav aria-label="Bo'limlar">
            {(user.role === 'admin' ? [...SECTIONS, STAFF_SECTION] : SECTIONS).map((s) => (
              <button
                key={s.id}
                type="button"
                className={section === s.id ? 'mgr-nav active' : 'mgr-nav'}
                aria-current={section === s.id ? 'page' : undefined}
                onClick={() => setSection(s.id)}
                data-testid={`mgr-tab-${s.id}`}
              >
                <span>{s.label}</span>
                <small>{s.hint}</small>
              </button>
            ))}
          </nav>
          <div className="mgr-user" data-testid="mgr-user">
            <span>
              {user.name} · {user.role === 'admin' ? 'Admin' : 'Menejer'}
            </span>
            {user.login !== 'admin' && (
              <Button
                variant="secondary"
                onClick={() => setChanging(true)}
                data-testid="mgr-change-password"
              >
                Parolni o&apos;zgartirish
              </Button>
            )}
            <Button variant="secondary" onClick={() => void logout()} data-testid="mgr-logout">
              Chiqish
            </Button>
          </div>
        </aside>
        <main className="mgr-page">
          <header className="mgr-head">
            <p className={dirty ? 'mgr-status dirty' : 'mgr-status'} data-testid="mgr-updated">
              {status}
            </p>
            <Button
              variant="secondary"
              onClick={() => void pullErp()}
              disabled={busy}
              data-testid="mgr-erp-pull"
            >
              1C narxlarini olish
            </Button>
            <Button
              variant="success"
              onClick={() => void save()}
              disabled={busy || (!dirty && !list.demo)}
              data-testid="mgr-save"
            >
              {busy ? 'Saqlanmoqda…' : justSaved ? 'Saqlandi' : 'Saqlash'}
            </Button>
          </header>
          {error && (
            <p className="mgr-error" role="alert">
              {error}
            </p>
          )}
          {erpNote && (
            <p className="mgr-note mgr-erp-note" role="status" data-testid="mgr-erp-note">
              {erpNote}
            </p>
          )}
          {section === 'materials' && (
            <MaterialsSection
              list={list}
              edit={edit}
              draft={draft}
              setDraft={setDraft}
              uploadTexture={(id, image) => managerUploadTexture(id, image, fetchImpl)}
              onFromErp={() => setSection('erp')}
            />
          )}
          {section === 'erp' && <ErpCatalogSection list={list} draft={draft} setDraft={setDraft} />}
          {section === 'hardware' && (
            <HardwareSection
              list={list}
              edit={edit}
              draft={draft}
              setDraft={setDraft}
              uploadTexture={(id, image) => managerUploadTexture(id, image, fetchImpl)}
            />
          )}
          {section === 'services' && <ServicesSection list={list} edit={edit} />}
          {section === 'profit' && <ProfitSection list={list} edit={edit} />}
          {section === 'staff' && user.role === 'admin' && <StaffSection fetchImpl={fetchImpl} />}
        </main>
      </div>
    </ErpContext.Provider>
  );
}
