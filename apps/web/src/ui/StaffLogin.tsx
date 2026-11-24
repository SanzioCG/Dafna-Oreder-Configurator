import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/I18n';
import { signInStaff, type StaffSignIn } from '../state/staffAccess';
import { Button } from './Button';

/**
 * D-38: staff sign-in on the kiosk (replaces the consultant PIN pad of D-13): the same login and
 * password as the manager page, checked by the server; the server also limits the attempts.
 */
export function StaffLogin({
  onSuccess,
  onCancel,
  signIn = signInStaff,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  signIn?: (login: string, password: string) => Promise<StaffSignIn>;
}) {
  const { t } = useI18n();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !login.trim() || !password) return;
    setBusy(true);
    const r = await signIn(login.trim(), password);
    setBusy(false);
    if (r.ok) return onSuccess();
    setPassword('');
    setError(`pin.error.${r.code}`);
  };

  return (
    <div className="modal-backdrop">
      <form
        className="modal-card pin-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-title"
        data-testid="staff-login"
        onSubmit={(e) => void submit(e)}
      >
        <h2 id="pin-title">{t('pin.title')}</h2>
        <label className="staff-field">
          <span>{t('pin.login')}</span>
          <input
            autoComplete="username"
            autoCapitalize="none"
            value={login}
            onChange={(e) => {
              setError(null);
              setLogin(e.target.value);
            }}
            data-testid="staff-login-name"
          />
        </label>
        <label className="staff-field">
          <span>{t('pin.password')}</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setError(null);
              setPassword(e.target.value);
            }}
            data-testid="staff-login-password"
          />
        </label>
        <p className="pin-error" role="status" data-testid="pin-error">
          {error ? t(error) : ' '}
        </p>
        <Button
          variant="primary"
          wide
          type="submit"
          disabled={busy || !login.trim() || !password}
          data-testid="pin-ok"
        >
          {t('pin.ok')}
        </Button>
        <Button variant="secondary" wide onClick={onCancel}>
          {t('pin.cancel')}
        </Button>
      </form>
    </div>
  );
}
