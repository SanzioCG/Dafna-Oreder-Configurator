import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/I18n';
import { Button } from './Button';
import { CloseIcon, ConsultantIcon } from './icons';

/** Dafna call-centre number shown until the consultant request is delivered (D-2a). */
export const DAFNA_PHONE = '1408';

/**
 * "Konsultant chaqirish" until D-2a: an honest message — no request is delivered yet, so the
 * customer is asked to approach a nearby Dafna employee or call 1408. No fake "sent" state.
 * Closes with the button, the backdrop or Escape; the configuration is never touched.
 */
export function ConsultantModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consultant-title"
        data-testid="consultant-modal"
      >
        <ConsultantIcon className="modal-icon" />
        <h2 id="consultant-title">{t('consultant.call')}</h2>
        <p>{t('consultant.message', { phone: DAFNA_PHONE })}</p>
        <Button ref={closeRef} variant="primary" large wide icon={<CloseIcon />} onClick={onClose}>
          {t('consultant.close')}
        </Button>
      </div>
    </div>
  );
}
