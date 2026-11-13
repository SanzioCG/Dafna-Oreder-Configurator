import { useI18n } from '../i18n/I18n';
import { STEPS } from '../steps';

/**
 * StepNavigation: the four step pills (number dot in the step colour). The current one uses the
 * selection contract (--ink fill, white text).
 */
export function StepNavigation({
  step,
  onStepChange,
  product = 'wardrobe',
}: {
  step: string;
  onStepChange: (step: string) => void;
  /** D-8: step 3 is "Ichki" (wardrobe), "Tortmalar" (pedestal), "Oyoqlar" (desk) */
  product?: string;
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
          <span className="step-label">
            {s.key === 'interior' && product !== 'wardrobe'
              ? t(`step.interior.${product}`)
              : t(s.labelKey)}
          </span>
          {!s.enabled && <span className="step-soon">{t('step.comingSoon')}</span>}
        </button>
      ))}
    </nav>
  );
}
