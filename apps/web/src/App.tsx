import { useEffect, useRef, useState } from 'react';
import { I18nProvider } from './i18n/I18n';
import { installKioskGuards, requestConsultant } from './kiosk';
import { parseMode, type Mode } from './mode';
import { ContactPlaceholder } from './presentation/ContactPlaceholder';
import { planReveal, type RevealEvent, type RevealKind } from './presentation/reveal';
import { Button } from './ui/Button';
import { useI18n } from './i18n/I18n';
import { ConsultantButton } from './ui/ConsultantButton';
import { ConsultantModal } from './ui/ConsultantModal';
import { nextFlow, type FlowEvent, type FlowState } from './state/flow';
import { TEMPLATE, useConfigurator } from './state/useConfigurator';
import { modelParams } from './state/presets';
import { defaultParams } from '@dafna/engine';
import { ThemeProvider } from './theme/ThemeProvider';
import { StepPanel } from './ui/StepPanel';
import { Viewer } from './viewer/Viewer';

/** prefers-reduced-motion: the reveal shows its final state directly. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** The step the configurator returns to from the presentation (last configurator step). */
const EDIT_STEP = 'interior';

function Configurator({ mode }: { mode: Mode }) {
  const config = useConfigurator(mode);
  const { t } = useI18n();
  // shared by the sheet and the 3D view: the interior step opens the doors and selects sections
  // customers start on the ready-made models screen (step 0); staff go straight to step 1
  const [step, setStep] = useState(mode === 'customer' ? 'start' : 'size');
  const [section, setSection] = useState(0);
  // every explicit selection (tab or 3D tap) bumps this: the smart camera frames the selection
  const [selectionSeq, setSelectionSeq] = useState(0);
  const selectSection = (i: number) => {
    setSection(i);
    setSelectionSeq((n) => n + 1);
  };
  const picking = step === 'interior';

  // ---- customer flow (state machine, see state/flow.ts) ----
  const [flow, setFlow] = useState<FlowState>('configurator');
  const flowRef = useRef(flow);
  flowRef.current = flow;
  /** applies an event; a rejected transition changes nothing and returns false */
  const dispatch = (event: FlowEvent): boolean => {
    const next = nextFlow(flowRef.current, event);
    if (!next) return false;
    flowRef.current = next;
    setFlow(next);
    return true;
  };

  // presentation reveal: full once per configuration revision, short after an edit, none if
  // nothing changed since the last reveal (independent of the flow state)
  const lastRevealed = useRef<string | null>(null);
  const runSeq = useRef(0);
  const [presentation, setPresentation] = useState<{ kind: RevealKind; runId: number } | null>(
    null,
  );

  const present = () => {
    if (!dispatch('present')) return;
    const revision = JSON.stringify(config.params);
    const kind = planReveal({
      revision,
      lastRevealed: lastRevealed.current,
      reducedMotion: prefersReducedMotion(),
    });
    lastRevealed.current = revision;
    runSeq.current += 1;
    setPresentation({ kind, runId: runSeq.current });
    setStep('review');
  };

  /** back to the configurator at `target`; params and the section selection are kept */
  const edit = (target: string = EDIT_STEP) => {
    if (!dispatch('edit')) return;
    setPresentation(null);
    setStep(target);
  };

  const changeStep = (next: string) => {
    if (next === step) return;
    if (next === 'review') present();
    else setStep(next);
  };

  const onRevealEvents = (events: RevealEvent[]) => {
    if (events.includes('doorsClosed')) dispatch('doorsClosed');
  };

  const inPresentation = flow !== 'configurator';
  // Until D-2a: an honest modal (ask a nearby employee or call 1408) + the internal event that
  // D-2a will deliver to staff. Never touches the configuration, never fakes a confirmation.
  const [consultantOpen, setConsultantOpen] = useState(false);
  const callConsultant = () => {
    requestConsultant(inPresentation ? flow : step, JSON.stringify(config.params));
    setConsultantOpen(true);
  };
  return (
    <div className={`app mode-${mode}${inPresentation ? ' presenting' : ''}`} data-flow={flow}>
      <Viewer
        view={config.view}
        mode={mode}
        invalid={config.hasErrors}
        activeStep={step}
        selectedSection={picking ? section : null}
        onSelectSection={selectSection}
        selectionSeq={selectionSeq}
        presentation={inPresentation ? presentation : null}
        onRevealEvents={onRevealEvents}
        presentationContent={
          flow === 'ready_to_confirm' ? (
            <div className="present-actions" data-testid="present-actions">
              <Button variant="success" large onClick={() => dispatch('confirm')}>
                {t('present.confirm')}
              </Button>
              <Button variant="text" onClick={() => edit()}>
                {t('present.edit')}
              </Button>
            </div>
          ) : null
        }
      />
      <StepPanel
        mode={mode}
        config={config}
        step={step}
        onStepChange={changeStep}
        hidden={inPresentation}
        selectedSection={section}
        onSelectSection={selectSection}
        onCallConsultant={callConsultant}
        onReview={present}
        onPickModel={(m) => {
          config.setParams(modelParams(m));
          setStep('size');
        }}
        onScratch={() => {
          config.setParams(defaultParams(TEMPLATE));
          setStep('size');
        }}
      />
      {flow === 'contact' && <ContactPlaceholder mode={mode} onBack={() => dispatch('back')} />}
      {mode === 'customer' && inPresentation && (
        <ConsultantButton className="present-consultant" onCall={callConsultant} />
      )}
      {consultantOpen && <ConsultantModal onClose={() => setConsultantOpen(false)} />}
    </div>
  );
}

export function App() {
  const mode = parseMode(window.location.search);
  useEffect(() => installKioskGuards(), []);
  return (
    <ThemeProvider>
      <I18nProvider initial="uz">
        <Configurator mode={mode} />
      </I18nProvider>
    </ThemeProvider>
  );
}
