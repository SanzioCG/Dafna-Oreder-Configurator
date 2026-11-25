import { getMaterial } from './catalog.js';
import { makeIssue, resolveParams } from './params.js';
import { ROT_FLAT, ROT_FRONT, ROT_SIDE, half, metalBox, part } from './parts.js';
import { registerGenerator } from './registry.js';
import { getNumberConstant, getStringConstant } from './template.js';
import type {
  Dimensions,
  DrawerSummary,
  EdgeBand,
  GenerateResult,
  Issue,
  MaterialCatalog,
  Panel,
  Params,
  Section,
  Template,
} from './types.js';

export const PEDESTAL_GENERATOR = 'pedestal-v1';
const SAME = 'same_as_corpus';

/**
 * D-8 office pedestal (ofis tumbasi): one carcass under a desk.
 * - carcass: top over the sides (sides from the base to the top), bottom between the sides,
 *   HDF back overlay; base = castors (metal) or a plinth strip between the sides (sides to the
 *   floor, as the wardrobe since ADR-009);
 * - fronts overlay the sides: 3 equal drawers, 2 small drawers + 1 A4 hanging-file drawer, or a
 *   door with a shelf;
 * - drawer boxes: box width = inner width − 2 × slide clearance, slide length from the depth.
 * Functional sizes: under-desk height ≈ 600 (fits a 740 desk, EN 527-1); file drawer inner box
 * >= 330 × 240 for A4 hanging files (manufacturer data, BS EN 14073-2 certified pedestals) —
 * see ADR-014. All construction values are template constants (unconfirmed unless noted).
 */
interface Layout {
  W: number;
  H: number;
  D: number;
  t: number;
  frontT: number;
  backT: number;
  baseH: number;
  base: 'castors' | 'plinth';
  carcassDepth: number;
  corpus: string;
  front: string;
  back: string;
  frontKind: string;
  layout: 'drawers3' | 'drawers2_file' | 'door_shelf';
}

function n(template: Template, name: string) {
  return getNumberConstant(template, name);
}

function materialIssues(template: Template, p: Params, catalog: MaterialCatalog): Issue[] {
  const issues: Issue[] = [];
  for (const def of template.parameters) {
    if (!def.materialKinds) continue;
    const v = p[def.key];
    if (v === SAME) continue;
    const m = getMaterial(catalog, v);
    if (!m || !def.materialKinds.includes(m.kind)) {
      issues.push(makeIssue('MATERIAL_UNKNOWN', 'error', def.key, { material: String(v) }));
    }
  }
  return issues;
}

function layoutOf(template: Template, p: Params, catalog: MaterialCatalog): Layout {
  const corpus = String(p.corpusMaterial);
  const front = p.doorMaterial === SAME ? corpus : String(p.doorMaterial);
  const back = getStringConstant(template, 'backMaterial');
  const t = getMaterial(catalog, corpus)?.thicknessMm ?? 16;
  const frontT = getMaterial(catalog, front)?.thicknessMm ?? t;
  const backT = getMaterial(catalog, back)?.thicknessMm ?? 3;
  const base = p.base === 'plinth' ? 'plinth' : 'castors';
  const baseH = base === 'castors' ? n(template, 'castorHeightMm') : n(template, 'plinthHeightMm');
  const D = Number(p.depth);
  return {
    W: Number(p.width),
    H: Number(p.height),
    D,
    t,
    frontT,
    backT,
    baseH,
    base,
    carcassDepth: D - backT - frontT - n(template, 'frontGapMm'),
    corpus,
    front,
    back,
    frontKind: getMaterial(catalog, front)?.kind ?? 'ldsp',
    layout: (p.layout as Layout['layout']) ?? 'drawers3',
  };
}

/** Front heights (bottom to top) inside the front zone. */
function frontPlan(template: Template, L: Layout): { y: number; h: number }[] {
  const gap = n(template, 'drawerGapMm');
  const edge = n(template, 'frontEdgeGapMm');
  const y0 = L.baseH + edge;
  const y1 = L.H - L.t - edge;
  const zone = y1 - y0;
  if (L.layout === 'door_shelf') return [{ y: y0, h: zone }];
  if (L.layout === 'drawers2_file') {
    // the A4 file drawer keeps its height; the two small drawers share the rest (>= min)
    const smallMin = n(template, 'smallFrontMinHeightMm');
    const small = Math.max(smallMin, (zone - n(template, 'fileFrontHeightMm') - 2 * gap) / 2);
    const file = zone - 2 * small - 2 * gap;
    return [
      { y: y0, h: half(file) },
      { y: half(y0 + file + gap), h: half(small) },
      { y: half(y0 + file + small + 2 * gap), h: half(small) },
    ];
  }
  const h = (zone - 2 * gap) / 3;
  return [0, 1, 2].map((i) => ({ y: half(y0 + i * (h + gap)), h: half(h) }));
}

function slide(template: Template, depthAvailable: number) {
  const step = n(template, 'drawerSlideStepMm');
  const fit = Math.floor(depthAvailable / step) * step;
  return Math.max(n(template, 'drawerSlideMinMm'), Math.min(n(template, 'drawerSlideMaxMm'), fit));
}

function build(template: Template, L: Layout) {
  // D-26 (template 0.5.0+): the mobile pedestal of Dafna's Bazis model
  if (template.constructionRules.some((r) => r.id === 'lester-pedestal')) {
    return buildLester(template, L);
  }
  const band = {
    bandId: getStringConstant(template, 'edgeBandId'),
    thicknessMm: n(template, 'edgeBandThicknessMm'),
  };
  const zBack = L.backT;
  const zFront = zBack + L.carcassDepth;
  const zMid = zBack + L.carcassDepth / 2;
  const innerW = L.W - 2 * L.t;
  const sideY0 = L.base === 'plinth' ? 0 : L.baseH;
  const sideH = L.H - L.t - sideY0;
  // D-23 (template 0.4.0+): the top reaches over the fronts, flush with their face
  const topFlush = template.constructionRules.some((r) => r.id === 'top-flush-with-fronts');
  const topDepth = topFlush
    ? L.carcassDepth + n(template, 'frontGapMm') + L.frontT
    : L.carcassDepth;
  const board = (x: Omit<Parameters<typeof part>[0], 'band' | 'grain'>) =>
    part({ ...x, band, grain: true });
  const panels: Panel[] = [
    board({
      id: 'side-left',
      role: 'side',
      lengthMm: sideH,
      widthMm: L.carcassDepth,
      thicknessMm: L.t,
      material: L.corpus,
      position: [L.t / 2, sideY0 + sideH / 2, zMid],
      rotation: ROT_SIDE,
      banding: 'front',
    }),
    board({
      id: 'side-right',
      role: 'side',
      lengthMm: sideH,
      widthMm: L.carcassDepth,
      thicknessMm: L.t,
      material: L.corpus,
      position: [L.W - L.t / 2, sideY0 + sideH / 2, zMid],
      rotation: ROT_SIDE,
      banding: 'front',
    }),
    board({
      id: 'bottom',
      role: 'bottom',
      lengthMm: innerW,
      widthMm: L.carcassDepth,
      thicknessMm: L.t,
      material: L.corpus,
      position: [L.W / 2, L.baseH + L.t / 2, zMid],
      rotation: ROT_FLAT,
      banding: 'front',
    }),
    board({
      id: 'top',
      role: 'top',
      lengthMm: L.W,
      widthMm: topDepth,
      thicknessMm: L.t,
      material: L.corpus,
      position: [L.W / 2, L.H - L.t / 2, zBack + topDepth / 2],
      rotation: ROT_FLAT,
      banding: 'all',
    }),
    part({
      id: 'back',
      role: 'back',
      lengthMm: L.W,
      widthMm: L.H - sideY0,
      thicknessMm: L.backT,
      material: L.back,
      position: [L.W / 2, sideY0 + (L.H - sideY0) / 2, L.backT / 2],
      rotation: ROT_FRONT,
      banding: 'none',
      band,
      grain: false,
    }),
  ];
  if (L.base === 'plinth') {
    panels.push(
      board({
        id: 'plinth-front',
        role: 'plinth',
        lengthMm: innerW,
        widthMm: L.baseH,
        thicknessMm: L.t,
        material: L.corpus,
        position: [L.W / 2, L.baseH / 2, zFront - L.t / 2],
        rotation: ROT_FRONT,
        banding: 'front',
      }),
    );
  } else {
    const c = n(template, 'castorSizeMm');
    const inset = c / 2 + L.t;
    for (const [i, [x, z]] of [
      [inset, zBack + inset],
      [L.W - inset, zBack + inset],
      [inset, zFront - inset],
      [L.W - inset, zFront - inset],
    ].entries()) {
      panels.push(
        metalBox(
          `castor-${i + 1}`,
          getStringConstant(template, 'castorMaterial'),
          [c, L.baseH, c],
          [x!, L.baseH / 2, z!],
        ),
      );
    }
  }

  // fronts + drawer boxes / door + shelf
  const edgeGap = n(template, 'frontSideGapMm');
  const frontW = L.W - 2 * edgeGap;
  const zFrontFace = zFront + n(template, 'frontGapMm') + L.frontT / 2;
  const fronts = frontPlan(template, L);
  const drawers: DrawerSummary[] = [];
  const clearance = n(template, 'drawerSlideClearanceMm');
  const boxW = innerW - 2 * clearance;
  const depth = slide(template, L.carcassDepth - n(template, 'drawerBackClearanceMm'));
  if (L.layout === 'door_shelf') {
    const f = fronts[0]!;
    panels.push(
      part({
        id: 'door-1',
        role: 'door',
        lengthMm: frontW,
        widthMm: f.h,
        thicknessMm: L.frontT,
        material: L.front,
        position: [L.W / 2, f.y + f.h / 2, zFrontFace],
        rotation: ROT_FRONT,
        banding: 'all',
        band,
        grain: true,
        extra: { sectionIndex: 0, hingeSide: 'left', hingeMount: 'full_overlay' },
      }),
      board({
        id: 's1-shelf-1',
        role: 'shelf',
        lengthMm: innerW,
        widthMm: L.carcassDepth - 4,
        thicknessMm: L.t,
        material: L.corpus,
        position: [L.W / 2, half((L.baseH + L.t + L.H - L.t) / 2), zMid - 2],
        rotation: ROT_FLAT,
        banding: 'front',
      }),
    );
  } else {
    fronts.forEach((f, i) => {
      const id = `s1-drawer-${i + 1}`;
      const boxH = f.h - n(template, 'drawerBoxHeightReductionMm');
      drawers.push({
        id,
        frontYMm: f.y,
        frontHeightMm: f.h,
        frontWidthMm: frontW,
        boxWidthMm: boxW,
        boxDepthMm: depth,
        boxHeightMm: boxH,
      });
      const boxY = f.y + n(template, 'drawerBoxLiftMm') + boxH / 2;
      const zBox = zFront - depth / 2;
      panels.push(
        part({
          id: `${id}-front`,
          role: 'drawer_front',
          lengthMm: frontW,
          widthMm: f.h,
          thicknessMm: L.frontT,
          material: L.front,
          position: [L.W / 2, f.y + f.h / 2, zFrontFace],
          rotation: ROT_FRONT,
          banding: 'all',
          band,
          grain: true,
        }),
        board({
          id: `${id}-side-left`,
          role: 'drawer_side',
          lengthMm: boxH,
          widthMm: depth,
          thicknessMm: L.t,
          material: L.corpus,
          position: [L.t + clearance + L.t / 2, boxY, zBox],
          rotation: ROT_SIDE,
          banding: 'front',
        }),
        board({
          id: `${id}-side-right`,
          role: 'drawer_side',
          lengthMm: boxH,
          widthMm: depth,
          thicknessMm: L.t,
          material: L.corpus,
          position: [L.t + clearance + boxW - L.t / 2, boxY, zBox],
          rotation: ROT_SIDE,
          banding: 'front',
        }),
        board({
          id: `${id}-back`,
          role: 'drawer_back',
          lengthMm: boxW - 2 * L.t,
          widthMm: boxH,
          thicknessMm: L.t,
          material: L.corpus,
          position: [L.W / 2, boxY, zFront - depth + L.t / 2],
          rotation: ROT_FRONT,
          banding: 'none',
        }),
        part({
          id: `${id}-bottom`,
          role: 'drawer_bottom',
          lengthMm: boxW,
          widthMm: depth,
          thicknessMm: L.backT,
          material: L.back,
          position: [L.W / 2, boxY - boxH / 2 - L.backT / 2, zBox],
          rotation: ROT_FLAT,
          banding: 'none',
          band,
          grain: false,
        }),
      );
    });
  }

  const section: Section = {
    index: 0,
    innerWidthMm: innerW,
    innerHeightMm: L.H - L.t - (L.baseH + L.t),
    innerDepthMm: L.carcassDepth,
    xStartMm: L.t,
    doorType: L.layout === 'door_shelf' ? 'single_left' : 'none',
    preset: L.layout === 'door_shelf' ? 'shelves' : 'drawers_shelves',
    presetSource: 'chosen',
    shelves: [],
    rails: [],
    drawers,
    clearHangingHeightMm: null,
  };
  const dimensions: Dimensions = {
    widthMm: L.W,
    heightMm: L.H,
    depthMm: L.D,
    carcassHeightMm: sideH,
    carcassDepthMm: L.carcassDepth,
    backThicknessMm: L.backT,
    doorThicknessMm: L.frontT,
    doorGapFrontMm: n(template, 'frontGapMm'),
    plinthHeightMm: L.baseH,
  };
  return { panels, section, dimensions, drawers };
}

/**
 * D-26: the mobile pedestal as in Dafna's Bazis model "Tum mobil" (docs/production/bazis):
 * - top and bottom full size (W x D), the sides between them, sideInsetMm in from the ends and
 *   sideRearInsetMm from the rear; the back is a board of the carcass decor between the sides,
 *   backRearInsetMm from the rear;
 * - the fronts overlay the sides (frontSideInsetMm in from the side's outer face), touch the
 *   sides' front edges, and stand between bottom and top (frontBottomGapMm / frontTopGapMm,
 *   drawerGapMm between them); top and bottom reach frontOverhangMm past the fronts;
 * - drawer boxes: board sides and back, HDF bottom; the front is the box's front wall; box
 *   height drawerBoxHeightMm whatever the front, drawerBoxLiftMm above the front's lower edge;
 *   box width = opening - 2 x slide clearance; box length = the slide;
 * - bands: top / bottom / fronts 1 mm all round, sides 0.6 mm front and back.
 */
function buildLester(template: Template, L: Layout) {
  const thick = {
    bandId: getStringConstant(template, 'edgeBandId'),
    thicknessMm: n(template, 'edgeBandThicknessMm'),
  };
  const mid = {
    bandId: getStringConstant(template, 'edgeBandMidId'),
    thicknessMm: n(template, 'edgeBandMidMm'),
  };
  const none: EdgeBand = { bandId: null, thicknessMm: null };
  const { W, H, D, t, frontT } = L;
  const sideIn = n(template, 'sideInsetMm');
  const sideRear = n(template, 'sideRearInsetMm');
  const backRear = n(template, 'backRearInsetMm');
  const over = n(template, 'frontOverhangMm');
  const frontFace = D - over; // the fronts' face
  const zFront = frontFace - frontT; // the sides' front edge (fronts touch it)
  const sideD = zFront - sideRear;
  const y0 = L.baseH + t; // top face of the bottom
  const y1 = H - t; // underside of the top
  const sideH = y1 - y0;
  const innerW = W - 2 * sideIn - 2 * t;
  const xIn = sideIn + t; // inner face of the left side
  const banded = (b: typeof thick, sides: ('front' | 'back' | 'left' | 'right')[]) => {
    const e = { front: { ...none }, back: { ...none }, left: { ...none }, right: { ...none } };
    for (const k of sides) e[k] = { ...b };
    return e;
  };
  const board = (
    x: Omit<Parameters<typeof part>[0], 'band' | 'grain' | 'banding'>,
    edges: Panel['edges'],
  ): Panel => ({ ...part({ ...x, band: thick, grain: true, banding: 'none' }), edges });
  const all4 = banded(thick, ['front', 'back', 'left', 'right']);

  const panels: Panel[] = [
    board(
      {
        id: 'bottom',
        role: 'bottom',
        lengthMm: W,
        widthMm: D,
        thicknessMm: t,
        material: L.corpus,
        position: [W / 2, L.baseH + t / 2, D / 2],
        rotation: ROT_FLAT,
      },
      all4,
    ),
    board(
      {
        id: 'top',
        role: 'top',
        lengthMm: W,
        widthMm: D,
        thicknessMm: t,
        material: L.corpus,
        position: [W / 2, H - t / 2, D / 2],
        rotation: ROT_FLAT,
      },
      all4,
    ),
    ...(['left', 'right'] as const).map((s) =>
      board(
        {
          id: `side-${s}`,
          role: 'side',
          lengthMm: sideH,
          widthMm: sideD,
          thicknessMm: t,
          material: L.corpus,
          position: [
            s === 'left' ? sideIn + t / 2 : W - sideIn - t / 2,
            y0 + sideH / 2,
            sideRear + sideD / 2,
          ],
          rotation: ROT_SIDE,
        },
        banded(mid, ['front', 'back']),
      ),
    ),
    board(
      {
        id: 'back',
        role: 'back',
        lengthMm: innerW,
        widthMm: sideH,
        thicknessMm: t,
        material: L.corpus,
        position: [W / 2, y0 + sideH / 2, backRear + t / 2],
        rotation: ROT_FRONT,
      },
      banded(thick, []),
    ),
  ];
  if (L.base === 'plinth') {
    for (const [id, z] of [
      ['plinth-front', zFront - 20 - t / 2],
      ['plinth-back', sideRear + t / 2],
    ] as const) {
      panels.push(
        board(
          {
            id,
            role: 'plinth',
            lengthMm: innerW,
            widthMm: L.baseH,
            thicknessMm: t,
            material: L.corpus,
            position: [W / 2, L.baseH / 2, z],
            rotation: ROT_FRONT,
          },
          id === 'plinth-front' ? banded(mid, ['front']) : banded(thick, []),
        ),
      );
    }
  } else {
    const c = n(template, 'castorSizeMm');
    const inset = n(template, 'castorInsetMm');
    for (const [i, [x, z]] of [
      [inset, inset],
      [W - inset, inset],
      [inset, D - inset],
      [W - inset, D - inset],
    ].entries()) {
      panels.push(
        metalBox(
          `castor-${i + 1}`,
          getStringConstant(template, 'castorMaterial'),
          [c, L.baseH, c],
          [x!, L.baseH / 2, z!],
        ),
      );
    }
  }

  // fronts between bottom and top
  const frontW = W - 2 * (sideIn + n(template, 'frontSideInsetMm'));
  const fy0 = y0 + n(template, 'frontBottomGapMm');
  const fy1 = y1 - n(template, 'frontTopGapMm');
  const gap = n(template, 'drawerGapMm');
  const zFrontC = frontFace - frontT / 2;
  const drawers: DrawerSummary[] = [];
  if (L.layout === 'door_shelf') {
    panels.push(
      board(
        {
          id: 'door-1',
          role: 'door',
          lengthMm: frontW,
          widthMm: fy1 - fy0,
          thicknessMm: frontT,
          material: L.front,
          position: [W / 2, (fy0 + fy1) / 2, zFrontC],
          rotation: ROT_FRONT,
          extra: { sectionIndex: 0, hingeSide: 'left', hingeMount: 'full_overlay' },
        },
        all4,
      ),
      board(
        {
          id: 's1-shelf-1',
          role: 'shelf',
          lengthMm: innerW,
          widthMm: zFront - 1 - (backRear + t),
          thicknessMm: t,
          material: L.corpus,
          position: [W / 2, half((y0 + y1) / 2), (backRear + t + zFront - 1) / 2],
          rotation: ROT_FLAT,
        },
        banded(mid, ['front']),
      ),
    );
  } else {
    const h = (fy1 - fy0 - 2 * gap) / 3;
    const clearance = n(template, 'drawerSlideClearanceMm');
    const boxW = innerW - 2 * clearance;
    const boxH = n(template, 'drawerBoxHeightMm');
    const len = slide(template, zFront - (backRear + t) - n(template, 'drawerBackClearanceMm'));
    const hdf = L.backT;
    // D-51 (template 0.7.0+, rule drawer-bottom-in-grooves, Bazis "Tum mobil" 348 x 457): the
    // bottom sits in the sides' grooves above their lower edge and runs into the front's groove;
    // the back stands on it, 2 mm from the box's rear. Before: flat under the box, box-long.
    const grooved = template.constructionRules.some((r) => r.id === 'drawer-bottom-in-grooves');
    const bottom = grooved
      ? {
          upMm: n(template, 'drawerBottomUpMm'),
          depthMm: len - n(template, 'drawerBottomRearGapMm') + n(template, 'drawerBottomGrooveMm'),
          zMm:
            zFront +
            (n(template, 'drawerBottomGrooveMm') - len + n(template, 'drawerBottomRearGapMm')) / 2,
        }
      : { upMm: 0, depthMm: len, zMm: zFront - len / 2 };
    [0, 1, 2].forEach((i) => {
      const id = `s1-drawer-${i + 1}`;
      const fy = half(fy0 + i * (h + gap));
      const fh = half(h);
      drawers.push({
        id,
        frontYMm: fy,
        frontHeightMm: fh,
        frontWidthMm: frontW,
        boxWidthMm: boxW,
        boxDepthMm: len,
        boxHeightMm: boxH,
      });
      const by = fy + n(template, 'drawerBoxLiftMm') + boxH / 2;
      const zBox = zFront - len / 2;
      panels.push(
        board(
          {
            id: `${id}-front`,
            role: 'drawer_front',
            lengthMm: frontW,
            widthMm: fh,
            thicknessMm: frontT,
            material: L.front,
            position: [W / 2, fy + fh / 2, zFrontC],
            rotation: ROT_FRONT,
          },
          all4,
        ),
        ...(['left', 'right'] as const).map((s) =>
          board(
            {
              id: `${id}-side-${s}`,
              role: 'drawer_side',
              lengthMm: boxH,
              widthMm: len,
              thicknessMm: t,
              material: L.corpus,
              position: [
                s === 'left' ? xIn + clearance + t / 2 : xIn + clearance + boxW - t / 2,
                by,
                zBox,
              ],
              rotation: ROT_SIDE,
            },
            banded(mid, ['front', 'back']),
          ),
        ),
        board(
          {
            id: `${id}-back`,
            role: 'drawer_back',
            lengthMm: boxW - 2 * t,
            widthMm: boxH - n(template, 'drawerBackLowerMm'),
            thicknessMm: t,
            material: L.corpus,
            position: [W / 2, by + n(template, 'drawerBackLowerMm') / 2, zFront - len + t / 2],
            rotation: ROT_FRONT,
          },
          banded(mid, ['front']),
        ),
        {
          ...part({
            id: `${id}-bottom`,
            role: 'drawer_bottom',
            lengthMm: boxW - 2 * t + 2 * n(template, 'drawerBottomGrooveMm'),
            widthMm: bottom.depthMm,
            thicknessMm: hdf,
            material: L.back,
            position: [W / 2, by - boxH / 2 + bottom.upMm + hdf / 2, bottom.zMm],
            rotation: ROT_FLAT,
            banding: 'none',
            band: thick,
            grain: false,
          }),
        },
      );
    });
  }

  const section: Section = {
    index: 0,
    innerWidthMm: innerW,
    innerHeightMm: sideH,
    innerDepthMm: zFront - (backRear + t),
    xStartMm: xIn,
    doorType: L.layout === 'door_shelf' ? 'single_left' : 'none',
    preset: L.layout === 'door_shelf' ? 'shelves' : 'drawers_shelves',
    presetSource: 'chosen',
    shelves: [],
    rails: [],
    drawers,
    clearHangingHeightMm: null,
  };
  const dimensions: Dimensions = {
    widthMm: W,
    heightMm: H,
    depthMm: D,
    carcassHeightMm: sideH,
    carcassDepthMm: sideD,
    backThicknessMm: t,
    doorThicknessMm: frontT,
    doorGapFrontMm: 0,
    plinthHeightMm: L.baseH,
  };
  return { panels, section, dimensions, drawers };
}

function validatePedestal(params: unknown, template: Template, catalog: MaterialCatalog): Issue[] {
  const resolved = resolveParams(template, params);
  if (resolved.issues.some((i) => i.severity === 'error')) return resolved.issues;
  const mat = materialIssues(template, resolved.params, catalog);
  if (mat.length > 0) return [...resolved.issues, ...mat];
  const L = layoutOf(template, resolved.params, catalog);
  const issues = [...resolved.issues];
  const { drawers } = build(template, L);
  // A4 hanging files need a box of at least 330 × 240 inside (manufacturer data, ADR-014)
  if (L.layout === 'drawers2_file') {
    const file = drawers[0];
    const minW = n(template, 'fileDrawerMinBoxWidthMm');
    const minH = n(template, 'fileDrawerMinBoxHeightMm');
    if (file && (file.boxWidthMm - 2 * L.t < minW || file.boxHeightMm < minH)) {
      issues.push(
        makeIssue('FILE_DRAWER_TOO_SMALL', 'warning', 'layout', {
          boxWidthMm: file.boxWidthMm - 2 * L.t,
          boxHeightMm: file.boxHeightMm,
          minWidthMm: minW,
          minHeightMm: minH,
        }),
      );
    }
  }
  const maxUnder = n(template, 'underDeskMaxHeightMm');
  if (L.H > maxUnder) {
    issues.push(
      makeIssue('PEDESTAL_TOO_HIGH', 'warning', 'height', { heightMm: L.H, maxMm: maxUnder }),
    );
  }
  return issues;
}

function generatePedestal(
  template: Template,
  params: unknown,
  catalog: MaterialCatalog,
): GenerateResult {
  const issues = validatePedestal(params, template, catalog);
  if (issues.some((i) => i.severity === 'error')) {
    return { panels: [], rails: [], sections: [], issues, dimensions: null };
  }
  const { params: p } = resolveParams(template, params);
  const L = layoutOf(template, p, catalog);
  const { panels, section, dimensions } = build(template, L);
  return { panels, rails: [], sections: [section], issues, dimensions };
}

registerGenerator(PEDESTAL_GENERATOR, { validate: validatePedestal, generate: generatePedestal });
