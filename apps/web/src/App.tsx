import { useEffect } from 'react';
import { I18nProvider } from './i18n/I18n';
import { installKioskGuards } from './kiosk';
import { parseMode, type Mode } from './mode';
import { useConfigurator } from './state/useConfigurator';
import { StepPanel } from './ui/StepPanel';
import { Viewer } from './viewer/Viewer';

function Configurator({ mode }: { mode: Mode }) {
  const config = useConfigurator();
  return (
    <div className={`app mode-${mode}`}>
      <Viewer view={config.view} invalid={config.hasErrors} />
      <StepPanel mode={mode} config={config} />
    </div>
  );
}

export function App() {
  const mode = parseMode(window.location.search);
  useEffect(() => installKioskGuards(), []);
  return (
    <I18nProvider initial="uz">
      <Configurator mode={mode} />
    </I18nProvider>
  );
}
