import type { ParamDef } from '@dafna/engine';
import { useState } from 'react';
import { LANGS, useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import type { ReadyModel } from '../state/presets';
import { TEMPLATE, type Configurator } from '../state/useConfigurator';
import { STEPS, neighbourStep } from '../steps';
import { StartScreen } from '../start/StartScreen';
import { useTheme } from '../theme/ThemeProvider';
import { formatSize, unitSystemFor } from '../viewer/dimensions';
import { Button, IconButton } from './Button';
import { ColorStep } from './ColorStep';
import { ConsultantButton } from './ConsultantButton';
import { ArrowLeftIcon, ArrowRightIcon, MoonIcon, SunIcon } from './icons';
import { InteriorStep } from './InteriorStep';
import { ParamControl } from './ParamControl';
import { ResetToast } from './ResetToast';
import { SizeStep } from './SizeStep';
import { StaffPanel } from './StaffPanel';
import { StaffSettings } from './StaffSettings';
import { StepNavigation } from './StepNavigation';

/**
 * Staff engineering controls are generated from the template: consecutive numeric parameters
 * share one group; each option / swatch parameter gets its own group.
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
      groups.push({ key: def.key, tone: 'option', defs: [def] });
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
  /** presentation mode: the panel and step navigation are hidden (state is kept) */
  hidden?: boolean;
  /** "Konsultant chaqirish" hook (customer screens) */
  onCallConsultant?: () => void;
  /** start screen: a ready-made model was picked / "Noldan boshlash" */
  onPickModel?: (model: ReadyModel) => void;
  onScratch?: () => void;
}

/**
 * Configuration panel (design system V3, ADR-010): header (logo, language pill, consultant),
 * step pills, ONE colored card per step, fixed footer (Orqaga · Tayyor — ko'rib chiqish ·
 * Keyingi). Staff additionally get the template's engineering parameters of the step and the
 * staff panel (issues, order draft JSON).
 */
export function StepPanel({
  mode,
  config,
  step,
  onStepChange: setStep,
  selectedSection,
  onSelectSection,
  hidden = false,
  onCallConsultant,
  onPickModel,
  onScratch,
}: StepPanelProps) {
  const { t, lang, setLang } = useI18n();
  const { theme, toggleTheme, logoUrl } = useTheme();
  const staff = mode === 'staff';
  const prev = neighbourStep(step, -1);
  const next = neighbourStep(step, 1);
  const stepDef = STEPS.find((s) => s.key === step);
  const [staffOpen, setStaffOpen] = useState(false);

  // staff: template parameters of this step (interior also carries the door overrides)
  const sectionCount = config.view.result.sections.length;
  const uiSteps = stepDef?.uiSteps ?? [];
  const defs = staff
    ? TEMPLATE.parameters.filter(
        (d) =>
          uiSteps.includes(d.uiStep) &&
          (d.appliesToSection === undefined || d.appliesToSection <= sectionCount),
      )
    : [];
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
  const units = unitSystemFor(mode);
  const unit = t(units === 'cm' ? 'unit.cm' : 'unit.mm');
  const v = config.view;

  return (
    <aside className="panel" hidden={hidden}>
      <header className="panel-header">
        <div className="brand">
          <img className="brand-logo" src={logoUrl} alt={t('app.brand')} draggable={false} />
          <span className="brand-title">{t('app.title')}</span>
        </div>
        {staff && <span className="mode-badge">{t('mode.staff')}</span>}
        {/* theme: kiosk default (Dark); everyone can switch Light / Dark (D-4.1) */}
        <IconButton
          label={t('theme.dark')}
          aria-pressed={theme === 'dark'}
          data-testid="theme-toggle"
          onClick={toggleTheme}
          icon={theme === 'dark' ? <MoonIcon /> : <SunIcon />}
        />
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

      {step === 'start' && (
        <div className="panel-body">
          <StartScreen
            mode={mode}
            onPick={(m) => onPickModel?.(m)}
            onScratch={() => onScratch?.()}
          />
        </div>
      )}
      <div className="panel-body" hidden={step === 'start'}>
        <p className="summary" data-testid="summary">
          <strong>{formatSize(v.widthMm, v.heightMm, v.depthMm, units, unit)}</strong>
          <span className="summary-sections">
            {t(staff ? 'summary.sections' : 'c.parts', { count: sectionCount })}
          </span>
        </p>
        <div className="controls">
          {step === 'size' && <SizeStep mode={mode} config={config} />}
          {step === 'color' && <ColorStep mode={mode} config={config} />}
          {step === 'interior' && (
            <InteriorStep
              mode={mode}
              config={config}
              selected={selectedSection}
              onSelect={onSelectSection}
            />
          )}
        </div>
        {staff && (
          <StaffSettings open={staffOpen} onToggle={() => setStaffOpen((o) => !o)}>
            {groupIntoCards(defs).map((group) => (
              <section key={group.key} className="staff-group" data-card={group.defs[0]?.key}>
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
            <StaffPanel params={config.params} result={config.result} />
          </StaffSettings>
        )}
      </div>

      <footer className="panel-footer" hidden={step === 'start'}>
        <ResetToast notice={config.notice} onDismiss={config.dismissNotice} mode={mode} />
        {/* "Orqaga" in a pill; on step 1 customers go back to the ready-made models */}
        <Button
          variant="secondary"
          className="btn-back"
          disabled={!prev && staff}
          icon={<ArrowLeftIcon />}
          onClick={() => (prev ? setStep(prev.key) : !staff && setStep('start'))}
        >
          {t('nav.back')}
        </Button>
        <div className="footer-center" />
        <Button
          variant="primary"
          disabled={!next}
          iconAfter={<ArrowRightIcon />}
          onClick={() => next && setStep(next.key)}
        >
          {t('nav.next')}
        </Button>
      </footer>
    </aside>
  );
}
