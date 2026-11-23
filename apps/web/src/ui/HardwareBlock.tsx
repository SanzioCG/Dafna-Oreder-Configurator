import { extensionBrand } from '@dafna/engine';
import { useI18n } from '../i18n/I18n';
import type { Configurator } from '../state/useConfigurator';
import { hardwareParams } from '../steps';
import { MechPhoto } from './MechPhoto';

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
              {(def.options ?? [])
                // D-20: a brand hidden on the manager page is offered only while it is chosen
                .filter((o) => {
                  const x = kind ? extensionBrand(kind, String(o)) : undefined;
                  return !x || x.visible || String(o) === value;
                })
                .map((o) => (
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
                    {kind && (
                      <MechPhoto
                        kind={kind}
                        brand={String(o)}
                        alt={brandText(t, kind, String(o)).model}
                      />
                    )}
                    <span className="option-text">
                      <span className="option-title">{brandText(t, kind, String(o)).title}</span>
                      <span className="option-hint">
                        {brandText(t, kind, String(o), def.key).hint}
                      </span>
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

/** D-20: brand texts; a brand added on the manager page shows its own brand / model (never
 * translated), built-in brands their i18n texts. */
function brandText(
  t: (key: string) => string,
  kind: 'hinge' | 'slide' | undefined,
  brand: string,
  paramKey = '',
): { title: string; model: string; hint: string } {
  const x = kind ? extensionBrand(kind, brand) : undefined;
  if (x)
    return {
      title: x.brand,
      model: `${x.brand} ${x.model}`,
      hint: `${x.model}${x.softClose ? ` · ${t('hw.softClose')}` : ''}`,
    };
  return {
    title: t(`hw.brand.${brand}`),
    model: kind ? t(`hw.model.${kind}.${brand}`) : brand,
    hint: t(`hw.hint.${paramKey}.${brand}`),
  };
}
