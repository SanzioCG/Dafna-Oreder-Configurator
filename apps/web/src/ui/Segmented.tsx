interface SegmentedProps<T> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: (value: T) => string;
  ariaLabel: string;
  /** short reason text if an option is not available (renders it disabled) */
  disabledReason?: (value: T) => string | undefined;
}

/**
 * Option buttons for enum parameters. Selection state contract: selected = solid brand-blue
 * fill + white text; unselected = white fill + graphite text; disabled = 40% opacity + a short
 * reason. The card behind the buttons may be pastel, but pastel never indicates state.
 */
export function Segmented<T extends string | number | boolean>({
  options,
  value,
  onChange,
  label,
  ariaLabel,
  disabledReason,
}: SegmentedProps<T>) {
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
