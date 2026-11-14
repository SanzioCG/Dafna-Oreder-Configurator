import { createHash } from 'node:crypto';
import { allMaterials, getMaterial, type GenerateResult, type Panel } from '@dafna/engine';
import { translate } from '../src/i18n/translate';
import { cutList, orderPdfInput } from './orderPdf';
import type { LeadRecord } from './types';

/**
 * D-16: the GibLab `.project` file for the workshop — cutting (CS) and edge banding (EL), sent
 * to Telegram with every application next to the order PDF. No drilling (XNC) yet: the engine
 * has no machining operations (Panel.operations is empty).
 *
 * The format follows a real shop sample (SmartWOP -> GibLab) whose rules were checked in
 * GibLab: one line of XML, NO XML comment (GibLab refuses a file with one, err=41), goods in
 * the sample's order (product with its parts, tool.cutting, one tool.edgeline per band, one
 * sheet per board with its stock part, one band per edge band), then one CS per sheet and one
 * EL per band. What GibLab computes itself (cut maps, counts, costs) is not written.
 *
 * A part: `l` runs along the grain; a board whose grain runs across its width is written turned
 * (l <-> w). `txt` = the board has a grain. Sizes are the finished sizes (the sample's shop:
 * the edge bander pre-mills, blank = finished size) — ⚠ Dafna to confirm.
 * Edges (engine local frame -> GibLab): left (x = 0) -> ell, right -> elr, back -> elt (y = 0,
 * the top edge on screen), front -> elb; a turned part: back -> ell, front -> elr, left -> elb,
 * right -> elt.
 */

const VERSION = '21052101';

/** The sample's settings (the workshop can change them in GibLab). */
// prettier-ignore
const CUTTING_TOOL: [string, string][] = [
  ['swSawthick', '4.4'], ['swSawthickDiv', '-1'], ['swPackageHeight', '40'], ['swMaxturns', '6'],
  ['swComplexBand', 'true'], ['swTrimIncludeSaw', 'false'], ['swSort', '3'], ['swSortInBand', '3'],
  ['swMinSizeBand', '0'], ['swMaxSizeBand', '0'], ['swMinPruning', '0'], ['swMaxLengthBand', '0'],
];
// prettier-ignore
const EDGELINE_TOOL: [string, string][] = [
  ['elRestSide', '0'], ['elMinSize', '0'], ['elWidthPreJoint', '0'], ['elCost', '0'],
];
// prettier-ignore
const CUTTING: [string, string][] = [
  ['cTrimL', '5'], ['cTrimW', '5'], ['cAllowanceWorkpiece', '0'], ['cMinDimDetail', '45'],
  ['cMaxPartsOnPattern', '0'], ['printable', 'true'], ['startNewPage', 'true'],
  ['cPrefLargePacket', 'false'], ['cCombiningParts', 'false'], ['cGroupParts', '0'],
  ['cCostByItem', 'true'], ['cCostByItemRound', '11'],
];
// prettier-ignore
const CUTTING_TAIL: [string, string][] = [
  ['cCostType', '0'], ['cCostCut', '0'], ['cFillRep', '0.9'], ['cCPF', '0.9'],
  ['cMinDimRegWaste1', '1000'], ['cMinDimRegWaste2', '1000'], ['cBusinessWaste', '0.5'],
  ['cTrimWaste', 'true'], ['cSaveDrawCut', 'false'], ['csDirectCut', '0'], ['csTexture', 'true'],
  ['cSizeMode', '0'],
];
// prettier-ignore
const EDGELINE: [string, string][] = [
  ['elWastePRC', '0'], ['elCalcMat', 'true'], ['elSymbol', 'A'], ['elColor', '#000000'],
  ['elLineMark', '0'], ['elRoundMat', '20'], ['elRoundLength', '20'], ['elMinDimDetail', '0'],
];
const COSTS: [string, string][] = [
  ['costMaterial', '0'],
  ['costOperation', '0'],
  ['costTotal', '0'],
];
/** stock sheets offered for cutting (the sample's count) */
const STOCK_COUNT = '1000';

/**
 * Sheet sizes (l x w, mm) — ⚠ unconfirmed until Dafna's supplier list: EGGER boards and
 * HDF 2800 x 2070, other chipboard 2750 x 1830. The workshop can change them in GibLab.
 */
export function sheetSize(materialId: string): [number, number] {
  const m = getMaterial(allMaterials, materialId);
  if (!m || m.kind !== 'ldsp' || m.code) return [2800, 2070];
  return [2750, 1830];
}

/** Edge band width: the narrowest usual width covering the board + 4 mm (⚠ unconfirmed). */
export function bandWidth(boardMm: number): number {
  return [22, 28, 35, 42].find((w) => w >= boardMm + 4) ?? Math.ceil(boardMm + 6);
}

export function num(v: number): string {
  return String(Math.round(v * 100) / 100);
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const el = (tag: string, attrs: [string, string][], children = '') => {
  const a = attrs.map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  return children ? `<${tag}${a}>${children}</${tag}>` : `<${tag}${a} />`;
};

const t = (key: string) => translate('uz', key);
/** decor names are never translated: the catalog name (uz) and the maker's code */
function decorName(id: string): string {
  const m = getMaterial(allMaterials, id);
  if (!m) return id;
  return m.code ? `${m.code} ${t(m.decorName)}` : t(m.decorName);
}

type GibEdge = 'elb' | 'ell' | 'elr' | 'elt';
const EDGE_ORDER: GibEdge[] = ['elb', 'ell', 'elr', 'elt'];
const PLAIN: Record<keyof Panel['edges'], GibEdge> = {
  left: 'ell',
  right: 'elr',
  back: 'elt',
  front: 'elb',
};
const TURNED: Record<keyof Panel['edges'], GibEdge> = {
  back: 'ell',
  front: 'elr',
  left: 'elb',
  right: 'elt',
};

/**
 * The grain runs across the panel's length (written turned). The engine's grainDirection is a
 * placeholder ('length' on every board); a door leaf's length is its WIDTH, and a door's grain
 * runs up its height — the shop's usual rule for wood decors.
 */
export function grainAcross(p: Panel): boolean {
  if (p.grainDirection === null) return false;
  return p.grainDirection === 'width' || p.role === 'door';
}

interface GibPart {
  name: string;
  l: number;
  w: number;
  txt: boolean;
  count: number;
  material: string;
  /** GibLab edge -> band key */
  edges: Partial<Record<GibEdge, string>>;
  /** banded length per band key, mm (one board) */
  bandMm: Map<string, number>;
  id?: number;
}

interface GibBand {
  key: string;
  name: string;
  w: number;
  metres: number;
}

/** The cut parts: boards only (no metal frames), identical boards on one part. */
export function giblabParts(result: GenerateResult): { parts: GibPart[]; bands: GibBand[] } {
  const rows = cutList(result);
  const rowOf = new Map<string, number>();
  rows.forEach((r, i) => r.panelIds.forEach((id) => rowOf.set(id, i)));
  const parts = new Map<string, GibPart>();
  const bands = new Map<string, GibBand>();
  for (const p of result.panels) {
    const row = rowOf.get(p.id);
    if (row === undefined) continue; // purchased parts (metal frame)
    if (getMaterial(allMaterials, p.material)?.kind === 'metal') continue;
    const turned = grainAcross(p);
    const map = turned ? TURNED : PLAIN;
    const edges: GibPart['edges'] = {};
    const bandMm = new Map<string, number>();
    for (const side of ['front', 'back', 'left', 'right'] as const) {
      const e = p.edges[side];
      if (!e.bandId) continue;
      const key = `${e.bandId}|${e.thicknessMm ?? ''}|${p.material}|${p.thicknessMm}`;
      if (!bands.has(key)) {
        const thick = e.thicknessMm ? `${num(e.thicknessMm)} mm` : e.bandId;
        bands.set(key, {
          key,
          name: `Kromka ${thick}, ${decorName(p.material)}`,
          w: bandWidth(p.thicknessMm),
          metres: 0,
        });
      }
      edges[map[side]] = key;
      const along = side === 'front' || side === 'back' ? p.lengthMm : p.widthMm;
      bandMm.set(key, (bandMm.get(key) ?? 0) + along);
    }
    const l = turned ? p.widthMm : p.lengthMm;
    const w = turned ? p.lengthMm : p.widthMm;
    const txt = p.grainDirection !== null;
    const partKey = [row, l, w, txt, p.material, ...EDGE_ORDER.map((e) => edges[e] ?? '')].join(
      '|',
    );
    const part = parts.get(partKey);
    if (part) part.count += 1;
    else
      parts.set(partKey, {
        name: `${row + 1}. ${rows[row]!.name}`,
        l,
        w,
        txt,
        count: 1,
        material: p.material,
        edges,
        bandMm,
      });
  }
  for (const part of parts.values())
    for (const [key, mm] of part.bandMm) bands.get(key)!.metres += (mm * part.count) / 1000;
  return { parts: [...parts.values()], bands: [...bands.values()] };
}

/** "2026-11-05 14:03:12" (Asia/Tashkent) -> Unix ms */
function millis(createdAt: string): string {
  const ms = Date.parse(`${createdAt.replace(' ', 'T')}+05:00`);
  return String(Number.isFinite(ms) ? ms : 0);
}

/** A stable project uuid from the application id (the same file every time). */
function projectUuid(id: string): string {
  const h = createHash('sha256').update(`dafna-giblab:${id}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface GiblabInput {
  id: string;
  createdAt: string;
  result: GenerateResult;
}

/** The `.project` XML (one line, no comment). */
export function buildGiblab({ id, createdAt, result }: GiblabInput): string {
  const { parts, bands } = giblabParts(result);
  const materials = [...new Set(parts.map((p) => p.material))];

  // three id counters, as in the sample: goods, parts (stock sheets first), operations
  let goodId = 1;
  const productId = goodId++;
  const cuttingToolId = goodId++;
  const edgelineToolIds = bands.map(() => goodId++);
  const sheetIds = materials.map(() => goodId++);
  const bandIds = bands.map(() => goodId++);
  let partId = 1;
  const stockIds = materials.map(() => partId++);
  for (const p of parts) p.id = partId++;
  let opId = 1;
  const csIds = materials.map(() => opId++);
  const elIds = bands.map(() => opId++);
  const elOf = new Map(bands.map((b, i) => [b.key, i]));

  const partXml = (p: GibPart) => {
    const attrs: [string, string][] = [
      ['l', num(p.l)],
      ['w', num(p.w)],
      ['dl', num(p.l)],
      ['dw', num(p.w)],
      ['jl', num(p.l)],
      ['jw', num(p.w)],
      ['cl', num(p.l)],
      ['cw', num(p.w)],
      ['minusCount', '0'],
      ['count', String(p.count)],
      ['usedCount', String(p.count)],
      ['txt', String(p.txt)],
      ['name', p.name],
      ['id', String(p.id)],
    ];
    for (const e of EDGE_ORDER) {
      const key = p.edges[e];
      if (!key) continue;
      const i = elOf.get(key)!;
      attrs.push([e, `@operation#${elIds[i]}`], [`${e}Mat`, bands[i]!.name]);
    }
    return el('part', attrs);
  };

  const goods: string[] = [
    el(
      'good',
      [
        ['typeId', 'product'],
        ['count', '1'],
        ['id', String(productId)],
        ['name', id],
        ['costMaterial', '0'],
        ['costOperation', '0'],
        ['cost', '0'],
      ],
      parts.map(partXml).join(''),
    ),
    el('good', [['typeId', 'tool.cutting'], ...CUTTING_TOOL, ['id', String(cuttingToolId)]]),
    ...edgelineToolIds.map((gid) =>
      el('good', [['typeId', 'tool.edgeline'], ...EDGELINE_TOOL, ['id', String(gid)]]),
    ),
    ...materials.map((mid, i) => {
      const [l, w] = sheetSize(mid);
      const thick = getMaterial(allMaterials, mid)?.thicknessMm ?? 16;
      return el(
        'good',
        [
          ['typeId', 'sheet'],
          ['t', num(thick)],
          ['w', num(w)],
          ['l', num(l)],
          ['name', `${decorName(mid)}, ${num(thick)} mm`],
          ['cost', '0'],
          ['id', String(sheetIds[i])],
        ],
        el('part', [
          ['l', num(l)],
          ['w', num(w)],
          ['count', STOCK_COUNT],
          ['id', String(stockIds[i])],
        ]),
      );
    }),
    ...bands.map((b, i) =>
      el('good', [
        ['typeId', 'band'],
        ['w', num(b.w)],
        ['t', '0'],
        ['name', b.name],
        ['count', num(b.metres)],
        ['cost', '0'],
        ['id', String(bandIds[i])],
      ]),
    ),
  ];

  const operations: string[] = [
    ...materials.map((mid, i) => {
      const [l, w] = sheetSize(mid);
      const thick = getMaterial(allMaterials, mid)?.thicknessMm ?? 16;
      const own = parts.filter((p) => p.material === mid);
      return el(
        'operation',
        [
          ...CUTTING,
          ['w', num(w)],
          ['l', num(l)],
          ['t', num(thick)],
          ...CUTTING_TAIL,
          ['tool1', String(cuttingToolId)],
          ['typeId', 'CS'],
          ...COSTS,
          ['id', String(csIds[i])],
        ],
        el('material', [['id', String(sheetIds[i])]]) +
          own.map((p) => el('part', [['id', String(p.id)]])).join('') +
          el('part', [['id', String(stockIds[i])]]),
      );
    }),
    ...bands.map((b, i) => {
      const own = parts.filter((p) => Object.values(p.edges).includes(b.key));
      return el(
        'operation',
        [
          ...EDGELINE,
          ['elLength', num(b.metres)],
          ['tool1', String(edgelineToolIds[i])],
          ['typeId', 'EL'],
          ...COSTS,
          ['printable', 'true'],
          ['startNewPage', 'true'],
          ['id', String(elIds[i])],
        ],
        el('material', [
          ['id', String(bandIds[i])],
          ['count', num(b.metres)],
        ]) + own.map((p) => el('part', [['id', String(p.id)]])).join(''),
      );
    }),
  ];

  const date = millis(createdAt);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    el(
      'project',
      [
        ['project.uuid', projectUuid(id)],
        ['version', VERSION],
        ['costOperation', '0'],
        ['costMaterial', '0'],
        ['cost', '0'],
        ['date', date],
        ['orderDate', date],
      ],
      goods.join('') + operations.join(''),
    )
  );
}

/** The application's GibLab file (null = its configuration cannot be rebuilt). */
export function giblabForLead(lead: LeadRecord): Uint8Array | null {
  const input = orderPdfInput(lead);
  if (!input) return null;
  return new TextEncoder().encode(
    buildGiblab({ id: lead.id, createdAt: lead.createdAt, result: input.result }),
  );
}
