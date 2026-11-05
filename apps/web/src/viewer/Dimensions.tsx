import type { Section } from '@dafna/engine';
import { Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef, type MutableRefObject } from 'react';
import { Vector3 } from 'three';

export type V3 = [number, number, number];

const COLOR = '#2b5d8a';
const TICK = 40; // mm

/** One dimension line in product mm coordinates. */
export interface DimSpec {
  key: string;
  from: V3;
  to: V3;
  /** unit vector for the end ticks */
  tick: V3;
  label: string;
  small: boolean;
  /** extension lines from the product to each end of the dimension line */
  ext?: [V3, V3];
}

/** Extra space (mm) the annotations need around the product, for camera framing. */
export const DIMENSION_MARGIN = { right: 260, top: 320 };

/**
 * Overall width / height / depth, plus per-section inner widths on top when `showSections`
 * (the viewer hides them while closed doors cover the sections).
 */
export function buildDimensions(
  W: number,
  H: number,
  D: number,
  sections: Section[],
  unit: string,
  showSections = true,
): DimSpec[] {
  const sectionY = H + 90;
  const widthY = H + 230;
  const sideX = W + 140;
  return [
    ...(showSections ? sections : []).map<DimSpec>((s) => ({
      key: `section-${s.index}`,
      from: [s.xStartMm, sectionY, D],
      to: [s.xStartMm + s.innerWidthMm, sectionY, D],
      tick: [0, 1, 0],
      label: `${s.innerWidthMm}`,
      small: true,
    })),
    {
      key: 'width',
      from: [0, widthY, D],
      to: [W, widthY, D],
      tick: [0, 1, 0],
      label: `${W} ${unit}`,
      small: false,
      ext: [
        [0, H, D],
        [W, H, D],
      ],
    },
    {
      key: 'height',
      from: [sideX, 0, D],
      to: [sideX, H, D],
      tick: [1, 0, 0],
      label: `${H} ${unit}`,
      small: false,
      ext: [
        [W, 0, D],
        [W, H, D],
      ],
    },
    {
      key: 'depth',
      from: [sideX, H, 0],
      to: [sideX, H, D],
      tick: [1, 0, 0],
      label: `${D} ${unit}`,
      small: false,
      ext: [
        [W, H, 0],
        [W, H, D],
      ],
    },
  ];
}

export function midpoint(d: DimSpec): V3 {
  return [(d.from[0] + d.to[0]) / 2, (d.from[1] + d.to[1]) / 2, (d.from[2] + d.to[2]) / 2];
}

/** Dimension lines, rendered inside the product group (mm coordinates). */
export function DimensionLines({ dims, lineScale = 1 }: { dims: DimSpec[]; lineScale?: number }) {
  const w = (px: number) => px * lineScale;
  return (
    <group>
      {dims.map((d) => {
        const at = (p: V3, s: number): V3 => [
          p[0] + d.tick[0] * s,
          p[1] + d.tick[1] * s,
          p[2] + d.tick[2] * s,
        ];
        return (
          <group key={d.key}>
            <Line points={[d.from, d.to]} color={COLOR} lineWidth={w(d.small ? 1.5 : 2)} />
            <Line
              points={[at(d.from, -TICK / 2), at(d.from, TICK / 2)]}
              color={COLOR}
              lineWidth={w(2)}
            />
            <Line
              points={[at(d.to, -TICK / 2), at(d.to, TICK / 2)]}
              color={COLOR}
              lineWidth={w(2)}
            />
            {d.ext && (
              <>
                <Line
                  points={[d.ext[0], at(d.from, TICK / 2)]}
                  color={COLOR}
                  lineWidth={w(1)}
                  transparent
                  opacity={0.45}
                />
                <Line
                  points={[d.ext[1], at(d.to, TICK / 2)]}
                  color={COLOR}
                  lineWidth={w(1)}
                  transparent
                  opacity={0.45}
                />
              </>
            )}
          </group>
        );
      })}
    </group>
  );
}

export type LabelRefs = MutableRefObject<Map<string, HTMLDivElement>>;

/**
 * Projects label anchor points (world metres) to screen every frame and moves the DOM labels
 * rendered by <DimensionLabels>. Plain DOM labels stay crisp at 4K and never block touch.
 */
export function LabelProjector({
  anchors,
  labelRefs,
}: {
  anchors: { key: string; world: V3 }[];
  labelRefs: LabelRefs;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useRef(new Vector3());
  useFrame(() => {
    for (const a of anchors) {
      const el = labelRefs.current.get(a.key);
      if (!el) continue;
      v.current.set(a.world[0], a.world[1], a.world[2]).project(camera);
      const visible = v.current.z < 1;
      const x = ((v.current.x + 1) / 2) * size.width;
      const y = ((1 - v.current.y) / 2) * size.height;
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.visibility = visible ? 'visible' : 'hidden';
    }
  });
  return null;
}

/** DOM overlay with one label per dimension; positioned by <LabelProjector>. */
export function DimensionLabels({ dims, labelRefs }: { dims: DimSpec[]; labelRefs: LabelRefs }) {
  return (
    <div className="dim-labels" aria-hidden="true">
      {dims.map((d) => (
        <div
          key={d.key}
          data-dim={d.key}
          className={d.small ? 'dim-label dim-label-small' : 'dim-label'}
          ref={(el) => {
            if (el) labelRefs.current.set(d.key, el);
            else labelRefs.current.delete(d.key);
          }}
        >
          {d.label}
        </div>
      ))}
    </div>
  );
}
