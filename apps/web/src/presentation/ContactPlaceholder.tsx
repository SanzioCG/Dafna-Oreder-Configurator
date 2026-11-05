import { useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import { ArrowLeftIcon } from '../ui/icons';

/**
 * `contact` state placeholder. D-3b replaces it with the contact form and submission.
 * No backend exists yet: nothing is submitted and no order number is shown or invented.
 * Staff sees the TODO marker; customers see "Tez orada".
 */
export function ContactPlaceholder({ mode, onBack }: { mode: Mode; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <div className="contact-placeholder" role="dialog" aria-label={t('contact.title')}>
      <div className="contact-card">
        <h2>{t('contact.title')}</h2>
        {/* TODO(D-3b): contact form (name, phone) + submission state; replace this placeholder */}
        {mode === 'staff' ? (
          <p className="contact-todo" data-testid="contact-todo">
            {t('contact.todo')}
          </p>
        ) : (
          <p className="muted">{t('step.comingSoon')}</p>
        )}
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <ArrowLeftIcon className="btn-icon" />
          {t('nav.back')}
        </button>
      </div>
    </div>
  );
}
