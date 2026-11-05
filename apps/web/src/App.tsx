import { useEffect, useRef, useState } from 'react';
import { I18nProvider, useI18n } from './i18n/I18n';
import { installKioskGuards } from './kiosk';
import { parseMode, type Mode } from './mode';
import { useConfigurator } from './state/useConfigurator';
import { planReveal, type RevealKind } from './presentation/reveal';
import { ThemeProvider } from './theme/ThemeProvider';
import { StepPanel } from './ui/StepPanel';
import { Viewer } from './viewer/Viewer';

/** prefers-reduced-motion: the reveal shows its final state directly. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function Configurator({ mode }: { mode: Mode }) {
  const config = useConfigurator(mode);
  const { t } = useI18n();
  // shared by the sheet and the 3D view: the interior step opens the doors and selects sections
  const [step, setStep] = useState('size');
  const [section, setSection] = useState(0);
  // every explicit selection (tab or 3D tap) bumps this: the smart camera frames the selection
  const [selectionSeq, setSelectionSeq] = useState(0);
  const selectSection = (i: number) => {
    setSection(i);
    setSelectionSeq((n) => n + 1);
  };
  const picking = step === 'interior' || step === 'doors';

  // presentation ("Ko'rib chiqish"): full reveal once per configuration revision, a short one
  // after an edit, none if nothing changed since the last reveal
  const presenting = step === 'review';
  const lastRevealed = useRef<string | null>(null);
  const runSeq = useRef(0);
  const [presentation, setPresentation] = useState<{ kind: RevealKind; runId: number } | null>(
    null,
  );
  const changeStep = (next: string) => {
    if (next === step) return;
    if (next === 'review') {
      const revision = JSON.stringify(config.params);
      const kind = planReveal({
        revision,
        lastRevealed: lastRevealed.current,
        reducedMotion: prefersReducedMotion(),
      });
      lastRevealed.current = revision;
      runSeq.current += 1;
      setPresentation({ kind, runId: runSeq.current });
    } else {
      setPresentation(null);
    }
    setStep(next);
  };
  return (
    <div className={`app mode-${mode}${presenting ? ' presenting' : ''}`}>
      <Viewer
        view={config.view}
        mode={mode}
        invalid={config.hasErrors}
        activeStep={step}
        selectedSection={picking ? section : null}
        onSelectSection={selectSection}
        selectionSeq={selectionSeq}
        presentation={presenting ? presentation : null}
        presentationContent={
          <div className="present-actions">
            <button type="button" className="btn btn-secondary" onClick={() => changeStep('doors')}>
              {t('present.edit')}
            </button>
          </div>
        }
      />
      <StepPanel
        mode={mode}
        config={config}
        step={step}
        onStepChange={changeStep}
        hidden={presenting}
        selectedSection={section}
        onSelectSection={selectSection}
      />
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
