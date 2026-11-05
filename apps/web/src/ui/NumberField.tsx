import { useState, type ChangeEvent, type KeyboardEvent } from 'react';

interface NumberFieldProps {
  value: number;
  min: number;
  max: number;
  /** customer mode: always clamp. staff mode: commit out-of-range values to show engine errors. */
  clamp: boolean;
  onCommit: (value: number) => void;
  label: string;
  unit: string;
}

const INT = /^\d{1,5}$/;

/**
 * Integer field synced with the slider. While typing, values inside [min, max] are applied
 * immediately; on blur / Enter the value is committed (clamped in customer mode).
 */
export function NumberField({ value, min, max, clamp, onCommit, label, unit }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value.replace(/\D/g, '').slice(0, 5);
    setDraft(text);
    if (INT.test(text)) {
      const n = Number(text);
      if (n >= min && n <= max) onCommit(n);
    }
  };

  const commit = () => {
    if (draft === null) return;
    if (INT.test(draft)) {
      const n = Number(draft);
      onCommit(clamp ? Math.min(max, Math.max(min, n)) : n);
    }
    setDraft(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setDraft(null);
      e.currentTarget.blur();
    }
  };

  return (
    <label className="number-field">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label={label}
        value={draft ?? String(value)}
        onFocus={(e) => {
          setDraft(String(value));
          e.currentTarget.select();
        }}
        onChange={onChange}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <span className="number-unit">{unit}</span>
    </label>
  );
}
