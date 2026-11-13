import type { EdgeBand, Panel, PanelEdges, PanelRole, Vec3 } from './types.js';

/**
 * D-8: small helpers shared by the pedestal and desk generators (the wardrobe keeps its own,
 * frozen code). All boards use the engine's panel frame: length local X, thickness local Y,
 * width local Z; position = centre (mm), rotation = Euler XYZ degrees.
 */
export const ROT_FLAT: Vec3 = [0, 0, 0]; // length X, thickness Y, width Z (tops, bottoms, shelves)
export const ROT_SIDE: Vec3 = [0, 0, 90]; // length Y, thickness X, width Z (sides, legs)
export const ROT_FRONT: Vec3 = [90, 0, 0]; // length X, width Y, thickness Z (backs, fronts, plinth)

const NO_BAND: EdgeBand = { bandId: null, thicknessMm: null };

export interface PartInput {
  id: string;
  role: PanelRole;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  material: string;
  position: Vec3;
  rotation: Vec3;
  /** banded edges: 'all' (fronts), 'front' (visible front edge), 'none' (backs, metal) */
  banding: 'all' | 'front' | 'none';
  band: EdgeBand;
  /** null grain for HDF and metal */
  grain: boolean;
  extra?: Partial<Panel>;
}

export function part(p: PartInput): Panel {
  const b = { ...p.band };
  const edges: PanelEdges =
    p.banding === 'all'
      ? { front: { ...b }, back: { ...b }, left: { ...b }, right: { ...b } }
      : p.banding === 'front'
        ? { front: { ...b }, back: { ...NO_BAND }, left: { ...NO_BAND }, right: { ...NO_BAND } }
        : {
            front: { ...NO_BAND },
            back: { ...NO_BAND },
            left: { ...NO_BAND },
            right: { ...NO_BAND },
          };
  return {
    id: p.id,
    role: p.role,
    lengthMm: p.lengthMm,
    widthMm: p.widthMm,
    thicknessMm: p.thicknessMm,
    material: p.material,
    position: p.position,
    rotation: p.rotation,
    edges,
    grainDirection: p.grain ? 'length' : null,
    operations: [],
    ...p.extra,
  };
}

/** A metal box (frame member, castor): no banding, no grain; sizes along X / Y / Z. */
export function metalBox(id: string, material: string, size: Vec3, centre: Vec3): Panel {
  return part({
    id,
    role: 'frame',
    lengthMm: size[0],
    thicknessMm: size[1],
    widthMm: size[2],
    material,
    position: centre,
    rotation: ROT_FLAT,
    banding: 'none',
    band: NO_BAND,
    grain: false,
  });
}

export const half = (v: number) => Math.round(v * 2) / 2;
