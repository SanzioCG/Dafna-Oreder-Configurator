import { useEffect, useMemo } from 'react';
import { CanvasTexture } from 'three';

const TEX = 256;
const INSET = 48; // px of blur margin on each side of the solid core
const CORE = (TEX - 2 * INSET) / TEX; // fraction of the plane covered by the solid core

/**
 * Soft contact shadow under the product: a blurred rectangle texture on a plane just above the
 * floor. Replaces drei <ContactShadows>, which rendered nothing on the transparent canvas
 * (drei 10.7 / three r187). No floor plane, so no visible floor edge.
 */
export function SoftFloorShadow({
  widthM,
  depthM,
  color,
  opacity = 0.42,
}: {
  widthM: number;
  depthM: number;
  color: string;
  opacity?: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = TEX;
    canvas.height = TEX;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.filter = `blur(${INSET / 2.4}px)`;
      ctx.fillStyle = color;
      ctx.fillRect(INSET, INSET, TEX - 2 * INSET, TEX - 2 * INSET);
    }
    return new CanvasTexture(canvas);
  }, [color]);
  useEffect(() => () => texture.dispose(), [texture]);

  // a little wider than the footprint so the shadow reads as ambient occlusion around the base
  const w = (widthM + 0.08) / CORE;
  const d = (depthM + 0.08) / CORE;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} renderOrder={-1}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
