import { useI18n } from '../i18n/I18n';
import type { Configurator } from '../state/useConfigurator';
import { hardwareParams } from '../steps';

/** hardware param -> the mechanism it drives in the 3D demo */
const KIND: Record<string, 'hinge' | 'slide'> = { hingeBrand: 'hinge', slideBrand: 'slide' };

/**
 * D-9 "Mexanizmlar": the hardware brand of each mechanism the configuration actually has (door
 * hinges if there are doors, drawer slides if there are drawers): Strax (standard) or Hettich
 * (soft close). Template params with uiStep 'hardware'; brand names are never translated.
 * D-10: the 3D view shows the mechanisms; picking a brand (or "Ko'rish") plays how it closes.
 */
export function HardwareBlock({
  config,
  onDemo,
}: {
  config: Configurator;
  onDemo?: (kind: 'hinge' | 'slide', brand: string) => void;
}) {
  const { t } = useI18n();
  const defs = hardwareParams(config.template, config.view.result);
  if (defs.length === 0) return null;
  return (
    <section
      className="card step-card hardware-card"
      data-step="hardware"
      data-card="hardware"
      data-testid="hardware"
    >
      <div className="card-head">
        <h2>{t('hw.title')}</h2>
        <p className="muted">{t('hw.hint3d')}</p>
      </div>
      {defs.map((def) => {
        const value = String(config.params[def.key] ?? def.default);
        const kind = KIND[def.key];
        return (
          <div className="param" key={def.key}>
            <div className="hw-head">
              <span className="param-label">{t(def.labelKey)}</span>
              {kind && onDemo && (
                <button
                  type="button"
                  className="btn btn-secondary hw-demo"
                  data-testid={`demo-${def.key}`}
                  onClick={() => onDemo(kind, value)}
                >
                  ▶ {t(`hw.demo.${kind}`)}
                </button>
              )}
            </div>
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
                  aria-checked={String(o) === value}
                  data-option={String(o)}
                  className={String(o) === value ? 'option-row active' : 'option-row'}
                  onClick={() => {
                    config.setParam(def.key, o);
                    if (kind) onDemo?.(kind, String(o));
                  }}
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
