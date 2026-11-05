import type { ParamDef } from '@dafna/engine';
import { LANGS, useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import { TEMPLATE, type Configurator } from '../state/useConfigurator';
import { neighbourStep } from '../steps';
import { useTheme } from '../theme/ThemeProvider';
import { Button, IconButton } from './Button';
import { ConsultantButton } from './ConsultantButton';
import { StepNavigation } from './StepNavigation';
import { ArrowLeftIcon, ArrowRightIcon, MoonIcon, SunIcon } from './icons';
import { InteriorStep } from './InteriorStep';
import { ParamControl } from './ParamControl';
import { ResetToast } from './ResetToast';
import { StaffPanel } from './StaffPanel';

/**
 * Control groups inside the panel (design system V2: no fills, no nested cards — groups are
 * separated by spacing and a divider). Consecutive numeric parameters share one group; each
 * swatch or option parameter gets its own group.
 */
interface CardGroup {
  key: string;
  tone: 'numeric' | 'option';
  defs: ParamDef[];
}

export function groupIntoCards(defs: ParamDef[]): CardGroup[] {
  const groups: CardGroup[] = [];
  for (const def of defs) {
    const last = groups[groups.length - 1];
    if (def.type === 'int') {
      if (last && last.tone === 'numeric') last.defs.push(def);
      else groups.push({ key: def.key, tone: 'numeric', defs: [def] });
    } else {
      groups.push({
        key: def.key,
        tone: 'option',
        defs: [def],
      });
    }
  }
  return groups;
}

interface StepPanelProps {
  mode: Mode;
  config: Configurator;
  /** current wizard step (lifted to App: the 3D view reacts to it) */
  step: string;
  onStepChange: (step: string) => void;
  /** selected section on the interior step (shared with the 3D view) */
  selectedSection: number;
  onSelectSection: (index: number) => void;
  /** presentation mode: the sheet and step navigation are hidden (state is kept) */
  hidden?: boolean;
  /** "Konsultant chaqirish" hook (customer screens) */
  onCallConsultant?: () => void;
  /** "Tayyor — ko'rib chiqish": straight to the presentation (blocking validation applies) */
  onReview?: () => void;
}

export function StepPanel({
  mode,
  config,
  step,
  onStepChange: setStep,
  selectedSection,
  onSelectSection,
  hidden = false,
  onCallConsultant,
  onReview,
}: StepPanelProps) {
  const { t, lang, setLang } = useI18n();
  const { theme, toggleTheme, logoUrl } = useTheme();
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
    <aside className="panel" hidden={hidden}>
      <header className="panel-header">
        <div className="brand">
          <img className="brand-logo" src={logoUrl} alt={t('app.brand')} draggable={false} />
          <span className="brand-title">{t('app.title')}</span>
        </div>
        {staff && <span className="mode-badge">{t('mode.staff')}</span>}
        {/* theme: kiosk config; staff can switch it on the device, customers cannot */}
        {staff && (
          <IconButton
            label={t('theme.dark')}
            aria-pressed={theme === 'dark'}
            data-testid="theme-toggle"
            onClick={toggleTheme}
            icon={theme === 'dark' ? <MoonIcon /> : <SunIcon />}
          />
        )}
        {!staff && onCallConsultant && <ConsultantButton onCall={onCallConsultant} />}
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

      <StepNavigation step={step} onStepChange={setStep} />

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
          {step === 'interior' && (
            <InteriorStep
              mode={mode}
              config={config}
              selected={selectedSection}
              onSelect={onSelectSection}
            />
          )}
          {step !== 'interior' &&
            groupIntoCards(defs).map((group) => (
              <section key={group.key} className="card" data-card={group.defs[0]?.key}>
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
          <div className="card">
            <StaffPanel params={config.params} result={config.result} />
          </div>
        )}
      </div>

      <footer className="panel-footer">
        <ResetToast notice={config.notice} onDismiss={config.dismissNotice} />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!prev}
          onClick={() => prev && setStep(prev.key)}
        >
          <ArrowLeftIcon />
          {t('nav.back')}
        </button>
        <div className="footer-center">
          {onReview && step !== 'review' && (
            <Button
              variant="ghost"
              className="btn-review"
              disabled={config.hasErrors}
              onClick={onReview}
              data-testid="ready-review"
            >
              {t('nav.readyReview')}
            </Button>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!next}
          onClick={() => next && setStep(next.key)}
        >
          {t('nav.next')}
          <ArrowRightIcon />
        </button>
      </footer>
    </aside>
  );
}
