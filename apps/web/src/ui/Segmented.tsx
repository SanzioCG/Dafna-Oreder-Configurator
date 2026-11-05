interface SegmentedProps<T> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: (value: T) => string;
  ariaLabel: string;
}

/** Large segmented buttons for enum parameters. */
export function Segmented<T extends string | number | boolean>({
  options,
  value,
  onChange,
  label,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          role="radio"
          aria-checked={o === value}
          className={o === value ? 'segment active' : 'segment'}
          onClick={() => onChange(o)}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}
