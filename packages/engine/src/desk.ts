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
  const under = H - tt; // underside of the work top
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
      banding: 'all',
      band,
      grain: true,
    }),
  ];
  if (legs === 'ldsp') {
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
