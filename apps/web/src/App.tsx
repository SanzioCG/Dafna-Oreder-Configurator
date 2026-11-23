import { useEffect, useRef, useState } from 'react';
import { I18nProvider } from './i18n/I18n';
import { ContactScreen } from './contact/ContactScreen';
import { SubmittedScreen } from './contact/SubmittedScreen';
import { installKioskGuards, kioskId, requestConsultant } from './kiosk';
import { summarizeParams } from './lead/summary';
import { parseMode, type Mode } from './mode';
import { planReveal, type RevealEvent, type RevealKind } from './presentation/reveal';
import { Button } from './ui/Button';
import { useI18n } from './i18n/I18n';
import { ConsultantButton } from './ui/ConsultantButton';
import { ConsultantModal } from './ui/ConsultantModal';
import { nextFlow, type FlowEvent, type FlowState } from './state/flow';
import { useConfigurator } from './state/useConfigurator';
import { TemplateContext } from './state/templateContext';
import { modelParams } from './state/presets';
import { ThemeProvider, useTheme } from './theme/ThemeProvider';
import { StepPanel } from './ui/StepPanel';
import type { CaptureFn } from './viewer/renderCapture';
import type { MechanismDemo, MechanismKind } from './viewer/mechanisms';
import { Viewer } from './viewer/Viewer';
import { useCatalogExtension } from './state/catalogSource';
import { STAFF_EXIT_EVENT, STAFF_REQUEST_EVENT, exitStaff } from './state/staffAccess';
import { CUSTOMER_IDLE_S, STAFF_IDLE_S, useIdle } from './state/useIdle';
import { IdleWarning } from './ui/IdleWarning';
import { PinPad } from './ui/PinPad';

/** prefers-reduced-motion: the reveal shows its final state directly. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** The step the configurator returns to from the presentation (last configurator step). */
const EDIT_STEP = 'interior';

function Configurator({ mode, onFinish }: { mode: Mode; onFinish: () => void }) {
  const config = useConfigurator(mode);
  const { t, lang } = useI18n();
  // PNG capture of the 3D view, taken when the application is submitted (D-5)
  const captureRef = useRef<CaptureFn | null>(null);
  const [submission, setSubmission] = useState<{
    id: string;
    renderPng?: string;
    assemblyPath?: string;
  } | null>(null);
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
  // D-10: "Ko'rish" (or picking a brand) plays how that mechanism closes in 3D
  const [mechDemo, setMechDemo] = useState<MechanismDemo | null>(null);
  const playMechanism = (kind: MechanismKind, brand: string) =>
    setMechDemo((d) => ({ kind, brand, seq: (d?.seq ?? 0) + 1 }));

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
  // D-13: idle reset. Customers: 2 min (20 s warning), never on the untouched start screen and
  // not on the submitted screen (it has its own countdown). Staff: 5 min, then back to customer.
  const idle = useIdle({
    enabled: flow !== 'submitted' && !(mode === 'customer' && step === 'start'),
    timeoutS: mode === 'staff' ? STAFF_IDLE_S : CUSTOMER_IDLE_S,
    onIdle: mode === 'staff' ? exitStaff : onFinish,
  });
  // Until D-2a: an honest modal (ask a nearby employee or call 1408) + the internal event that
  // D-2a will deliver to staff. Never touches the configuration, never fakes a confirmation.
  const [consultantOpen, setConsultantOpen] = useState(false);
  const callConsultant = () => {
    requestConsultant(inPresentation ? flow : step, JSON.stringify(config.params));
    setConsultantOpen(true);
  };
  return (
    <TemplateContext.Provider value={config.template}>
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
          captureRef={captureRef}
          summaryColors={summarizeParams(config.params, lang, config.template).colorsLine}
          mechanism={{
            hingeBrand: String(config.params.hingeBrand ?? 'strax'),
            slideBrand: String(config.params.slideBrand ?? 'strax'),
            demo: mechDemo,
          }}
          presentationContent={
            flow === 'ready_to_confirm' ? (
              <div className="present-actions" data-testid="present-actions">
                <Button variant="success" large onClick={() => dispatch('confirm')}>
                  {t('present.confirm')}
                </Button>
                <Button variant="secondary" onClick={() => edit()}>
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
          onMechanismDemo={playMechanism}
          onPickModel={(m) => {
            config.switchProduct(m.product, modelParams(m));
            setStep('size');
          }}
          onScratch={(product) => {
            config.switchProduct(product);
            setStep('size');
          }}
        />
        {flow === 'contact' && (
          <ContactScreen
            product={config.product}
            params={config.params}
            kioskId={kioskId()}
            onBack={() => dispatch('back')}
            captureRender={() => captureRef.current?.() ?? null}
            onSubmitted={(id, renderPng, assemblyPath) => {
              setSubmission({ id, renderPng, assemblyPath });
              dispatch('submitted');
            }}
          />
        )}
        {flow === 'submitted' && submission && (
          <SubmittedScreen
            id={submission.id}
            renderPng={submission.renderPng}
            assemblyPath={submission.assemblyPath}
            summary={summarizeParams(config.params, lang, config.template)}
            onFinish={onFinish}
          />
        )}
        {mode === 'customer' && inPresentation && (
          <ConsultantButton className="present-consultant" onCall={callConsultant} />
        )}
        {consultantOpen && <ConsultantModal onClose={() => setConsultantOpen(false)} />}
        {idle.secondsLeft !== null && (
          <IdleWarning secondsLeft={idle.secondsLeft} onStay={idle.stay} />
        )}
      </div>
    </TemplateContext.Provider>
  );
}

/**
 * One customer session. "Yakunlash" (or the submitted-screen countdown) ends it with a FULL
 * reset: configuration, flow, contact data and language (remount via `key`), theme back to
 * the kiosk default (device choice forgotten).
 */
function Session({
  mode,
  onEnd,
  pin,
}: {
  mode: Mode;
  onEnd: () => void;
  /** D-13: the PIN pad is open */
  pin: { onSuccess: () => void; onCancel: () => void } | null;
}) {
  const { resetTheme } = useTheme();
  return (
    <I18nProvider initial="uz">
      <Configurator
        mode={mode}
        onFinish={() => {
          resetTheme();
          onEnd();
        }}
      />
      {pin && <PinPad onSuccess={pin.onSuccess} onCancel={pin.onCancel} />}
    </I18nProvider>
  );
}

export function App() {
  // D-13: staff mode needs the PIN (server-checked); `?mode=staff` asks for it, a dev build
  // opens staff mode straight away. Entering or leaving staff mode starts a fresh session.
  const wantsStaff = parseMode(window.location.search) === 'staff';
  // D-20: materials / hardware added on the manager page (re-renders the kiosk when they arrive)
  useCatalogExtension();
  const [mode, setMode] = useState<Mode>(wantsStaff && import.meta.env.DEV ? 'staff' : 'customer');
  const [pinOpen, setPinOpen] = useState(wantsStaff && !import.meta.env.DEV);
  const [session, setSession] = useState(0);
  useEffect(() => installKioskGuards(), []);
  useEffect(() => {
    const ask = () => setPinOpen(true);
    const leave = () => {
      setPinOpen(false);
      setMode('customer');
      setSession((n) => n + 1);
    };
    window.addEventListener(STAFF_REQUEST_EVENT, ask);
    window.addEventListener(STAFF_EXIT_EVENT, leave);
    return () => {
      window.removeEventListener(STAFF_REQUEST_EVENT, ask);
      window.removeEventListener(STAFF_EXIT_EVENT, leave);
    };
  }, []);
  return (
    <ThemeProvider>
      <Session
        key={session}
        mode={mode}
        onEnd={() => setSession((n) => n + 1)}
        pin={
          pinOpen && mode === 'customer'
            ? {
                onSuccess: () => {
                  setPinOpen(false);
                  setMode('staff');
                  setSession((n) => n + 1);
                },
                onCancel: () => setPinOpen(false),
              }
            : null
        }
      />
    </ThemeProvider>
  );
}
