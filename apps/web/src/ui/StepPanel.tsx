import { useState } from 'react';
import { LANGS, useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import { TEMPLATE, type Configurator } from '../state/useConfigurator';
import { STEPS, neighbourStep } from '../steps';
import { ParamControl } from './ParamControl';
import { StaffPanel } from './StaffPanel';

interface StepPanelProps {
  mode: Mode;
  config: Configurator;
}

export function StepPanel({ mode, config }: StepPanelProps) {
  const { t, lang, setLang } = useI18n();
  const [step, setStep] = useState('size');
  const staff = mode === 'staff';
  const prev = neighbourStep(step, -1);
  const next = neighbourStep(step, 1);

  // UI is generated from the template: parameters of this step, filtered by mode.
  const defs = TEMPLATE.parameters.filter((d) => d.uiStep === step && (staff || d.customerVisible));
  const errorKeys = new Set(
    config.result.issues.filter((i) => i.severity === 'error').map((i) => i.paramKey),
  );
  const sectionCount = config.view.result.sections.length;

  return (
    <aside className="panel">
      <header className="panel-header">
        <div className="brand">
          <span className="brand-name">{t('app.brand')}</span>
          <span className="brand-title">{t('app.title')}</span>
        </div>
        {staff && <span className="mode-badge">{t('mode.staff')}</span>}
        <div className="lang-switch" role="group" aria-label={t('lang.label')}>
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              className={l === lang ? 'lang active' : 'lang'}
              aria-pressed={l === lang}
              onClick={() => setLang(l)}
            >
              {t(`lang.${l}`)}
            </button>
          ))}
        </div>
      </header>

      <nav className="steps" aria-label={t('nav.steps')}>
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={s.key === step ? 'step-tab active' : 'step-tab'}
            disabled={!s.enabled}
            aria-current={s.key === step ? 'step' : undefined}
            onClick={() => setStep(s.key)}
          >
            <span className="step-num">{i + 1}</span>
            <span className="step-label">{t(s.labelKey)}</span>
            {!s.enabled && <span className="step-soon">{t('step.comingSoon')}</span>}
          </button>
        ))}
      </nav>

      <div className={staff ? 'panel-body scrollable' : 'panel-body'}>
        <div className="step-intro">
          <h1>{t(`step.${step}.title`)}</h1>
          <p className="muted">{t(`step.${step}.hint`)}</p>
          <p className="summary" data-testid="summary">
            <span className="summary-label">{t('summary.overall')}:</span>{' '}
            <strong>
              {config.view.widthMm} × {config.view.heightMm} × {config.view.depthMm} {t('unit.mm')}
            </strong>
            <span className="summary-sections">
              {t('summary.sections', { count: sectionCount })}
            </span>
          </p>
        </div>
        <div className="controls">
          {defs.map((def) => (
            <ParamControl
              key={def.key}
              def={def}
              value={config.params[def.key] ?? def.default}
              mode={mode}
              hasError={errorKeys.has(def.key)}
              onChange={config.setParam}
            />
          ))}
        </div>
        {staff && <StaffPanel params={config.params} result={config.result} />}
      </div>

      <footer className="panel-footer">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!prev}
          onClick={() => prev && setStep(prev.key)}
        >
          ← {t('nav.back')}
        </button>
        <div className="footer-hint muted">{!next && t('nav.nextSoon')}</div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!next}
          onClick={() => next && setStep(next.key)}
        >
          {t('nav.next')} →
        </button>
      </footer>
    </aside>
  );
}
