import type { Panel, Rail } from '@dafna/engine';
import { Edges } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { edgeColorFor, materialFor } from './materials';

const DEG = Math.PI / 180;
/** Opening angle and duration of the door animation. */
export const DOOR_OPEN_DEG = 100;
export const DOOR_ANIM_SECONDS = 0.4;

/** The board itself. Engine local frame: length X, thickness Y, width Z (mm). */
function Board({ panel, position }: { panel: Panel; position: [number, number, number] }) {
  const [rx, ry, rz] = panel.rotation;
  return (
    <mesh
      position={position}
      rotation={[rx * DEG, ry * DEG, rz * DEG]}
      material={materialFor(panel.material)}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[panel.lengthMm, panel.thicknessMm, panel.widthMm]} />
      <Edges color={edgeColorFor(panel.material)} threshold={15} />
    </mesh>
  );
}

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/**
 * A door leaf that swings around its hinge edge. The pivot is the hinge-side edge of the
 * door's back face; left-hinged doors rotate by -100°, right-hinged by +100° around Y, which
 * swings them towards the viewer (+Z).
 */
function DoorLeaf({ panel, open }: { panel: Panel; open: boolean }) {
  const pivot = useRef<Group>(null);
  const progress = useRef(open ? 1 : 0);
  const [x, y, z] = panel.position;
  const sign = panel.hingeSide === 'right' ? 1 : -1;
  const half = panel.lengthMm / 2;
  const hingeX = panel.hingeSide === 'right' ? x + half : x - half;
  const backZ = z - panel.thicknessMm / 2;

  useFrame((_, dt) => {
    const target = open ? 1 : 0;
    const p = progress.current;
    if (p !== target) {
      const step = Math.min(dt, 0.1) / DOOR_ANIM_SECONDS;
      progress.current = target > p ? Math.min(1, p + step) : Math.max(0, p - step);
    }
    if (pivot.current) {
      pivot.current.rotation.y = sign * DOOR_OPEN_DEG * DEG * easeInOut(progress.current);
    }
  });

  return (
    <group ref={pivot} position={[hingeX, y, backZ]}>
      <Board panel={panel} position={[-sign * half, 0, panel.thicknessMm / 2]} />
    </group>
  );
}

/** Hanging rail: a metal cylinder along X. */
function RailMesh({ rail }: { rail: Rail }) {
  return (
    <mesh position={rail.position} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[rail.diameterMm / 2, rail.diameterMm / 2, rail.lengthMm, 24]} />
      <meshStandardMaterial color="#b9bdc4" metalness={0.75} roughness={0.3} />
    </mesh>
  );
}

/** Renders panels and rails in product millimetre coordinates (parent group scales to metres). */
export function Wardrobe3D({
  panels,
  rails = [],
  doorsOpen,
}: {
  panels: Panel[];
  rails?: Rail[];
  doorsOpen: boolean;
}) {
  return (
    <>
      {rails.map((r) => (
        <RailMesh key={`${r.id}:${r.lengthMm}:${r.position.join(',')}`} rail={r} />
      ))}
      {panels.map((p) => {
        // Re-mount on size/material change so geometry and edges are rebuilt together.
        const key = `${p.id}:${p.lengthMm}:${p.widthMm}:${p.thicknessMm}:${p.material}`;
        return p.role === 'door' ? (
          <DoorLeaf key={key} panel={p} open={doorsOpen} />
        ) : (
          <Board key={key} panel={p} position={p.position} />
        );
      })}
    </>
  );
}
