import { clampParam, getParamDef } from '@dafna/engine';
import { useState } from 'react';
import { useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import { TEMPLATE, type Configurator } from '../state/useConfigurator';
import { fromDisplay, toDisplay, unitSystemFor } from '../viewer/dimensions';
import { DimensionControl } from './DimensionControl';
import { ChevronIcon } from './icons';
import { Toggle } from './Toggle';

/** Quick width chips (cm). Values inside the template range only. */
export const WIDTH_CHIPS_CM = [100, 120, 150, 180, 200, 240];
/** Every stepper / slider move is 10 mm (= 1 sm for customers). */
export const SIZE_STEP_MM = 10;

/**
 * Step 1 "Joy" (mint card): "Shkaf qayerga turadi?". Width is the main control (quick chips,
 * a big − value + stepper, slider); height and depth live under "Batafsil"; "Pastki yopiq
 * taglik" = base plinth. Section count is never shown to customers (always auto).
 * Customers see whole centimetres, staff millimetres; the engine stays in mm.
 */
export function SizeStep({ mode, config }: { mode: Mode; config: Configurator }) {
  const { t } = useI18n();
  const [details, setDetails] = useState(false);
  const units = unitSystemFor(mode);
  const unit = t(units === 'cm' ? 'unit.cm' : 'unit.mm');
  const staff = mode === 'staff';

  const dimension = (key: 'width' | 'height' | 'depth', label: string) => {
    const def = getParamDef(TEMPLATE, key);
    if (!def) return null;
    const mm = Number(config.params[key] ?? def.default);
    const step = toDisplay(SIZE_STEP_MM, units);
    return (
      <DimensionControl
        key={key}
        paramKey={key}
        label={label}
        header={
          <div className="param-header">
            <span className="param-label">{label}</span>
          </div>
        }
        value={toDisplay(mm, units)}
        min={toDisplay(def.min ?? 0, units)}
        max={toDisplay(def.max ?? 100000, units)}
        step={step}
        clamp={!staff}
        onChange={(v) => config.setParam(key, fromDisplay(v, units))}
        clampValue={(v) => toDisplay(clampParam(def, fromDisplay(v, units)), units)}
        unit={unit}
      />
    );
  };

  const width = Number(config.params.width);
  const plinth = config.params.base === 'plinth';
  return (
    <section className="card step-card" data-step="size" data-card="size">
      <div className="card-head">
        <h2>{t('step.size.title')}</h2>
        <p className="muted">{t('step.size.hint')}</p>
      </div>

      <div className="chips" role="radiogroup" aria-label={t('c.widthChips')}>
        {WIDTH_CHIPS_CM.map((cm) => {
          const selected = width === cm * 10;
          return (
            <button
              key={cm}
              type="button"
              role="radio"
              aria-checked={selected}
              className={selected ? 'segment chip active' : 'segment chip'}
              onClick={() => config.setParam('width', cm * 10)}
            >
              {units === 'cm' ? `${cm} ${unit}` : `${cm * 10} ${unit}`}
            </button>
          );
        })}
      </div>

      {dimension('width', t('param.width'))}

      <button
        type="button"
        className="btn btn-text disclosure"
        aria-expanded={details}
        onClick={() => setDetails((d) => !d)}
      >
        <ChevronIcon className={details ? 'icon chevron open' : 'icon chevron'} />
        {t('c.details')}
      </button>
      {details && (
        <div className="details" data-testid="size-details">
          {dimension('height', t('param.height'))}
          {dimension('depth', t('param.depth'))}
        </div>
      )}

      <Toggle
        checked={plinth}
        onChange={(on) => config.setParam('base', on ? 'plinth' : 'none')}
        testId="toggle-base"
      >
        {t('c.base')}
      </Toggle>
    </section>
  );
}
