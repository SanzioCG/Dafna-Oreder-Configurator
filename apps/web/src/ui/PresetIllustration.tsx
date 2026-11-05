import type { InteriorPreset } from '@dafna/engine';

/**
 * Flat line illustrations of the interior presets (inline SVG, no external assets).
 * Strokes use currentColor, so a selected (brand-blue, white text) card turns them white.
 */
const W = 72;
const H = 96;
const X0 = 8;
const X1 = W - 8;
const Y0 = 6;
const Y1 = H - 6;

function Shelf({ y }: { y: number }) {
  return <line x1={X0} x2={X1} y1={y} y2={y} />;
}

function Rail({ y }: { y: number }) {
  return (
    <g>
      <line x1={X0 + 3} x2={X1 - 3} y1={y} y2={y} strokeWidth={3} />
      {[22, 36, 50].map((x) => (
        <path key={x} d={`M${x} ${y} l0 4 l-8 7 l16 0 l-8 -7`} strokeWidth={1.5} fill="none" />
      ))}
    </g>
  );
}

function Drawers({ bottom }: { bottom: number }) {
  const h = 13;
  return (
    <g>
      {[0, 1].map((i) => {
        const y = bottom - (i + 1) * (h + 2);
        return (
          <g key={i}>
            <rect x={X0 + 3} y={y} width={X1 - X0 - 6} height={h} rx={2} />
            <line x1={W / 2 - 6} x2={W / 2 + 6} y1={y + h / 2} y2={y + h / 2} strokeWidth={2} />
          </g>
        );
      })}
    </g>
  );
}

function Inner({ preset }: { preset: InteriorPreset }) {
  switch (preset) {
    case 'empty':
      return null;
    case 'shelves':
      return (
        <g>
          {[24, 42, 60, 78].map((y) => (
            <Shelf key={y} y={y} />
          ))}
        </g>
      );
    case 'rail':
      return <Rail y={16} />;
    case 'rail_shelf':
      return (
        <g>
          <Shelf y={22} />
          <Rail y={30} />
        </g>
      );
    case 'drawers_shelves':
      return (
        <g>
          <Drawers bottom={Y1 - 2} />
          <Shelf y={58} />
          <Shelf y={40} />
          <Shelf y={22} />
        </g>
      );
    case 'rail_drawers':
      return (
        <g>
          <Shelf y={20} />
          <Rail y={28} />
          <Shelf y={58} />
          <Drawers bottom={Y1 - 2} />
        </g>
      );
  }
}

export function PresetIllustration({
  preset,
  auto = false,
}: {
  preset: InteriorPreset;
  auto?: boolean;
}) {
  return (
    <svg
      className="preset-illustration"
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x={X0 - 3} y={Y0 - 3} width={X1 - X0 + 6} height={Y1 - Y0 + 6} rx={5} />
      <Inner preset={preset} />
      {auto && (
        <g strokeWidth={1.5}>
          <circle cx={W - 12} cy={14} r={9} fill="currentColor" stroke="none" opacity={0.15} />
          <path d={`M${W - 16} 18 l4 -9 l4 9 m-6.5 -3 h5`} />
        </g>
      )}
    </svg>
  );
}
