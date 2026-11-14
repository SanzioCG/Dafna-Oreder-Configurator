import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/I18n';
import { Button } from './Button';

/** D-13: "Hali shu yerdamisiz?" — the idle countdown; any touch (or the button) continues. */
export function IdleWarning({ secondsLeft, onStay }: { secondsLeft: number; onStay: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="modal-backdrop idle-backdrop" onPointerDown={onStay}>
      <div
        className="modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        data-testid="idle-warning"
      >
        <p className="idle-count" aria-hidden>
          {secondsLeft}
        </p>
        <h2 id="idle-title">{t('idle.title')}</h2>
        <p>{t('idle.text', { s: secondsLeft })}</p>
        <Button ref={ref} variant="primary" large wide onClick={onStay}>
          {t('idle.stay')}
        </Button>
      </div>
    </div>
  );
}
