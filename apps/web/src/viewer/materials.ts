import { getMaterial } from '@dafna/engine';
import { Color, MeshStandardMaterial, SRGBColorSpace, TextureLoader } from 'three';
import { CATALOG } from '../state/useConfigurator';

/**
 * Catalog material id -> shared Three.js material. Today only `colorHex` is used; when the
 * catalog gets a `textureUrl`, the texture is loaded into `map` here and every panel using
 * that decor picks it up — no viewer changes needed.
 */
const cache = new Map<string, MeshStandardMaterial>();
const loader = new TextureLoader();

export function materialFor(id: string): MeshStandardMaterial {
  const hit = cache.get(id);
  if (hit) return hit;
  const m = getMaterial(CATALOG, id);
  const mat = new MeshStandardMaterial({
    color: new Color(m?.colorHex ?? '#ffffff'),
    roughness: 0.8,
    metalness: 0,
  });
  if (m?.textureUrl) {
    loader.load(m.textureUrl, (tex) => {
      tex.colorSpace = SRGBColorSpace;
      mat.map = tex;
      mat.color.set('#ffffff');
      mat.needsUpdate = true;
    });
  }
  cache.set(id, mat);
  return mat;
}

/**
 * Edge outline colour: dark on light decors (white, grey, beige, oak) so panels, door leaves
 * and the 3 mm gaps stay distinguishable on the light page background; light on dark decors.
 */
export function edgeColorFor(id: string): string {
  const hex = getMaterial(CATALOG, id)?.colorHex ?? '#ffffff';
  const c = new Color(hex);
  const luminance = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return luminance < 0.35 ? '#b4b8be' : '#33363b';
}
