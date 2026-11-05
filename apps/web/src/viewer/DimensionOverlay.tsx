import { useFrame, useThree } from '@react-three/fiber';
import { useRef, type MutableRefObject } from 'react';
import { Vector3 } from 'three';
import {
  labelSize,
  midpoint,
  resolveLabelOverlaps,
  tickPoints,
  type DimSpec,
  type LabelBox,
  type V3,
} from './dimensions';

/** SVG elements of one dimension, collected once at mount (no DOM queries per frame). */
export interface DimElements {
  main: SVGLineElement;
  ticks: [SVGLineElement, SVGLineElement];
  ext: SVGLineElement[];
  label: SVGGElement;
  group: SVGGElement;
}

export type DimRegistry = MutableRefObject<Map<string, DimElements>>;

/** Label font size in rem (primary / secondary); the overlay converts with the root font size. */
export const LABEL_REM = { primary: 1.05, secondary: 0.85 };

/**
 * One SVG overlay for all dimension annotations (brand-blue lines, perpendicular end ticks,
 * no arrowheads, solid pill labels on the theme surface). React renders the structure once per
 * spec change; <DimensionProjector> (inside the canvas render loop) writes the projected
 * coordinates straight into the elements via refs — no React state during camera motion.
 */
export function DimensionSvg({
  dims,
  registry,
  remPx,
}: {
  dims: DimSpec[];
  registry: DimRegistry;
  remPx: number;
}) {
  return (
    <svg className="dim-overlay" aria-hidden="true" data-testid="dim-overlay">
      {dims.map((d) => {
        const font = LABEL_REM[d.kind] * remPx;
        const { w, h } = labelSize(d.label, font);
        return (
          <g
            key={d.key}
            data-dim={d.key}
            className={`dim dim-${d.kind}`}
            visibility="hidden"
            ref={(g) => {
              if (!g) {
                registry.current.delete(d.key);
                return;
              }
              const lines = g.querySelectorAll('line');
              const label = g.querySelector('g');
              if (!label || lines.length < 3) return;
              registry.current.set(d.key, {
                group: g,
                main: lines[0] as SVGLineElement,
                ticks: [lines[1] as SVGLineElement, lines[2] as SVGLineElement],
                ext: Array.from(lines).slice(3) as SVGLineElement[],
                label,
              });
            }}
          >
            <line className="dim-line" />
            <line className="dim-tick" />
            <line className="dim-tick" />
            {d.ext && (
              <>
                <line className="dim-ext" />
                <line className="dim-ext" />
              </>
            )}
            <g className="dim-label" data-dim-label={d.key}>
              <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} />
              <text dominantBaseline="central" textAnchor="middle" style={{ fontSize: font }}>
                {d.label}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function setLine(el: SVGLineElement, a: { x: number; y: number }, b: { x: number; y: number }) {
  el.setAttribute('x1', a.x.toFixed(1));
  el.setAttribute('y1', a.y.toFixed(1));
  el.setAttribute('x2', b.x.toFixed(1));
  el.setAttribute('y2', b.y.toFixed(1));
}

/**
 * Inside the <Canvas>: projects every dimension's world points each frame and moves the SVG
 * elements; runs the (pure) label collision rule on the projected label boxes.
 * `toWorld` maps product mm to world metres (same transform as the product group).
 */
export function DimensionProjector({
  dims,
  registry,
  toWorld,
  remPx,
}: {
  dims: DimSpec[];
  registry: DimRegistry;
  toWorld: (p: V3) => V3;
  remPx: number;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useRef(new Vector3());

  useFrame(() => {
    const project = (p: V3) => {
      const w = toWorld(p);
      v.current.set(w[0], w[1], w[2]).project(camera);
      return {
        x: ((v.current.x + 1) / 2) * size.width,
        y: ((1 - v.current.y) / 2) * size.height,
        front: v.current.z < 1,
      };
    };
    const boxes: LabelBox[] = [];
    const anchors = new Map<string, { x: number; y: number }>();
    for (const d of dims) {
      const el = registry.current.get(d.key);
      if (!el) continue;
      const a = project(d.from);
      const b = project(d.to);
      setLine(el.main, a, b);
      const [t0, t1, t2, t3] = tickPoints(d).map(project);
      if (t0 && t1 && t2 && t3) {
        setLine(el.ticks[0], t0, t1);
        setLine(el.ticks[1], t2, t3);
        if (d.ext && el.ext.length === 2) {
          const e0 = el.ext[0];
          const e1 = el.ext[1];
          if (e0) setLine(e0, project(d.ext[0]), t1);
          if (e1) setLine(e1, project(d.ext[1]), t3);
        }
      }
      const m = project(midpoint(d));
      anchors.set(d.key, m);
      const { w, h } = labelSize(d.label, LABEL_REM[d.kind] * remPx);
      boxes.push({
        key: d.key,
        kind: d.kind,
        x: m.x,
        y: m.y,
        w,
        h,
        visible: a.front && b.front,
      });
      el.group.setAttribute('visibility', a.front && b.front ? 'visible' : 'hidden');
    }
    const placement = resolveLabelOverlaps(boxes);
    for (const [key, p] of placement) {
      const el = registry.current.get(key);
      const m = anchors.get(key);
      if (!el || !m) continue;
      el.label.setAttribute(
        'transform',
        `translate(${(m.x + p.dx).toFixed(1)} ${(m.y + p.dy).toFixed(1)})`,
      );
      el.label.setAttribute('visibility', p.visible ? 'inherit' : 'hidden');
    }
  });
  return null;
}
