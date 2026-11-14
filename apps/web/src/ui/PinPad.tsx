import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18n';
import { LOCK_MS, MAX_TRIES, verifyStaffPin, type PinOutcome } from '../state/staffAccess';
import { Button } from './Button';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * D-13: the consultant PIN pad (digits only, on-screen). The PIN is checked by the server;
 * after MAX_TRIES wrong PINs the pad locks for a minute.
 */
export function PinPad({
  onSuccess,
  onCancel,
  verify = verifyStaffPin,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  verify?: (pin: string) => Promise<PinOutcome>;
}) {
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const locked = lockedUntil > now;

  useEffect(() => {
    if (!locked) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [locked]);

  const submit = async () => {
    if (pin.length < 4 || busy || locked) return;
    setBusy(true);
    const r = await verify(pin);
    setBusy(false);
    if (r.ok) {
      onSuccess();
      return;
    }
    setPin('');
    if (r.code === 'wrong_pin') {
      const n = tries + 1;
      if (n >= MAX_TRIES) {
        const at = Date.now();
        setLockedUntil(at + LOCK_MS);
        setNow(at);
        setTries(0);
      } else setTries(n);
    }
    setError(`pin.error.${r.code}`);
  };

  const press = (d: string) => {
    setError(null);
    setPin((p) => (p.length < 8 ? p + d : p));
  };

  let message = ' ';
  if (locked) message = t('pin.locked', { s: Math.ceil((lockedUntil - now) / 1000) });
  else if (error) message = t(error);

  return (
    <div className="modal-backdrop">
      <div
        className="modal-card pin-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-title"
        data-testid="pin-pad"
      >
        <h2 id="pin-title">{t('pin.title')}</h2>
        <div className="pin-dots" role="img" aria-label={t('pin.entered', { n: pin.length })}>
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
            <span key={i} className={i < pin.length ? 'pin-dot on' : 'pin-dot'} />
          ))}
        </div>
        <p className="pin-error" role="status" data-testid="pin-error">
          {message}
        </p>
        <div className="pin-keys">
          {DIGITS.map((d) => (
            <button
              key={d}
              type="button"
              className="pin-key"
              disabled={locked}
              onClick={() => press(d)}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            className="pin-key pin-key-muted"
            onClick={() => setPin((p) => p.slice(0, -1))}
            aria-label={t('pin.erase')}
          >
            ⌫
          </button>
          <button type="button" className="pin-key" disabled={locked} onClick={() => press('0')}>
            0
          </button>
          <button
            type="button"
            className="pin-key pin-key-ok"
            disabled={locked || busy || pin.length < 4}
            onClick={() => void submit()}
            data-testid="pin-ok"
          >
            {t('pin.ok')}
          </button>
        </div>
        <Button variant="secondary" wide onClick={onCancel}>
          {t('pin.cancel')}
        </Button>
      </div>
    </div>
  );
}
