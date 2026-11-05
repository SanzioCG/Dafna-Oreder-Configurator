import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18n';
import { IconButton } from './Button';
import { MinusIcon, PlusIcon } from './icons';
import { NumberField } from './NumberField';
import { Slider } from './Slider';
import { StatusMessage } from './StatusMessage';

/** How long the out-of-range explanation stays visible (ms). */
export const RANGE_NOTICE_MS = 5000;

export interface DimensionControlProps {
  /** accessible name of the input / slider / ± buttons */
  label: string;
  /** visible header (label + staff badges) */
  header: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  /** customer: typed values are clamped to [min, max] on blur; staff may commit out of range */
  clamp: boolean;
  onChange: (value: number) => void;
  /** clamps a ± result to the parameter's valid range */
  clampValue: (value: number) => number;
  unit: string;
  hasError?: boolean;
  /** extra lines under the slider (staff hints, notes) */
  note?: ReactNode;
  paramKey?: string;
}

/**
 * DimensionControl (design system V2): label, [−] numeric input [+], slider, min / max labels.
 * Slider, input and ± share ONE state (the parameter value): ± and the input clamp to
 * [min, max]. A typed value outside the range is not accepted: on blur it is corrected to the
 * nearest limit and the reason is shown under the control (customer mode, never silently).
 */
export function DimensionControl({
  label,
  header,
  value,
  min,
  max,
  step,
  clamp,
  onChange,
  clampValue,
  unit,
  hasError = false,
  note,
  paramKey,
}: DimensionControlProps) {
  const { t } = useI18n();
  const [corrected, setCorrected] = useState<{ typed: number; applied: number } | null>(null);
  useEffect(() => {
    if (!corrected) return;
    const timer = setTimeout(() => setCorrected(null), RANGE_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [corrected]);

  const change = (n: number) => {
    setCorrected(null);
    onChange(n);
  };
  const bump = (dir: 1 | -1) => change(clampValue(value + dir * step));
  return (
    <div className={hasError ? 'param param-error' : 'param'} data-param={paramKey}>
      <div className="param-top">
        {header}
        <div className="param-row">
          <IconButton
            label={`${label}: ${t('control.decrease')}`}
            icon={<MinusIcon />}
            disabled={value <= min}
            onClick={() => bump(-1)}
          />
          <NumberField
            value={value}
            min={min}
            max={max}
            clamp={clamp}
            onCommit={onChange}
            onCorrected={(typed, applied) => setCorrected({ typed, applied })}
            label={label}
            unit={unit}
          />
          <IconButton
            label={`${label}: ${t('control.increase')}`}
            icon={<PlusIcon />}
            disabled={value >= max}
            onClick={() => bump(1)}
          />
        </div>
      </div>
      <Slider min={min} max={max} step={step} value={value} onChange={change} label={label} />
      <div
        className="slider-scale"
        aria-hidden="true"
        data-testid={paramKey && `scale-${paramKey}`}
      >
        <span>
          {min} {unit}
        </span>
        <span>
          {max} {unit}
        </span>
      </div>
      {corrected && (
        <StatusMessage tone="error" testId={paramKey && `range-${paramKey}`}>
          {t('control.outOfRange', {
            label,
            min,
            max,
            unit,
            typed: corrected.typed,
            applied: corrected.applied,
          })}
        </StatusMessage>
      )}
      {note}
    </div>
  );
}
