import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import {
  addStaff,
  authError,
  listStaff,
  updateStaff,
  type Role,
  type StaffRow,
} from '../auth/staffSession';

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', manager: 'Menejer' };

/**
 * D-38 "Xodimlar" (admin only): who may sign in to this page. Accounts are never deleted, only
 * blocked; a new password ends the person's open sessions. The built-in "admin" (Vercel
 * ADMIN_PASSWORD) is not in this list. D-39: the password the admin gives is temporary (the
 * person sets their own on the first sign-in); the e-mail is for "Parolni unutdim".
 */
const EMPTY = { login: '', name: '', role: 'manager' as Role, password: '', email: '' };
export function StaffSection({ fetchImpl }: { fetchImpl?: typeof fetch }) {
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [newPassword, setNewPassword] = useState<{ login: string; value: string } | null>(null);
  const [newEmail, setNewEmail] = useState<{ login: string; value: string } | null>(null);

  useEffect(() => {
    let live = true;
    void listStaff(fetchImpl).then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.value);
      else setError(authError(r.code));
    });
    return () => {
      live = false;
    };
  }, [fetchImpl]);

  const run = async (
    task: () => ReturnType<typeof listStaff>,
    done: string,
    after?: () => void,
  ) => {
    setBusy(true);
    setError(null);
    setNote(null);
    const r = await task();
    setBusy(false);
    if (!r.ok) return setError(authError(r.code));
    setRows(r.value);
    setNote(done);
    after?.();
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () =>
        addStaff(
          { ...form, login: form.login.trim().toLowerCase(), email: form.email.trim() },
          fetchImpl,
        ),
      `${form.name} qo'shildi. Login va vaqtinchalik parolni unga bering — birinchi kirishda u o'z parolini qo'yadi.`,
      () => setForm(EMPTY),
    );
  };

  return (
    <section className="mgr-card" data-testid="mgr-staff">
      <h2>Xodimlar</h2>
      <p className="mgr-note">
        Boshqaruv paneliga kim kira oladi. Mijozlarga login kerak emas — sayt ularga ochiq. Xodim
        o&apos;chirilmaydi, faqat bloklanadi. Siz bergan parol vaqtinchalik: xodim birinchi kirishda
        o&apos;z parolini qo&apos;yadi. Email «Parolni unutdim» uchun kerak.
      </p>
      {error && (
        <p className="mgr-error" role="alert">
          {error}
        </p>
      )}
      {note && (
        <p className="mgr-note" role="status">
          {note}
        </p>
      )}
      <table className="mgr-table">
        <thead>
          <tr>
            <th>Ism</th>
            <th>Login</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Holati</th>
            <th>O&apos;zgargan</th>
            <th aria-label="Amallar" />
          </tr>
        </thead>
        <tbody>
          {rows === null ? (
            <tr>
              <td colSpan={7}>Yuklanmoqda…</td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={7}>Hali xodim qo&apos;shilmagan.</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.login} data-testid={`staff-row-${r.login}`}>
                <td>{r.name}</td>
                <td>{r.login}</td>
                <td>
                  {newEmail?.login === r.login ? (
                    <span className="mgr-inline">
                      <input
                        type="email"
                        value={newEmail.value}
                        onChange={(e) => setNewEmail({ login: r.login, value: e.target.value })}
                        aria-label={`${r.name}: email`}
                      />
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              updateStaff(
                                { login: r.login, email: newEmail.value.trim() },
                                fetchImpl,
                              ),
                            `${r.name}: email saqlandi`,
                            () => setNewEmail(null),
                          )
                        }
                      >
                        Saqlash
                      </Button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="mgr-link"
                      onClick={() => setNewEmail({ login: r.login, value: r.email })}
                      data-testid={`staff-email-${r.login}`}
                    >
                      {r.email || "Email qo'shish"}
                    </button>
                  )}
                </td>
                <td>
                  <select
                    value={r.role}
                    disabled={busy}
                    aria-label={`${r.name}: rol`}
                    onChange={(e) =>
                      void run(
                        () =>
                          updateStaff({ login: r.login, role: e.target.value as Role }, fetchImpl),
                        `${r.name}: rol o'zgardi`,
                      )
                    }
                  >
                    {(Object.keys(ROLE_LABEL) as Role[]).map((k) => (
                      <option key={k} value={k}>
                        {ROLE_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{!r.active ? 'Bloklangan' : r.mustChange ? 'Vaqtinchalik parol' : 'Faol'}</td>
                <td>{r.updatedAt}</td>
                <td className="mgr-inline">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => updateStaff({ login: r.login, active: !r.active }, fetchImpl),
                        r.active ? `${r.name} bloklandi` : `${r.name} qayta faol`,
                      )
                    }
                    data-testid={`staff-toggle-${r.login}`}
                  >
                    {r.active ? 'Bloklash' : 'Faollashtirish'}
                  </Button>
                  {newPassword?.login === r.login ? (
                    <span className="mgr-inline">
                      <input
                        type="password"
                        autoComplete="new-password"
                        placeholder="Vaqtinchalik parol (8+)"
                        value={newPassword.value}
                        onChange={(e) => setNewPassword({ login: r.login, value: e.target.value })}
                        aria-label={`${r.name}: yangi parol`}
                      />
                      <Button
                        variant="primary"
                        disabled={busy || newPassword.value.length < 8}
                        onClick={() =>
                          void run(
                            () =>
                              updateStaff(
                                { login: r.login, password: newPassword.value },
                                fetchImpl,
                              ),
                            `${r.name}: vaqtinchalik parol saqlandi — kirganda o'zinikini qo'yadi`,
                            () => setNewPassword(null),
                          )
                        }
                      >
                        Saqlash
                      </Button>
                    </span>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setNewPassword({ login: r.login, value: '' })}
                    >
                      Yangi parol
                    </Button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <form className="mgr-form" onSubmit={add} data-testid="staff-add">
        <h3>Yangi xodim</h3>
        <label className="mgr-field">
          <span>Ism</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={60}
          />
        </label>
        <label className="mgr-field">
          <span>Login (lotincha)</span>
          <input
            value={form.login}
            autoComplete="off"
            onChange={(e) => setForm({ ...form, login: e.target.value })}
            maxLength={32}
          />
        </label>
        <label className="mgr-field">
          <span>Email (parolni tiklash uchun)</span>
          <input
            type="email"
            value={form.email}
            autoComplete="off"
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            maxLength={254}
          />
        </label>
        <label className="mgr-field">
          <span>Rol</span>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            {(Object.keys(ROLE_LABEL) as Role[]).map((k) => (
              <option key={k} value={k}>
                {ROLE_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="mgr-field">
          <span>Vaqtinchalik parol (kamida 8 belgi)</span>
          <input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <Button
          variant="primary"
          type="submit"
          disabled={busy || !form.name.trim() || !form.login.trim() || form.password.length < 8}
        >
          Qo&apos;shish
        </Button>
      </form>
    </section>
  );
}
