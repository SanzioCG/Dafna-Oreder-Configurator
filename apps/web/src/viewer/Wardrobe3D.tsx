import type { Panel } from '@dafna/engine';
import { Edges } from '@react-three/drei';

const DEG = Math.PI / 180;

/** One engine panel as a box. Engine local frame: length X, thickness Y, width Z (mm). */
function PanelMesh({ panel }: { panel: Panel }) {
  const [x, y, z] = panel.position;
  const [rx, ry, rz] = panel.rotation;
  return (
    <mesh position={[x, y, z]} rotation={[rx * DEG, ry * DEG, rz * DEG]} castShadow receiveShadow>
      <boxGeometry args={[panel.lengthMm, panel.thicknessMm, panel.widthMm]} />
      <meshStandardMaterial
        color={panel.role === 'back' ? '#ecebe7' : '#fbfbf9'}
        roughness={0.85}
        metalness={0}
      />
      <Edges color="#5f6672" threshold={15} />
    </mesh>
  );
}

/** Renders panels in product millimetre coordinates (parent group scales to metres). */
export function Wardrobe3D({ panels }: { panels: Panel[] }) {
  return (
    <>
      {panels.map((p) => (
        // Re-mount on size change so geometry and edges are rebuilt together.
        <PanelMesh key={`${p.id}:${p.lengthMm}:${p.widthMm}:${p.thicknessMm}`} panel={p} />
      ))}
    </>
  );
}
