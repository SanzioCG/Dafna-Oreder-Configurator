import { useI18n } from '../i18n/I18n';
import type { Configurator } from '../state/useConfigurator';

/**
 * D-9 "Mexanizmlar": the hardware brand of each mechanism the configuration actually has (door
 * hinges if there are doors, drawer slides if there are drawers): Strax (standard) or Hettich
 * (soft close). Template params with uiStep 'hardware'; brand names are never translated.
 */
export function HardwareBlock({ config }: { config: Configurator }) {
  const { t } = useI18n();
  const panels = config.view.result.panels;
  const present: Record<string, boolean> = {
    hingeBrand: panels.some((p) => p.role === 'door'),
    slideBrand: panels.some((p) => p.role === 'drawer_front'),
  };
  const defs = config.template.parameters.filter(
    (d) => d.uiStep === 'hardware' && d.customerVisible && present[d.key],
  );
  if (defs.length === 0) return null;
  return (
    <section className="card step-card hardware-card" data-card="hardware" data-testid="hardware">
      <div className="card-head">
        <h2>{t('hw.title')}</h2>
        <p className="muted">{t('hw.hint')}</p>
      </div>
      {defs.map((def) => {
        const value = config.params[def.key] ?? def.default;
        return (
          <div className="param" key={def.key}>
            <span className="param-label">{t(def.labelKey)}</span>
            <div
              className="option-list"
              role="radiogroup"
              aria-label={t(def.labelKey)}
              data-param={def.key}
            >
              {(def.options ?? []).map((o) => (
                <button
                  key={String(o)}
                  type="button"
                  role="radio"
                  aria-checked={o === value}
                  data-option={String(o)}
                  className={o === value ? 'option-row active' : 'option-row'}
                  onClick={() => config.setParam(def.key, o)}
                >
                  <span className="option-text">
                    <span className="option-title">{t(`hw.brand.${String(o)}`)}</span>
                    <span className="option-hint">{t(`hw.hint.${def.key}.${String(o)}`)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
