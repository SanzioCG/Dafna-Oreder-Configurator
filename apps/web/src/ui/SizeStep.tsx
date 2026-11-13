import { clampParam, getParamDef } from '@dafna/engine';
import { useState } from 'react';
import { useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import type { Configurator } from '../state/useConfigurator';
import { fromDisplay, toDisplay, unitSystemFor } from '../viewer/dimensions';
import { DimensionControl } from './DimensionControl';
import { ChevronIcon } from './icons';
import { Toggle } from './Toggle';

/** Quick width chips (cm). Values inside the template range only. */
export const WIDTH_CHIPS_CM = [100, 120, 150, 180, 200, 240];
/** Every stepper / slider move is 10 mm (= 1 sm for customers). */
export const SIZE_STEP_MM = 10;

/**
 * Step 1 "Joy" (mint card): "Shkaf qayerga turadi?". D-7: customers choose standard sizes only
 * (template customerValues: width, height, depth chips; depth 60 sm = hanging clothes, 45 sm =
 * shelves and drawers) plus "Pastki yopiq taglik" (base plinth). Staff keep free input (chips,
 * stepper, slider, height and depth under "Batafsil"). Section count is always auto for customers.
 * Customers see whole centimetres, staff millimetres; the engine stays in mm.
 */
export function SizeStep({ mode, config }: { mode: Mode; config: Configurator }) {
  const { t } = useI18n();
  const [details, setDetails] = useState(false);
  const units = unitSystemFor(mode);
  const unit = t(units === 'cm' ? 'unit.cm' : 'unit.mm');
  const staff = mode === 'staff';

  const dimension = (key: 'width' | 'height' | 'depth', label: string) => {
    const def = getParamDef(config.template, key);
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

  // D-7: customers choose standard sizes only (template customerValues); staff keep free input
  const standard = (key: 'width' | 'height' | 'depth') =>
    getParamDef(config.template, key)?.customerValues;
  if (!staff && standard('width')) {
    const chipGroup = (
      key: 'width' | 'height' | 'depth',
      label: string,
      hint?: (mm: number) => string,
    ) => {
      const values = standard(key) ?? [];
      const current = Number(config.params[key] ?? getParamDef(config.template, key)?.default);
      return (
        <div className="param" data-param={key}>
          <span className="param-label">{label}</span>
          <div className="chips" role="radiogroup" aria-label={label}>
            {values.map((mm) => {
              const selected = current === mm;
              return (
                <button
                  key={mm}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-value={mm}
                  className={selected ? 'segment chip active' : 'segment chip'}
                  onClick={() => config.setParam(key, mm)}
                >
                  {`${toDisplay(mm, units)} ${unit}`}
                  {hint && <small className="chip-hint">{hint(mm)}</small>}
                </button>
              );
            })}
          </div>
        </div>
      );
    };
    return (
      <section className="card step-card" data-step="size" data-card="size">
        <div className="card-head">
          <h2>{t(`step.size.title.${config.product}`)}</h2>
          <p className="muted">{t(`step.size.hint.${config.product}`)}</p>
        </div>
        {chipGroup('width', t('param.width'))}
        {chipGroup('height', t('param.height'))}
        {chipGroup(
          'depth',
          t('param.depth'),
          config.product !== 'wardrobe'
            ? undefined
            : (mm) => t(mm >= 560 ? 'c.depthHang' : 'c.depthShallow'),
        )}
        <BaseToggle config={config} />
      </section>
    );
  }

  return (
    <section className="card step-card" data-step="size" data-card="size">
      <div className="card-head">
        <h2>{t(`step.size.title.${config.product}`)}</h2>
        <p className="muted">{t(`step.size.hint.${config.product}`)}</p>
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

      <BaseToggle config={config} />
    </section>
  );
}

/**
 * Base choice per product (D-8): wardrobe "Pastki yopiq taglik" (plinth / none), pedestal
 * "G'ildirakli" (castors / plinth); products without a base param (desk) show nothing.
 */
export function BaseToggle({ config }: { config: Configurator }) {
  const { t } = useI18n();
  const def = getParamDef(config.template, 'base');
  if (!def?.options) return null;
  if (def.options.includes('castors')) {
    return (
      <Toggle
        checked={config.params.base === 'castors'}
        onChange={(on) => config.setParam('base', on ? 'castors' : 'plinth')}
        testId="toggle-base"
      >
        {t('c.castors')}
      </Toggle>
    );
  }
  return (
    <Toggle
      checked={config.params.base === 'plinth'}
      onChange={(on) => config.setParam('base', on ? 'plinth' : 'none')}
      testId="toggle-base"
    >
      {t('c.base')}
    </Toggle>
  );
}
