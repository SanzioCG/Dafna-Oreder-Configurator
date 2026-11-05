import { clampParam, type ParamDef, type ParamValue, type Params } from '@dafna/engine';
import type { ReactNode } from 'react';
import { optionLabel, useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import { NumberField } from './NumberField';
import { Segmented } from './Segmented';
import { Slider } from './Slider';
import { SwatchPicker } from './SwatchPicker';

interface ParamControlProps {
  def: ParamDef;
  value: ParamValue;
  mode: Mode;
  hasError: boolean;
  onChange: (key: string, value: ParamValue) => void;
  /** all current params (swatches need the corpus decor for "same as corpus") */
  params: Params;
  /** optional extra line under the control (e.g. staff depth breakdown) */
  hint?: ReactNode;
}

/** One control generated from a template parameter definition. */
export function ParamControl({
  def,
  value,
  mode,
  hasError,
  onChange,
  params,
  hint,
}: ParamControlProps) {
  const { t } = useI18n();
  const label = t(def.labelKey, { n: def.appliesToSection });
  const staff = mode === 'staff';
  // Option labels are keyed by the label key, so doorSection1..4 share option.doorSection.*
  const optionKey = def.labelKey.replace(/^param\./, '');

  const header = (
    <div className="param-header">
      <span className="param-label">{label}</span>
      {staff && def.unconfirmed && <span className="badge-unconfirmed">{t('staff.badge')}</span>}
      {staff && !def.customerVisible && <span className="badge-staff">{t('staff.onlyStaff')}</span>}
    </div>
  );
  const unconfirmedNote =
    staff && def.unconfirmed && def.note ? <p className="param-note">{def.note}</p> : null;
  const note = (
    <>
      {hint}
      {unconfirmedNote}
    </>
  );

  if (def.control === 'swatch') {
    return (
      <div className={hasError ? 'param param-error' : 'param'} data-param={def.key}>
        {header}
        <SwatchPicker
          options={def.options ?? []}
          value={value}
          corpusValue={params.corpusMaterial ?? ''}
          mode={mode}
          label={label}
          onChange={(v) => onChange(def.key, v)}
        />
        {note}
      </div>
    );
  }

  if (def.type === 'int') {
    const min = def.min ?? 0;
    const max = def.max ?? 100000;
    const step = def.step ?? 1;
    const num = typeof value === 'number' ? value : Number(def.default);
    const set = (n: number) => onChange(def.key, n);
    const bump = (dir: 1 | -1) => set(clampParam(def, num + dir * step));
    return (
      <div className={hasError ? 'param param-error' : 'param'} data-param={def.key}>
        <div className="param-top">
          {header}
          <div className="param-row">
            <button
              type="button"
              className="stepper"
              aria-label={`${label}: ${t('control.decrease')}`}
              disabled={num <= min}
              onClick={() => bump(-1)}
            >
              −
            </button>
            <NumberField
              value={num}
              min={min}
              max={max}
              clamp={!staff}
              onCommit={set}
              label={label}
              unit={t('unit.mm')}
            />
            <button
              type="button"
              className="stepper"
              aria-label={`${label}: ${t('control.increase')}`}
              disabled={num >= max}
              onClick={() => bump(1)}
            >
              +
            </button>
          </div>
        </div>
        <Slider min={min} max={max} step={step} value={num} onChange={set} label={label} />
        <div className="slider-scale" aria-hidden="true">
          <span>{min}</span>
          <span>{max}</span>
        </div>
        {note}
      </div>
    );
  }

  if (def.type === 'enum') {
    return (
      <div className={hasError ? 'param param-error' : 'param'} data-param={def.key}>
        {header}
        <Segmented
          options={def.options ?? []}
          value={value}
          onChange={(v) => onChange(def.key, v)}
          label={(v) =>
            def.unit && typeof v === 'number'
              ? `${v} ${t('unit.mm')}`
              : optionLabel(t, optionKey, v)
          }
          ariaLabel={label}
        />
        {note}
      </div>
    );
  }

  // bool
  return (
    <div className="param" data-param={def.key}>
      {header}
      <Segmented
        options={[false, true]}
        value={Boolean(value)}
        onChange={(v) => onChange(def.key, v)}
        label={(v) => optionLabel(t, optionKey, v)}
        ariaLabel={label}
      />
      {note}
    </div>
  );
}
