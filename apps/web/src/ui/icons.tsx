/** Small inline SVG icons (no emoji in UI text). They inherit `currentColor`. */
interface IconProps {
  className?: string;
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function SunIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </svg>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
    </svg>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={3}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function WarningIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </svg>
  );
}

/** "Markazlash": four frame corners around the model. */
export function ReframeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

/** Success badge for the presentation title: filled circle + check. */
export function SuccessIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden focusable={false} className={className}>
      <circle cx="24" cy="24" r="22" fill="var(--success)" />
      <path
        d="M14 24.5l7 7L34.5 17"
        fill="none"
        stroke="#fff"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
