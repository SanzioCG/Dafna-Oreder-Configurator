import { getMaterial } from './catalog.js';
import { makeIssue, resolveParams } from './params.js';
import { ROT_FLAT, ROT_FRONT, ROT_SIDE, half, metalBox, part } from './parts.js';
import { registerGenerator } from './registry.js';
import { getNumberConstant, getStringConstant } from './template.js';
import type {
  Dimensions,
  DrawerSummary,
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
