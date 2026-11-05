import { useEffect, useState } from 'react';
import { I18nProvider } from './i18n/I18n';
import { installKioskGuards } from './kiosk';
import { parseMode, type Mode } from './mode';
import { useConfigurator } from './state/useConfigurator';
import { ThemeProvider } from './theme/ThemeProvider';
import { StepPanel } from './ui/StepPanel';
import { Viewer } from './viewer/Viewer';

function Configurator({ mode }: { mode: Mode }) {
  const config = useConfigurator(mode);
  // shared by the sheet and the 3D view: the interior step opens the doors and selects sections
  const [step, setStep] = useState('size');
  const [section, setSection] = useState(0);
  return (
    <div className={`app mode-${mode}`}>
      <Viewer
        view={config.view}
        mode={mode}
        invalid={config.hasErrors}
        activeStep={step}
        selectedSection={step === 'interior' ? section : null}
        onSelectSection={setSection}
      />
      <StepPanel
        mode={mode}
        config={config}
        step={step}
        onStepChange={setStep}
        selectedSection={section}
        onSelectSection={setSection}
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
