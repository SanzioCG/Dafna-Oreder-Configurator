import { clampParam, type ParamDef, type ParamValue, type Params } from '@dafna/engine';
import type { ReactNode } from 'react';
import { optionLabel, useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import { DimensionControl } from './DimensionControl';
import { blockingIssue } from './optionAvailability';
import { SelectionGrid } from './SelectionGrid';
import { MaterialSwatch } from './MaterialSwatch';

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
        <MaterialSwatch
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
    return (
      <DimensionControl
        paramKey={def.key}
        label={label}
        header={header}
        value={num}
        min={min}
        max={max}
        step={step}
        clamp={!staff}
        onChange={(n) => onChange(def.key, n)}
        clampValue={(n) => clampParam(def, n)}
        unit={t('unit.mm')}
        hasError={hasError}
        note={note}
      />
    );
  }

  if (def.type === 'enum') {
    return (
      <div className={hasError ? 'param param-error' : 'param'} data-param={def.key}>
        {header}
        <SelectionGrid
          options={def.options ?? []}
          value={value}
          onChange={(v) => onChange(def.key, v)}
          label={(v) =>
            def.unit && typeof v === 'number'
              ? `${v} ${t('unit.mm')}`
              : optionLabel(t, optionKey, v)
          }
          ariaLabel={label}
          disabledReason={(v) => {
            const code = blockingIssue(def, v, params, mode);
            if (!code) return undefined;
            const reason = t(`reason.${code}`);
            return reason === `reason.${code}` ? t('reason.default') : reason;
          }}
        />
        {note}
      </div>
    );
  }

  // bool
  return (
    <div className="param" data-param={def.key}>
      {header}
      <SelectionGrid
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
