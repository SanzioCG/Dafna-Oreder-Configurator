import { useI18n } from '../i18n/I18n';
import { Button } from './Button';
import { ConsultantIcon } from './icons';

/**
 * "Konsultant chaqirish": visible on every customer screen. In this batch it only calls the
 * `onCall` hook (see kiosk.ts requestConsultant); delivery to staff comes with the backend
 * (D-2a). It never changes or resets the configuration and shows no fake confirmation.
 */
export function ConsultantButton({
  onCall,
  className,
}: {
  onCall: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <Button
      variant="secondary"
      className={className ? `consultant-btn ${className}` : 'consultant-btn'}
      icon={
        <span className="icon-badge">
          <ConsultantIcon />
        </span>
      }
      onClick={onCall}
      data-testid="consultant-button"
    >
      {t('consultant.call')}
    </Button>
  );
}
