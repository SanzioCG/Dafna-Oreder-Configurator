import type { ParamDef } from '@dafna/engine';
import { useState } from 'react';
import { LANGS, useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import { TEMPLATE, type Configurator } from '../state/useConfigurator';
import { STEPS, neighbourStep } from '../steps';
import { ParamControl } from './ParamControl';
import { StaffPanel } from './StaffPanel';

/** Served from apps/web/public/brand (Vite copies public/ as-is; BASE_URL keeps it base-safe). */
export const BRAND_LOGO_URL = `${import.meta.env.BASE_URL}brand/dafna-logo.svg`;

/**
 * Step content cards inside the sheet. Consecutive numeric parameters share one neutral card;
 * each swatch parameter gets a neutral card; each option parameter gets its own pastel card (one per
 * card type, see tokens.css --card-*). Pastel never indicates selection state.
 */
interface CardGroup {
  key: string;
  tone: 'neutral' | 'pastel';
  defs: ParamDef[];
}

export function groupIntoCards(defs: ParamDef[]): CardGroup[] {
  const groups: CardGroup[] = [];
  for (const def of defs) {
    const last = groups[groups.length - 1];
    if (def.type === 'int') {
      if (last && last.tone === 'neutral' && last.defs[0]?.type === 'int') last.defs.push(def);
      else groups.push({ key: def.key, tone: 'neutral', defs: [def] });
    } else {
      groups.push({
        key: def.key,
        tone: def.control === 'swatch' ? 'neutral' : 'pastel',
        defs: [def],
      });
    }
  }
  return groups;
}

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
  const sectionCount = config.view.result.sections.length;
  const defs = TEMPLATE.parameters.filter(
    (d) =>
      d.uiStep === step &&
      (staff || d.customerVisible) &&
      (d.appliesToSection === undefined || d.appliesToSection <= sectionCount),
  );
  // Staff: depth = back + carcass + door gap + door (ADR-003), e.g. "3 + 495 + 2 + 16 = 516".
  const dims = config.result.dimensions;
  const hints: Record<string, string | undefined> =
    staff && dims
      ? {
          depth: t('staff.depth', {
            back: dims.backThicknessMm,
            carcass: dims.carcassDepthMm,
            gap: dims.doorGapFrontMm,
            door: dims.doorThicknessMm,
            depth: dims.depthMm,
          }),
        }
      : {};
  const errorKeys = new Set(
    config.result.issues.filter((i) => i.severity === 'error').map((i) => i.paramKey),
  );

  return (
    <aside className="panel">
      <header className="panel-header">
        <div className="brand">
          <img className="brand-logo" src={BRAND_LOGO_URL} alt={t('app.brand')} draggable={false} />
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
          {groupIntoCards(defs).map((group) => (
            <section
              key={group.key}
              className={`card card-${group.tone}`}
              data-card={group.defs[0]?.key}
            >
              {group.defs.map((def) => (
                <ParamControl
                  key={def.key}
                  def={def}
                  value={config.params[def.key] ?? def.default}
                  mode={mode}
                  hasError={errorKeys.has(def.key)}
                  onChange={config.setParam}
                  params={config.params}
                  hint={
                    hints[def.key] ? (
                      <p className="param-hint" data-testid={`hint-${def.key}`}>
                        {hints[def.key]}
                      </p>
                    ) : undefined
                  }
                />
              ))}
            </section>
          ))}
        </div>
        {staff && (
          <div className="card card-neutral">
            <StaffPanel params={config.params} result={config.result} />
          </div>
        )}
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
