import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { cssToken } from '../theme/cssToken';

/** Inner box of one section in product mm (x0..x1, y0..y1, z0 = back, z1 = carcass front). */
export interface SectionBox {
  index: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** Max pointer travel (px) for a tap; more is an orbit drag. */
const TAP_PX = 8;

/**
 * Interior step: invisible hit volumes per section (tap selects the section) and a soft
 * brand-blue outline + tint on the selected section's front opening. Rendered inside the
 * product group (mm coordinates).
 */
export function SectionPicker({
  boxes,
  selected,
  onTap,
  lineScale,
}: {
  boxes: SectionBox[];
  selected: number | null;
  onTap: (index: number) => void;
  lineScale: number;
}) {
  const blue = cssToken('--primary', '#009fe3');
  const sel = boxes.find((b) => b.index === selected);
  return (
    <group>
      {boxes.map((b) => (
        <mesh
          key={b.index}
          position={[(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2]}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            if (e.delta > TAP_PX) return;
            e.stopPropagation();
            onTap(b.index);
          }}
        >
          <boxGeometry args={[b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {sel && (
        <group>
          <mesh position={[(sel.x0 + sel.x1) / 2, (sel.y0 + sel.y1) / 2, sel.z1 + 1]}>
            <planeGeometry args={[sel.x1 - sel.x0, sel.y1 - sel.y0]} />
            <meshBasicMaterial color={blue} transparent opacity={0.08} depthWrite={false} />
          </mesh>
          <Line
            points={[
              [sel.x0 + 4, sel.y0 + 4, sel.z1 + 2],
              [sel.x1 - 4, sel.y0 + 4, sel.z1 + 2],
              [sel.x1 - 4, sel.y1 - 4, sel.z1 + 2],
              [sel.x0 + 4, sel.y1 - 4, sel.z1 + 2],
              [sel.x0 + 4, sel.y0 + 4, sel.z1 + 2],
            ]}
            color={blue}
            lineWidth={3 * lineScale}
            transparent
            opacity={0.9}
          />
        </group>
      )}
    </group>
  );
}
