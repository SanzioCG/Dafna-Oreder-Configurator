import { generate, getMaterial, type Panel, type Params, type Template } from '@dafna/engine';
import { useMemo } from 'react';
import { CATALOG, TEMPLATE } from '../state/useConfigurator';

/** parts drawn in the front view (carcass, fronts, work top, legs, frame) */
const VISIBLE = [
  'side',
  'top',
  'bottom',
  'plinth',
  'door',
  'drawer_front',
  'worktop',
  'leg',
  'modesty',
  'frame',
];
const FRONT = ['door', 'drawer_front'];

/**
 * Small pre-rendered front view of a configured wardrobe, drawn from ENGINE output (panel
 * x / y extents in the front plane): carcass, plinth and door leaves in their decor colour,
 * 2 px --ink lines. No WebGL — four of them on the start screen cost nothing.
 */
export function ModelThumbnail({
  params,
  label,
  template = TEMPLATE,
}: {
  params: Params;
  label: string;
  template?: Template;
}) {
  const shapes = useMemo(() => {
    const r = generate(template, params);
    const W = r.dimensions?.widthMm ?? Number(params.width);
    const H = r.dimensions?.heightMm ?? Number(params.height);
    const front = (p: Panel) => {
      // front-plane extent: vertical boards (sides) are thick in X, others long in X
      const xLen = p.rotation[2] === 90 ? p.thicknessMm : p.lengthMm;
      const yLen =
        p.rotation[2] === 90 ? p.lengthMm : p.rotation[0] === 90 ? p.widthMm : p.thicknessMm;
      return { x: p.position[0] - xLen / 2, y: H - (p.position[1] + yLen / 2), w: xLen, h: yLen };
    };
    const color = (p: Panel) => getMaterial(CATALOG, p.material)?.colorHex ?? '#ffffff';
    const visible = r.panels.filter((p) => VISIBLE.includes(p.role));
    // fronts last so they cover the carcass front
    visible.sort((a, b) => Number(FRONT.includes(a.role)) - Number(FRONT.includes(b.role)));
    return { W, H, rects: visible.map((p) => ({ id: p.id, ...front(p), fill: color(p) })) };
  }, [params, template]);

  const pad = 40;
  return (
    <svg
      className="model-thumb"
      viewBox={`${-pad} ${-pad} ${shapes.W + 2 * pad} ${shapes.H + 2 * pad}`}
      role="img"
      aria-label={label}
      data-testid="model-thumb"
    >
      {shapes.rects.map((r) => (
        <rect
          key={r.id}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={r.fill}
          stroke="var(--ink)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
