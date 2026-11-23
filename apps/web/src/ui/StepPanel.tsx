import type { ParamDef } from '@dafna/engine';
import { exitStaff, requestStaff, useLongPress } from '../state/staffAccess';
import { useEffect, useRef, useState } from 'react';
import { LANGS, useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import type { ReadyModel } from '../state/presets';
import type { Configurator } from '../state/useConfigurator';
import type { ProductId } from '../state/presets';
import { neighbourStep, stepsFor } from '../steps';
import { StartScreen } from '../start/StartScreen';
import { useTheme } from '../theme/ThemeProvider';
import { formatSize, unitSystemFor } from '../viewer/dimensions';
import { Button, IconButton } from './Button';
import { ColorStep } from './ColorStep';
import { ConsultantButton } from './ConsultantButton';
import { ArrowLeftIcon, ArrowRightIcon, MoonIcon, SunIcon } from './icons';
import { InteriorStep } from './InteriorStep';
import { OptionsStep } from './OptionsStep';
import { HardwareBlock } from './HardwareBlock';
import { PriceBreakdown, PriceTag } from './PriceTag';
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
  /** D-25: number of pieces in the cart (0 = no cart button) and opening the cart */
  cartCount?: number;
  onOpenCart?: () => void;
  /** start screen: a ready-made model was picked / "Noldan boshlash" */
  onPickModel?: (model: ReadyModel) => void;
  onScratch?: (product: ProductId) => void;
  /** D-10: play a mechanism's closing demo in 3D */
  onMechanismDemo?: (kind: 'hinge' | 'slide', brand: string) => void;
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
  onMechanismDemo,
  cartCount = 0,
  onOpenCart,
}: StepPanelProps) {
  const { t, lang, setLang } = useI18n();
  const { theme, toggleTheme, logoUrl } = useTheme();
  const logoHold = useLongPress(requestStaff);
  const staff = mode === 'staff';
  // D-9: "Mexanizmlar" is its own step when the configuration has hinges or slides
  const steps = stepsFor(config.template, config.view.result);
  const prev = neighbourStep(step, -1, steps);
  const next = neighbourStep(step, 1, steps);
  const stepDef = steps.find((s) => s.key === step);
  const [staffOpen, setStaffOpen] = useState(false);
  const missingStep = step !== 'start' && !stepDef;
  useEffect(() => {
    // the mechanism step disappeared (no doors / drawers any more): back to the fill step
    if (missingStep) setStep('interior');
  }, [missingStep, setStep]);
  // every step starts at the top of the panel: its card is the first thing the customer sees
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: 0 });
  }, [step]);

  // staff: template parameters of this step (interior also carries the door overrides)
  const sectionCount = config.view.result.sections.length;
  const uiSteps = stepDef?.uiSteps ?? [];
  const defs = staff
    ? config.template.parameters.filter(
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
          {/* D-13: holding the logo for 3 s asks for the consultant PIN */}
          <img
            className={logoHold.holding ? 'brand-logo holding' : 'brand-logo'}
            src={logoUrl}
            alt={t('app.brand')}
            draggable={false}
            data-testid="brand-logo"
            {...(staff ? {} : logoHold.handlers)}
          />
          <span className="brand-title">{t('app.title')}</span>
        </div>
        {staff && (
          <button
            type="button"
            className="mode-badge mode-exit"
            onClick={exitStaff}
            data-testid="staff-exit"
            aria-label={t('staff.exit')}
          >
            {t('mode.staff')} · {t('staff.exitShort')}
          </button>
        )}
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

      {cartCount > 0 && onOpenCart && (
        <button
          type="button"
          className="cart-button"
          onClick={onOpenCart}
          data-testid="cart-button"
          aria-haspopup="dialog"
        >
          <span className="cart-button-icon" aria-hidden="true">
            🛒
          </span>
          <span>{t('cart.button')}</span>
          <span className="cart-button-count">{cartCount}</span>
        </button>
      )}

      <StepNavigation step={step} onStepChange={setStep} product={config.product} steps={steps} />

      {step === 'start' && (
        <div className="panel-body">
          <StartScreen
            mode={mode}
            onPick={(m) => onPickModel?.(m)}
            onScratch={(p) => onScratch?.(p)}
          />
        </div>
      )}
      <div className="panel-body" hidden={step === 'start'} ref={bodyRef}>
        <PriceTag mode={mode} config={config} />
        <p className="summary" data-testid="summary">
          <strong>{formatSize(v.widthMm, v.heightMm, v.depthMm, units, unit)}</strong>
          {sectionCount > 0 && config.product === 'wardrobe' && (
            <span className="summary-sections">
              {t(staff ? 'summary.sections' : 'c.parts', { count: sectionCount })}
            </span>
          )}
        </p>
        <div className="controls">
          {step === 'size' && <SizeStep mode={mode} config={config} />}
          {step === 'color' && <ColorStep mode={mode} config={config} />}
          {step === 'interior' && config.product !== 'wardrobe' && (
            <OptionsStep mode={mode} config={config} />
          )}
          {step === 'interior' && config.product === 'wardrobe' && (
            <InteriorStep
              mode={mode}
              config={config}
              selected={selectedSection}
              onSelect={onSelectSection}
            />
          )}
          {/* D-9: its own step (only the mechanisms the configuration has) */}
          {step === 'hardware' && <HardwareBlock config={config} onDemo={onMechanismDemo} />}
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
            <PriceBreakdown config={config} />
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
