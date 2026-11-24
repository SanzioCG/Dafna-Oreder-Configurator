import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import {
  authError,
  changePassword,
  forgotPassword,
  resetPassword,
  type StaffUser,
} from '../auth/staffSession';

/** D-39: a new password typed twice (8+ characters) */
function NewPassword({
  value,
  repeat,
  setValue,
  setRepeat,
}: {
  value: string;
  repeat: string;
  setValue: (v: string) => void;
  setRepeat: (v: string) => void;
}) {
  return (
    <>
      <label className="mgr-field">
        <span>Yangi parol (kamida 8 belgi)</span>
        <input
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          data-testid="pw-new"
        />
      </label>
      <label className="mgr-field">
        <span>Yangi parol yana bir marta</span>
        <input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          data-testid="pw-repeat"
        />
      </label>
    </>
  );
}

const ready = (v: string, r: string) => v.length >= 8 && v === r;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mgr-page mgr-login">
      <div className="mgr-card mgr-login-card">
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

/**
 * D-39: change one's own password: forced after the admin's temporary one (`forced`), or from
 * "Parolni o'zgartirish". The server keeps the person signed in with the new password.
 */
export function ChangePasswordForm({
  user,
  forced,
  onDone,
  onCancel,
  fetchImpl,
}: {
  user: StaffUser;
  forced: boolean;
  onDone: (u: StaffUser) => void;
  onCancel: () => void;
  fetchImpl?: typeof fetch;
}) {
  const [old, setOld] = useState('');
  const [value, setValue] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (value !== repeat) return setError(authError('mismatch'));
    setBusy(true);
    setError(null);
    const r = await changePassword(old, value, fetchImpl);
    setBusy(false);
    if (!r.ok) return setError(authError(r.code));
    onDone(r.value);
  };

  return (
    <Card title={forced ? "O'z parolingizni qo'ying" : "Parolni o'zgartirish"}>
      <form onSubmit={(e) => void submit(e)} data-testid="pw-change">
        <p className="mgr-note">
          {forced
            ? `${user.name}, siz admin bergan vaqtinchalik parol bilan kirdingiz. Davom etish uchun faqat o'zingiz biladigan parol qo'ying.`
            : `${user.name}, yangi parol saqlangach boshqa qurilmalardagi kirishlaringiz yopiladi.`}
        </p>
        <label className="mgr-field">
          <span>{forced ? 'Vaqtinchalik parol' : 'Hozirgi parol'}</span>
          <input
            type="password"
            autoComplete="current-password"
            value={old}
            onChange={(e) => setOld(e.target.value)}
            data-testid="pw-old"
          />
        </label>
        <NewPassword value={value} repeat={repeat} setValue={setValue} setRepeat={setRepeat} />
        {error && (
          <p className="mgr-error" role="alert">
            {error}
          </p>
        )}
        <span className="mgr-inline">
          <Button
            variant="primary"
            type="submit"
            disabled={busy || !old || !ready(value, repeat)}
            data-testid="pw-save"
          >
            Saqlash
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            {forced ? 'Chiqish' : 'Bekor qilish'}
          </Button>
        </span>
      </form>
    </Card>
  );
}

/** D-39: "Parolni unutdim" - the e-mail gets a one-time link */
export function ForgotForm({
  onBack,
  fetchImpl,
}: {
  onBack: () => void;
  fetchImpl?: typeof fetch;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await forgotPassword(email.trim(), fetchImpl);
    setBusy(false);
    if (!r.ok) return setError(authError(r.code));
    setSent(true);
  };

  return (
    <Card title="Parolni tiklash">
      {sent ? (
        <>
          <p className="mgr-note" role="status" data-testid="pw-sent">
            Agar bu email xodimlar ro&apos;yxatida bo&apos;lsa, unga havola yuborildi. Pochtani (va
            «Spam» papkasini) tekshiring — havola 30 daqiqa amal qiladi.
          </p>
          <Button variant="secondary" onClick={onBack}>
            Kirishga qaytish
          </Button>
        </>
      ) : (
        <form onSubmit={(e) => void submit(e)} data-testid="pw-forgot">
          <p className="mgr-note">
            Xodimlar ro&apos;yxatidagi emailingizni yozing — yangi parol qo&apos;yish havolasini
            yuboramiz. Email kiritilmagan bo&apos;lsa, yangi parolni admin beradi.
          </p>
          <label className="mgr-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="pw-email"
            />
          </label>
          {error && (
            <p className="mgr-error" role="alert">
              {error}
            </p>
          )}
          <span className="mgr-inline">
            <Button variant="primary" type="submit" disabled={busy || !email.includes('@')}>
              Havola yuborish
            </Button>
            <Button variant="secondary" onClick={onBack}>
              Orqaga
            </Button>
          </span>
        </form>
      )}
    </Card>
  );
}

/** D-39: the page opened from the e-mailed link (/manager?reset=…) */
export function ResetForm({
  token,
  onDone,
  fetchImpl,
}: {
  token: string;
  onDone: () => void;
  fetchImpl?: typeof fetch;
}) {
  const [value, setValue] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (value !== repeat) return setError(authError('mismatch'));
    setBusy(true);
    setError(null);
    const r = await resetPassword(token, value, fetchImpl);
    setBusy(false);
    if (!r.ok) return setError(authError(r.code));
    setDone(true);
  };

  return (
    <Card title="Yangi parol">
      {done ? (
        <>
          <p className="mgr-note" role="status" data-testid="pw-reset-done">
            Parol yangilandi. Endi yangi parol bilan kiring.
          </p>
          <Button variant="primary" onClick={onDone}>
            Kirish
          </Button>
        </>
      ) : (
        <form onSubmit={(e) => void submit(e)} data-testid="pw-reset">
          <NewPassword value={value} repeat={repeat} setValue={setValue} setRepeat={setRepeat} />
          {error && (
            <p className="mgr-error" role="alert">
              {error}
            </p>
          )}
          <span className="mgr-inline">
            <Button variant="primary" type="submit" disabled={busy || !ready(value, repeat)}>
              Saqlash
            </Button>
            <Button variant="secondary" onClick={onDone}>
              Kirishga qaytish
            </Button>
          </span>
        </form>
      )}
    </Card>
  );
}
