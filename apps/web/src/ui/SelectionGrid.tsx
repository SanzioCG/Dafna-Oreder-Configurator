interface SelectionGridProps<T> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: (value: T) => string;
  ariaLabel: string;
  /** short reason text if an option is not available (renders it disabled) */
  disabledReason?: (value: T) => string | undefined;
}

/**
 * SelectionGrid (design system V2): option buttons for enum parameters. Selection contract:
 * selected = --primary fill + 3 px --primary-strong border; unselected = surface + control
 * border; disabled = neutral fill, muted text and a short human reason (never an error code).
 */
export function SelectionGrid<T extends string | number | boolean>({
  options,
  value,
  onChange,
  label,
  ariaLabel,
  disabledReason,
}: SelectionGridProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const selected = o === value;
        const reason = selected ? undefined : disabledReason?.(o);
        return (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={reason !== undefined}
            className={selected ? 'segment active' : 'segment'}
            onClick={() => onChange(o)}
          >
            <span className="segment-label">{label(o)}</span>
            {reason && <small className="segment-reason">{reason}</small>}
          </button>
        );
      })}
    </div>
  );
}
