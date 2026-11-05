import type { InteriorPreset } from '@dafna/engine';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Headset,
  Minus,
  Moon,
  Plus,
  Scan,
  Sun,
  TriangleAlert,
  Info,
  X,
  type LucideProps,
} from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Icon set (design system V2): lucide-react for general UI, plus a custom inline-SVG set for
 * the interior presets drawn on the same 24×24 viewBox with the same 2 px stroke. No emoji.
 * Every icon uses currentColor and the `.icon` size (1.25em) unless a class overrides it.
 */
type IconProps = { className?: string };

const lucide = (C: (p: LucideProps) => ReactNode) =>
  function Icon({ className }: IconProps) {
    return <C className={className ?? 'icon'} strokeWidth={2} aria-hidden focusable={false} />;
  };

export const ArrowLeftIcon = lucide(ArrowLeft);
export const ArrowRightIcon = lucide(ArrowRight);
export const CheckIcon = lucide(Check);
export const CloseIcon = lucide(X);
export const MinusIcon = lucide(Minus);
export const PlusIcon = lucide(Plus);
export const SunIcon = lucide(Sun);
export const MoonIcon = lucide(Moon);
export const WarningIcon = lucide(TriangleAlert);
export const InfoIcon = lucide(Info);
export const ConsultantIcon = lucide(Headset);
/** "Markazlash": frame the model */
export const ReframeIcon = lucide(Scan);
/** presentation success badge (coloured by CSS: --success) */
export const SuccessIcon = lucide(CircleCheck);

/* ---------- custom interior preset icons (Lucide geometry: 24×24, stroke 2) ---------- */

function PresetSvg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'icon'}
      aria-hidden
      focusable={false}
    >
      {/* section frame */}
      <rect x="4" y="2" width="16" height="20" rx="2" />
      {children}
    </svg>
  );
}

const shelf = (y: number) => <path key={`s${y}`} d={`M4 ${y}h16`} />;
const rail = (y: number) => (
  <g key={`r${y}`}>
    <path d={`M7 ${y}h10`} />
    <path d={`M12 ${y}v1.5l-2.5 2h5l-2.5-2`} />
  </g>
);
const drawer = (y: number) => (
  <g key={`d${y}`}>
    <path d={`M4 ${y}h16`} />
    <path d={`M10.5 ${y + 2.25}h3`} />
  </g>
);

const PRESET_PARTS: Record<InteriorPreset, ReactNode[]> = {
  empty: [],
  shelves: [shelf(7), shelf(12), shelf(17)],
  rail: [rail(6)],
  rail_shelf: [shelf(6), rail(9)],
  drawers_shelves: [shelf(8), shelf(13.5), drawer(17.5)],
  rail_drawers: [rail(5), drawer(13), drawer(17.5)],
};

/** Interior preset icon; `auto` draws a small "A" badge over the resolved preset. */
export function PresetIcon({
  preset,
  auto = false,
  className,
}: {
  preset: InteriorPreset;
  auto?: boolean;
  className?: string;
}) {
  return (
    <PresetSvg className={className}>
      {PRESET_PARTS[preset]}
      {auto && (
        <g>
          <circle cx="19" cy="19" r="4.5" fill="currentColor" stroke="none" />
          <path d="M17.3 21l1.7-4 1.7 4M17.8 19.8h2.4" strokeWidth={1.4} stroke="var(--surface)" />
        </g>
      )}
    </PresetSvg>
  );
}
