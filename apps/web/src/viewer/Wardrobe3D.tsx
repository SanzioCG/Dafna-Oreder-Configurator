import type { Panel } from '@dafna/engine';
import { Edges } from '@react-three/drei';
import { edgeColorFor, materialFor } from './materials';

const DEG = Math.PI / 180;

/** One engine panel as a box. Engine local frame: length X, thickness Y, width Z (mm). */
function PanelMesh({ panel }: { panel: Panel }) {
  const [x, y, z] = panel.position;
  const [rx, ry, rz] = panel.rotation;
  return (
    <mesh
      position={[x, y, z]}
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

/** Renders panels in product millimetre coordinates (parent group scales to metres). */
export function Wardrobe3D({ panels }: { panels: Panel[] }) {
  return (
    <>
      {panels.map((p) => (
        // Re-mount on size/material change so geometry and edges are rebuilt together.
        <PanelMesh
          key={`${p.id}:${p.lengthMm}:${p.widthMm}:${p.thicknessMm}:${p.material}`}
          panel={p}
        />
      ))}
    </>
  );
}
