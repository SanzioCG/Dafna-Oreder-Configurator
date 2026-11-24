import { getMaterial } from './catalog.js';
import { makeIssue, resolveParams } from './params.js';
import { ROT_FLAT, ROT_FRONT, ROT_SIDE, metalBox, part } from './parts.js';
import { registerGenerator } from './registry.js';
import { getNumberConstant, getStringConstant } from './template.js';
import type {
  Dimensions,
  GenerateResult,
  Issue,
  MaterialCatalog,
  Panel,
  Params,
  Template,
} from './types.js';

export const DESK_GENERATOR = 'desk-v1';

/**
 * D-8 office / writing desk (stol): a work top on
 * - `ldsp`: two LDSP side leg panels + a modesty panel between them (Dafna-made), or
 * - `metal`: a purchased powder-coated steel T-frame (feet, columns, top arms, cross beam), or
 * - `metal_lift`: a purchased electric height-adjustable frame (same parts, telescopic columns).
 * Work-top height 740 mm = EN 527-1 fixed-height desks (740 ± 20); work surface >= 800 × 500
 * (GOST 13025.3-85). The metal frame is drawn as simple boxes; it is a bought part, not cut from
 * board (role 'frame', no edges, no grain). Values beyond the standards are template constants,
 * unconfirmed (ADR-014).
 */
type Legs = 'ldsp' | 'metal' | 'metal_lift';

function n(template: Template, name: string) {
  return getNumberConstant(template, name);
}

function materialIssues(template: Template, p: Params, catalog: MaterialCatalog): Issue[] {
  const issues: Issue[] = [];
  for (const def of template.parameters) {
    if (!def.materialKinds) continue;
    const m = getMaterial(catalog, p[def.key]);
    if (!m || !def.materialKinds.includes(m.kind)) {
      issues.push(
        makeIssue('MATERIAL_UNKNOWN', 'error', def.key, { material: String(p[def.key]) }),
      );
    }
  }
  return issues;
}

function build(template: Template, p: Params, catalog: MaterialCatalog) {
  const W = Number(p.width);
  const D = Number(p.depth);
  const H = Number(p.height);
  const legs = (p.legs as Legs) ?? 'ldsp';
  const top = String(p.topMaterial);
  const corpus = String(p.corpusMaterial);
  const frame = String(p.frameColor);
  const tt = getMaterial(catalog, top)?.thicknessMm ?? 22;
  const t = getMaterial(catalog, corpus)?.thicknessMm ?? 16;
  const band = {
    bandId: getStringConstant(template, 'edgeBandId'),
    thicknessMm: n(template, 'edgeBandThicknessMm'),
  };
  // D-22 (template 0.3.0+): the top board is doubled underneath with a frame of strips
  const strip =
    template.constants.worktopFrameStripMm !== undefined ? n(template, 'worktopFrameStripMm') : 0;
  // D-26 (template 0.4.0+, Dafna's Bazis model "stol 1500"): a full second sheet under the top
  const lester = template.constructionRules.some((r) => r.id === 'lester-desk');
  const under = H - tt - (strip > 0 || lester ? tt : 0); // underside of the work top
  const panels: Panel[] = [
    part({
      id: 'worktop',
      role: 'worktop',
      lengthMm: W,
      widthMm: D,
      thicknessMm: tt,
      material: top,
      position: [W / 2, H - tt / 2, D / 2],
      rotation: ROT_FLAT,
      // D-26: the band over both layers sits on the lower sheet
      banding: lester ? 'none' : 'all',
      band,
      grain: true,
    }),
  ];
  if (lester) {
    panels.push(
      part({
        id: 'worktop-under',
        role: 'worktop',
        lengthMm: W,
        widthMm: D,
        thicknessMm: tt,
        material: top,
        position: [W / 2, H - tt - tt / 2, D / 2],
        rotation: ROT_FLAT,
        banding: 'all',
        band,
        grain: true,
      }),
    );
  }
  if (strip > 0) {
    // one band over both layers is on the top board; the strips themselves are not banded
    const y = H - tt - tt / 2;
    const frameStrip = (id: string, lengthMm: number, x: number, z: number, side: boolean) =>
      part({
        id,
        role: 'worktop',
        lengthMm,
        widthMm: strip,
        thicknessMm: tt,
        material: top,
        position: [x, y, z],
        rotation: side ? [0, 90, 0] : ROT_FLAT,
        banding: 'none',
        band,
        grain: true,
      });
    panels.push(
      frameStrip('worktop-frame-front', W, W / 2, D - strip / 2, false),
      frameStrip('worktop-frame-back', W, W / 2, strip / 2, false),
      frameStrip('worktop-frame-left', D - 2 * strip, strip / 2, D / 2, true),
      frameStrip('worktop-frame-right', D - 2 * strip, W - strip / 2, D / 2, true),
    );
  }
  if (legs === 'ldsp' && lester) {
    panels.push(...lesterLegs(template, W, D, t, under, corpus));
  } else if (legs === 'ldsp') {
    const inset = n(template, 'legDepthInsetMm');
    const legD = D - 2 * inset;
    for (const [id, x] of [
      ['leg-left', t / 2],
      ['leg-right', W - t / 2],
    ] as const) {
      panels.push(
        part({
          id,
          role: 'leg',
          lengthMm: under,
          widthMm: legD,
          thicknessMm: t,
          material: corpus,
          position: [x, under / 2, D / 2],
          rotation: ROT_SIDE,
          banding: 'front',
          band,
          grain: true,
        }),
      );
    }
    const mh = n(template, 'modestyHeightMm');
    const mz = n(template, 'modestyBackInsetMm');
    panels.push(
      part({
        id: 'modesty',
        role: 'modesty',
        lengthMm: W - 2 * t,
        widthMm: mh,
        thicknessMm: t,
        material: corpus,
        position: [W / 2, under - mh / 2, mz + t / 2],
        rotation: ROT_FRONT,
        banding: 'front',
        band,
        grain: true,
      }),
    );
  } else {
    const lift = legs === 'metal_lift';
    const col = lift ? n(template, 'liftColumnMm') : n(template, 'frameColumnMm');
    const foot = n(template, 'frameFootHeightMm');
    const arm = n(template, 'frameArmHeightMm');
    const endInset = n(template, 'frameEndInsetMm');
    const footD = D - 2 * n(template, 'frameFootInsetMm');
    for (const [side, x] of [
      ['left', endInset],
      ['right', W - endInset],
    ] as const) {
      panels.push(
        metalBox(`frame-foot-${side}`, frame, [col, foot, footD], [x, foot / 2, D / 2]),
        metalBox(
          `frame-column-${side}`,
          frame,
          [col, under - foot - arm, col],
          [x, foot + (under - foot - arm) / 2, D / 2],
        ),
        metalBox(`frame-arm-${side}`, frame, [col, arm, footD], [x, under - arm / 2, D / 2]),
      );
    }
    const beam = n(template, 'frameBeamMm');
    panels.push(
      metalBox(
        'frame-beam',
        frame,
        [W - 2 * endInset - col, beam, beam],
        [W / 2, under - arm - beam / 2, D / 2],
      ),
    );
  }
  const dimensions: Dimensions = {
    widthMm: W,
    heightMm: H,
    depthMm: D,
    carcassHeightMm: under,
    carcassDepthMm: D,
    backThicknessMm: 0,
    doorThicknessMm: 0,
    doorGapFrontMm: 0,
    plinthHeightMm: 0,
  };
  return { panels, dimensions, legs, under };
}

/**
 * D-26: legs and modesty panel as in Dafna's Bazis model: each leg is two boards (outer + a
 * thickening layer, banded front and back over both), legInsetMm in from the ends, front and
 * back, standing on footPadMm pads; the modesty panel is three stepped layers hanging under the
 * top between the legs, the tallest outermost, modestyBackInsetMm from the back edge.
 */
function lesterLegs(
  template: Template,
  W: number,
  D: number,
  t: number,
  under: number,
  corpus: string,
): Panel[] {
  const inset = n(template, 'legDepthInsetMm');
  const pad = n(template, 'footPadMm');
  const thin = {
    bandId: getStringConstant(template, 'edgeBandThinId'),
    thicknessMm: n(template, 'edgeBandThinMm'),
  };
  const legH = under - pad;
  const legD = D - 2 * inset;
  const out: Panel[] = [];
  for (const [side, x0, dir] of [
    ['left', inset, 1],
    ['right', W - inset, -1],
  ] as const) {
    for (const [k, layer] of [
      ['', 0],
      ['-2', 1],
    ] as const) {
      out.push(
        part({
          id: `leg-${side}${k}`,
          role: 'leg',
          lengthMm: legH,
          widthMm: legD,
          thicknessMm: t,
          material: corpus,
          position: [x0 + dir * (layer * t + t / 2), pad + legH / 2, D / 2],
          rotation: ROT_SIDE,
          // the thickening layer carries the band over both boards (front and back)
          banding: layer === 1 ? 'front' : 'none',
          band: layer === 1 ? { ...thin, ...wideBand(template) } : thin,
          grain: true,
          extra:
            layer === 1
              ? {
                  edges: {
                    front: wideBand(template),
                    back: wideBand(template),
                    left: { bandId: null, thicknessMm: null },
                    right: { bandId: null, thicknessMm: null },
                  },
                }
              : {},
        }),
      );
    }
  }
  const x0 = inset + 2 * t;
  const width = W - 2 * x0;
  const back = n(template, 'modestyBackInsetMm');
  // D-36 (template 0.5.0+): as in Bazis - on the front side, the shortest layer outermost
  const front = template.constructionRules.some((r) => r.id === 'desk-modesty-front');
  const layers = 3;
  [
    n(template, 'modestyLayer1Mm'),
    n(template, 'modestyLayer2Mm'),
    n(template, 'modestyLayer3Mm'),
  ].forEach((h, i) =>
    out.push(
      part({
        id: `modesty${i === 0 ? '' : `-${i + 1}`}`,
        role: 'modesty',
        lengthMm: width,
        widthMm: h,
        thicknessMm: t,
        material: corpus,
        position: [
          W / 2,
          under - h / 2,
          front ? D - back - (layers - 1 - i) * t - t / 2 : back + i * t + t / 2,
        ],
        rotation: ROT_FRONT,
        banding: 'front',
        band: thin,
        grain: true,
      }),
    ),
  );
  return out;
}

/** D-26: the 1 mm x 35 mm band that covers two boards */
function wideBand(template: Template) {
  return {
    bandId: getStringConstant(template, 'edgeBandId'),
    thicknessMm: n(template, 'edgeBandThicknessMm'),
  };
}

function validateDesk(params: unknown, template: Template, catalog: MaterialCatalog): Issue[] {
  const resolved = resolveParams(template, params);
  if (resolved.issues.some((i) => i.severity === 'error')) return resolved.issues;
  const mat = materialIssues(template, resolved.params, catalog);
  if (mat.length > 0) return [...resolved.issues, ...mat];
  const issues = [...resolved.issues];
  const p = resolved.params;
  // EN 527-1: fixed-height desks 740 ± 20; only an adjustable frame may be set elsewhere
  const fixedMin = n(template, 'fixedHeightMinMm');
  const fixedMax = n(template, 'fixedHeightMaxMm');
  const H = Number(p.height);
  if (p.legs !== 'metal_lift' && (H < fixedMin || H > fixedMax)) {
    issues.push(
      makeIssue('DESK_HEIGHT_NOT_ERGONOMIC', 'warning', 'height', {
        heightMm: H,
        minMm: fixedMin,
        maxMm: fixedMax,
      }),
    );
  }
  // GOST 13025.3-85: writing-desk work surface at least 800 × 500
  if (
    Number(p.width) < n(template, 'minWorkWidthMm') ||
    Number(p.depth) < n(template, 'minWorkDepthMm')
  ) {
    issues.push(
      makeIssue('DESK_TOO_SMALL', 'warning', 'width', {
        widthMm: Number(p.width),
        depthMm: Number(p.depth),
      }),
    );
  }
  return issues;
}

function generateDesk(
  template: Template,
  params: unknown,
  catalog: MaterialCatalog,
): GenerateResult {
  const issues = validateDesk(params, template, catalog);
  if (issues.some((i) => i.severity === 'error')) {
    return { panels: [], rails: [], sections: [], issues, dimensions: null };
  }
  const { params: p } = resolveParams(template, params);
  const { panels, dimensions } = build(template, p, catalog);
  return { panels, rails: [], sections: [], issues, dimensions };
}

registerGenerator(DESK_GENERATOR, { validate: validateDesk, generate: generateDesk });
