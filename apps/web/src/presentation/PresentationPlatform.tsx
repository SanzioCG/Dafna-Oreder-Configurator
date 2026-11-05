import { useEffect, useMemo } from 'react';
import { CanvasTexture, Color } from 'three';
import { cssToken } from '../theme/cssToken';

/**
 * Presentation platform (D-4): a minimal round disc the wardrobe stands on, with a restrained
 * cyan glow on its rim and a soft cyan halo on the floor around it. Everything here is UNLIT
 * (MeshBasicMaterial) and adds no light source, so the wardrobe keeps its neutral white
 * lighting and the decor colours do not shift. It is static (outside the turntable), so it
 * never visually slides while the wardrobe turns.
 */
export function PresentationPlatform({ widthM, depthM }: { widthM: number; depthM: number }) {
  const radius = Math.hypot(widthM, depthM) / 2 + 0.12;
  const disc = cssToken('--platform', '#ffffff');
  const glow = cssToken('--platform-glow', '#009fe3');

  const halo = useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(
        size / 2,
        size / 2,
        size * 0.3,
        size / 2,
        size / 2,
        size / 2,
      );
      const c = new Color(glow);
      const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
      g.addColorStop(0, `rgba(${rgb}, 0.16)`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    return new CanvasTexture(canvas);
  }, [glow]);
  useEffect(() => () => halo.dispose(), [halo]);

  return (
    <group>
      {/* disc: top face at the floor (y = 0), 2 cm thick */}
      <mesh position={[0, -0.01, 0]} receiveShadow>
        <cylinderGeometry args={[radius, radius, 0.02, 96]} />
        <meshStandardMaterial color={disc} roughness={0.9} metalness={0} />
      </mesh>
      {/* restrained cyan rim (unlit) */}
      <mesh position={[0, -0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.012, radius, 128]} />
        <meshBasicMaterial color={glow} toneMapped={false} />
      </mesh>
      {/* soft cyan halo on the floor around the disc (unlit, transparent) */}
      <mesh position={[0, -0.021, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[radius * 2.5, radius * 2.5]} />
        <meshBasicMaterial map={halo} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
