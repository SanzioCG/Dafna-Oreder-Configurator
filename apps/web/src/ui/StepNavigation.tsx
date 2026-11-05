import { useI18n } from '../i18n/I18n';
import { STEPS } from '../steps';

/**
 * StepNavigation: the four step pills (number dot in the step colour). The current one uses the
 * selection contract (--ink fill, white text).
 */
export function StepNavigation({
  step,
  onStepChange,
}: {
  step: string;
  onStepChange: (step: string) => void;
}) {
  const { t } = useI18n();
  return (
    <nav className="steps" aria-label={t('nav.steps')}>
      {STEPS.map((s, i) => (
        <button
          key={s.key}
          type="button"
          className={s.key === step ? 'step-tab active' : 'step-tab'}
          disabled={!s.enabled}
          aria-current={s.key === step ? 'step' : undefined}
          onClick={() => onStepChange(s.key)}
        >
          <span className="step-num" style={{ '--step': s.color } as React.CSSProperties}>
            {i + 1}
          </span>
          <span className="step-label">{t(s.labelKey)}</span>
          {!s.enabled && <span className="step-soon">{t('step.comingSoon')}</span>}
        </button>
      ))}
    </nav>
  );
}
