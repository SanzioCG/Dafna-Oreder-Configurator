import { brandItem, extensionBrand } from '@dafna/engine';
import { useState } from 'react';
import { useI18n } from '../i18n/I18n';
import type { Configurator } from '../state/useConfigurator';
import { hardwareParams } from '../steps';
import { HardwarePicker, type HardwareChoice } from './HardwarePicker';
import { MechPhoto } from './MechPhoto';

/** hardware param -> the mechanism it drives in the 3D demo */
const KIND: Record<string, 'hinge' | 'slide'> = { hingeBrand: 'hinge', slideBrand: 'slide' };

/**
 * D-9 "Mexanizmlar": the hardware of each mechanism the configuration actually has (door hinges
 * if there are doors, drawer slides if there are drawers). Template params with uiStep
 * 'hardware'; brand names are never translated. D-10: the 3D view shows the mechanisms;
 * picking a model (or "Ko'rish") plays how it closes.
 * D-23: the card shows the chosen model; tapping it opens the large menu (HardwarePicker) with
 * every model grouped by brand.
 */
export function HardwareBlock({
  config,
  onDemo,
}: {
  config: Configurator;
  onDemo?: (kind: 'hinge' | 'slide', brand: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const defs = hardwareParams(config.template, config.view.result);
  if (defs.length === 0) return null;
  const openDef = defs.find((d) => d.key === open);
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
        const current = brandText(t, kind, value, def.key);
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
            <button
              type="button"
              className="option-row active hw-current"
              data-testid={`hw-open-${def.key}`}
              aria-haspopup="dialog"
              onClick={() => setOpen(def.key)}
            >
              {kind && <MechPhoto kind={kind} brand={value} alt={current.model} />}
              <span className="option-text">
                <span className="option-title">{current.title}</span>
                <span className="option-hint">{current.hint}</span>
              </span>
              <span className="hw-current-action">
                {t('hw.change')} <span aria-hidden="true">›</span>
              </span>
            </button>
          </div>
        );
      })}
      {openDef && (
        <HardwarePicker
          kind={KIND[openDef.key]}
          title={t(`hw.pick.${openDef.key}`)}
          value={String(config.params[openDef.key] ?? openDef.default)}
          choices={choicesFor(t, openDef.key, openDef.options ?? [], config)}
          onPick={(v) => {
            config.setParam(openDef.key, v);
            const kind = KIND[openDef.key];
            if (kind) onDemo?.(kind, v);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

/** every model of a mechanism, D-20: a brand hidden on the manager page only while chosen */
function choicesFor(
  t: (key: string) => string,
  key: string,
  options: readonly (string | number | boolean)[],
  config: Configurator,
): HardwareChoice[] {
  const kind = KIND[key];
  const value = String(config.params[key] ?? '');
  return options
    .map(String)
    .filter((o) => {
      const x = kind ? extensionBrand(kind, o) : undefined;
      return !x || x.visible || o === value;
    })
    .map((o) => {
      const text = brandText(t, kind, o, key);
      const x = kind ? extensionBrand(kind, o) : undefined;
      return {
        value: o,
        brand: text.title,
        model: text.model,
        hint: text.hint,
        softClose: x ? x.softClose : brandItem(kind ?? '', o)?.softClose === true,
      };
    });
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
