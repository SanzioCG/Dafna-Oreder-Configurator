import { allMaterials, getMaterial } from './catalog.js';
import type { GenerateResult, MaterialCatalog, Panel } from './types.js';

/**
 * D-48 raskroy: how many whole sheets each board of a product takes. A guillotine cut (a panel
 * saw only cuts straight through), parts in decreasing size, best-fit into the free rectangles,
 * each cut taking the saw kerf, the sheet's factory edge trimmed. Grain: a wood decor keeps its
 * grain along the sheet's length (a part with grain along its length lies along it, "width"
 * parts turn 90°); plain colours and HDF may turn either way. This is an estimate for one
 * product on fresh sheets - the workshop's cutting program (GibLab) still makes the real map.
 */
export interface SheetSize {
  lengthMm: number;
  widthMm: number;
}

/** Dafna's usual sheets (Bazis files: ЛДСП / ХДФ 2800 × 2070) */
export const DEFAULT_SHEET: SheetSize = { lengthMm: 2800, widthMm: 2070 };
/** saw cut and the trimmed factory edge on each side (mm) */
export const DEFAULT_KERF_MM = 4;
export const DEFAULT_TRIM_MM = 10;

export interface NestPart {
  id: string;
  /** along the grain when `turn` is false */
  lengthMm: number;
  widthMm: number;
  /** may be turned 90° on the sheet (no visible grain) */
  turn: boolean;
}

export interface PlacedPart {
  id: string;
  /** from the trimmed corner of the sheet, along its length / width */
  x: number;
  y: number;
  /** as laid on the sheet (x extent, y extent) */
  lengthMm: number;
  widthMm: number;
  turned: boolean;
}

export interface NestResult {
  sheet: SheetSize;
  sheets: PlacedPart[][];
  /** parts larger than the sheet (never placed; the UI names them) */
  tooLarge: string[];
  partsAreaM2: number;
  sheetsAreaM2: number;
  /** parts area / area of the sheets taken (0..1) */
  utilization: number;
  /** how much of the last sheet is used (0..1): an offcut the workshop may keep */
  lastSheetUse: number;
}

interface Free {
  x: number;
  y: number;
  w: number;
  h: number;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function nestParts(
  parts: NestPart[],
  sheet: SheetSize = DEFAULT_SHEET,
  kerfMm = DEFAULT_KERF_MM,
  trimMm = DEFAULT_TRIM_MM,
): NestResult {
  // usable area; one kerf more so the last part may touch the trimmed edge
  const W = sheet.lengthMm - 2 * trimMm + kerfMm;
  const H = sheet.widthMm - 2 * trimMm + kerfMm;
  const fits = (l: number, w: number) => l + kerfMm <= W && w + kerfMm <= H;
  const tooLarge: string[] = [];
  const todo = parts
    .filter((p) => {
      const ok = fits(p.lengthMm, p.widthMm) || (p.turn && fits(p.widthMm, p.lengthMm));
      if (!ok) tooLarge.push(p.id);
      return ok;
    })
    // biggest first (area, then the longer side): the classic first-fit-decreasing order
    .sort(
      (a, b) =>
        b.lengthMm * b.widthMm - a.lengthMm * a.widthMm ||
        Math.max(b.lengthMm, b.widthMm) - Math.max(a.lengthMm, a.widthMm) ||
        a.id.localeCompare(b.id),
    );

  const sheets: { free: Free[]; placed: PlacedPart[] }[] = [];
  for (const p of todo) {
    const ways: [number, number, boolean][] = [[p.lengthMm, p.widthMm, false]];
    if (p.turn && p.lengthMm !== p.widthMm) ways.push([p.widthMm, p.lengthMm, true]);
    type Pick = { s: number; f: number; l: number; w: number; turned: boolean; score: number };
    let best: Pick | null = null;
    // first sheet that takes it; on that sheet the best-fitting free rectangle
    for (let s = 0; s < sheets.length && best === null; s++) {
      const free = sheets[s]!.free;
      for (let f = 0; f < free.length; f++) {
        const fr = free[f]!;
        for (const [l, w, turned] of ways) {
          if (l + kerfMm > fr.w || w + kerfMm > fr.h) continue;
          // best area fit, then the shorter leftover side
          const score =
            fr.w * fr.h -
            (l + kerfMm) * (w + kerfMm) +
            Math.min(fr.w - l - kerfMm, fr.h - w - kerfMm) / 1e6;
          if (best === null || score < best.score) best = { s, f, l, w, turned, score };
        }
      }
    }
    if (best === null) {
      sheets.push({ free: [{ x: 0, y: 0, w: W, h: H }], placed: [] });
      const [l, w, turned] = ways.find(([l, w]) => l + kerfMm <= W && w + kerfMm <= H) ?? ways[0]!;
      best = { s: sheets.length - 1, f: 0, l, w, turned, score: 0 };
    }
    const { s, f, l, w, turned } = best;
    const sh = sheets[s]!;
    const fr = sh.free[f]!;
    sh.placed.push({ id: p.id, x: fr.x, y: fr.y, lengthMm: l, widthMm: w, turned });
    // guillotine split along the shorter leftover (keeps the bigger offcut whole)
    const cl = l + kerfMm;
    const cw = w + kerfMm;
    const right = fr.w - cl;
    const top = fr.h - cw;
    const pieces: Free[] =
      right < top
        ? [
            { x: fr.x + cl, y: fr.y, w: right, h: cw },
            { x: fr.x, y: fr.y + cw, w: fr.w, h: top },
          ]
        : [
            { x: fr.x + cl, y: fr.y, w: right, h: fr.h },
            { x: fr.x, y: fr.y + cw, w: cl, h: top },
          ];
    sh.free.splice(f, 1, ...pieces.filter((r) => r.w > kerfMm && r.h > kerfMm));
  }

  const area = (ps: PlacedPart[]) => ps.reduce((a, p) => a + p.lengthMm * p.widthMm, 0) / 1e6;
  const sheetM2 = (sheet.lengthMm * sheet.widthMm) / 1e6;
  const partsAreaM2 = sheets.reduce((a, s) => a + area(s.placed), 0);
  const sheetsAreaM2 = sheets.length * sheetM2;
  return {
    sheet,
    sheets: sheets.map((s) => s.placed),
    tooLarge,
    partsAreaM2: r3(partsAreaM2),
    sheetsAreaM2: r3(sheetsAreaM2),
    utilization: sheetsAreaM2 > 0 ? r3(partsAreaM2 / sheetsAreaM2) : 0,
    lastSheetUse: sheets.length ? r3(area(sheets.at(-1)!.placed) / sheetM2) : 0,
  };
}

/** a panel as a part to cut (its grain decides whether it may turn) */
export function panelPart(p: Panel, catalog: MaterialCatalog = allMaterials): NestPart {
  const m = getMaterial(catalog, p.material);
  const plain = !p.grainDirection || m?.group === 'plain' || m?.kind === 'hdf';
  // a "width" grain runs along the panel's width: that side goes along the sheet
  return p.grainDirection === 'width' && !plain
    ? { id: p.id, lengthMm: p.widthMm, widthMm: p.lengthMm, turn: false }
    : { id: p.id, lengthMm: p.lengthMm, widthMm: p.widthMm, turn: plain };
}

export interface BoardSheets {
  material: string;
  nest: NestResult;
}

/**
 * Every board of a product nested per material (the metal frame is bought, not cut). `sheetOf`
 * gives a material's sheet (the manager's sheet size; DEFAULT_SHEET when unknown).
 */
export function nestBoards(
  result: Pick<GenerateResult, 'panels'>,
  sheetOf: (material: string) => SheetSize = () => DEFAULT_SHEET,
  catalog: MaterialCatalog = allMaterials,
): BoardSheets[] {
  const by = new Map<string, NestPart[]>();
  for (const p of result.panels) {
    if (p.role === 'frame') continue;
    const list = by.get(p.material) ?? [];
    list.push(panelPart(p, catalog));
    by.set(p.material, list);
  }
  return [...by].map(([material, parts]) => ({
    material,
    nest: nestParts(parts, sheetOf(material)),
  }));
}
