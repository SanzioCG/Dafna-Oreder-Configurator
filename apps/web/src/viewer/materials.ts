import { getMaterial, textureFor } from '@dafna/engine';
import {
  Color,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';
import { CATALOG } from '../state/useConfigurator';
import { cssToken } from '../theme/cssToken';

/**
 * Catalog material id -> Three.js material. Plain decors share one material per id (colour).
 * D-21: a decor with a photo (uploaded on the manager page) gets the photo on every board,
 * tiled at true scale: the photo shows widthMm × heightMm of board, laid along the board's
 * length (the grain runs along the length). One material per board size, sharing the image.
 */
const cache = new Map<string, MeshStandardMaterial>();
const loader = new TextureLoader();

interface Photo {
  base: Texture;
  loaded: boolean;
  /** every texture made from this photo: refreshed when the image arrives */
  users: Texture[];
}
const photos = new Map<string, Photo>();

function photo(url: string): Photo {
  const hit = photos.get(url);
  if (hit) return hit;
  const entry: Photo = { base: undefined as unknown as Texture, loaded: false, users: [] };
  entry.base = loader.load(url, () => {
    entry.loaded = true;
    for (const t of entry.users) t.needsUpdate = true;
  });
  photos.set(url, entry);
  return entry;
}

export function materialFor(id: string, lengthMm = 1000, widthMm = 1000): MeshStandardMaterial {
  const tex = textureFor(id);
  const key = tex
    ? `${id}|${tex.url}|${tex.widthMm}x${tex.heightMm}|${Math.round(lengthMm)}x${Math.round(widthMm)}`
    : id;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = getMaterial(CATALOG, id);
  const mat = new MeshStandardMaterial({
    color: new Color(tex ? '#ffffff' : (m?.colorHex ?? '#ffffff')),
    roughness: 0.8,
    metalness: 0,
  });
  if (tex) {
    const src = photo(tex.url);
    const map = src.base.clone();
    map.colorSpace = SRGBColorSpace;
    map.wrapS = RepeatWrapping;
    map.wrapT = RepeatWrapping;
    map.repeat.set(lengthMm / tex.widthMm, widthMm / tex.heightMm);
    if (src.loaded) map.needsUpdate = true;
    src.users.push(map);
    mat.map = map;
  } else if (m?.textureUrl) {
    loader.load(m.textureUrl, (t) => {
      t.colorSpace = SRGBColorSpace;
      mat.map = t;
      mat.color.set('#ffffff');
      mat.needsUpdate = true;
    });
  }
  cache.set(key, mat);
  return mat;
}

/**
 * Edge outline colour: always dark (founder's call, D-14): black on light decors (white, grey,
 * beige, oak), near-black on dark decors (a line darker than the board itself), in both
 * themes. Theme tokens --edge-on-light-decor / --edge-on-dark-decor.
 * Read at render time, so a theme switch re-colours them on the next render.
 */
export function edgeColorFor(id: string): string {
  const hex = getMaterial(CATALOG, id)?.colorHex ?? '#ffffff';
  const c = new Color(hex);
  const luminance = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return luminance < 0.35
    ? cssToken('--edge-on-dark-decor', '#16181c')
    : cssToken('--edge-on-light-decor', '#000000');
}
