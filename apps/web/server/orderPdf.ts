import fontkit from '@pdf-lib/fontkit';
import {
  PRODUCT_TEMPLATES,
  allMaterials,
  computeBom,
  generate,
  getMaterial,
  hardwareV1,
  hingeCount,
  resolveParams,
  type GenerateResult,
  type Panel,
  type Params,
  type Template,
} from '@dafna/engine';
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { translate } from '../src/i18n/translate';
import { summarizeResult } from '../src/lead/summary';
import { INTER_400, INTER_700 } from './pdfFonts';
import type { LeadRecord } from './types';

/**
 * D-11: the order sheet for the workshop, sent to Telegram with every application.
 * Page 1: customer, product, sizes, decors, mechanisms + a front view (doors dashed, with the
 * opening symbol) and a side view, both dimensioned. Then: the cut list (identical boards
 * grouped, with edge banding), the hardware list and the totals (board m² per decor, edge m).
 * Everything is regenerated from the lead's params by the engine, so a retry builds the same PDF.
 * Uzbek only (the workshop's language); decor names stay as they are (never translated).
 */

const t = (key: string, values?: Record<string, string | number>) => translate('uz', key, values);

/** Board role -> name on the cut list. */
export const ROLE_NAMES: Record<string, string> = {
  side: 'Yon devor',
  top: 'Yuqori qopqoq',
  bottom: 'Pastki taglik',
  partition: 'Oraliq devor',
  back: 'Orqa devor',
  plinth: 'Tsokol',
  door: 'Eshik',
  shelf: 'Polka',
  drawer_front: 'Tortma old paneli',
  drawer_side: 'Tortma yon devori',
  drawer_back: 'Tortma orqa devori',
  drawer_bottom: 'Tortma tagi',
  worktop: 'Stoleshnitsa',
  leg: 'Oyoq paneli',
  modesty: "Old to'siq paneli",
};

/** Hardware item id -> name on the hardware list (brand and model names are not translated). */
export const HARDWARE_NAMES: Record<string, string> = {
  hinge_strax: 'Petlya Strax, standart (35 mm chashka)',
  hinge_hettich_sensys: 'Petlya Hettich Sensys, yumshoq yopiladi',
  slide_strax_ball: "Yo'naltiruvchi Strax, sharikli",
  slide_hettich_quadro: "Yo'naltiruvchi Hettich Quadro, yashirin, yumshoq",
  rail_oval_25: 'Kiyim ilgich trubasi, oval 25',
  rail_holder: 'Truba ushlagichi',
  castor_standard: "G'ildirakcha",
  lift_frame_2leg: "Ko'tariluvchi metall rama, 2 oyoqli",
};

const UNIT_NAMES: Record<string, string> = { pcs: 'dona', pair: 'juft', m: 'm', m2: 'm²' };

// ---------- geometry: board boxes in product mm (rotations are multiples of 90°) ----------

type V3 = [number, number, number];

function rotate(v: V3, [rx, ry, rz]: V3): V3 {
  const c = (d: number) => Math.round(Math.cos((d * Math.PI) / 180));
  const s = (d: number) => Math.round(Math.sin((d * Math.PI) / 180));
  // three.js Euler 'XYZ': v' = Rx · Ry · Rz · v
  let [x, y, z] = v;
  [x, y] = [c(rz) * x - s(rz) * y, s(rz) * x + c(rz) * y];
  [x, z] = [c(ry) * x + s(ry) * z, -s(ry) * x + c(ry) * z];
  [y, z] = [c(rx) * y - s(rx) * z, s(rx) * y + c(rx) * z];
  return [x, y, z];
}

export interface Box {
  min: V3;
  max: V3;
}

export function boardBox(p: Panel): Box {
  const ext: V3 = [0, 0, 0];
  const half: V3[] = [
    [p.lengthMm / 2, 0, 0],
    [0, p.thicknessMm / 2, 0],
    [0, 0, p.widthMm / 2],
  ];
  for (const h of half) {
    const r = rotate(h, p.rotation);
    for (let i = 0; i < 3; i++) ext[i]! += Math.abs(r[i]!);
  }
  const [x, y, z] = p.position;
  return {
    min: [x - ext[0], y - ext[1], z - ext[2]],
    max: [x + ext[0], y + ext[1], z + ext[2]],
  };
}

/** "Kromka 0.8 mm" (band ids are placeholders until Dafna's edge band list) */
function edgeName(result: GenerateResult, bandId: string): string {
  for (const p of result.panels)
    for (const e of Object.values(p.edges))
      if (e.bandId === bandId && e.thicknessMm) return `Kromka ${e.thicknessMm} mm`;
  return `Kromka ${bandId}`;
}

// ---------- cut list ----------

export interface CutRow {
  role: string;
  name: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  count: number;
  material: string;
  /** banded edges along the length / along the width (0..2 each) */
  edgeLength: number;
  edgeWidth: number;
}

const decorName = (id: string) => {
  const m = getMaterial(allMaterials, id);
  if (!m) return id;
  return m.code ? `${t(m.decorName)} (${m.code})` : t(m.decorName);
};

/** Identical boards (role, size, decor, banding) on one line; by decor, then largest first. */
export function cutList(result: GenerateResult): CutRow[] {
  const rows = new Map<string, CutRow>();
  for (const p of result.panels) {
    if (p.role === 'frame') continue; // purchased metal parts
    const edgeLength = Number(!!p.edges.front.bandId) + Number(!!p.edges.back.bandId);
    const edgeWidth = Number(!!p.edges.left.bandId) + Number(!!p.edges.right.bandId);
    const key = [p.role, p.lengthMm, p.widthMm, p.thicknessMm, p.material, edgeLength, edgeWidth]
      .map(String)
      .join('|');
    const row = rows.get(key);
    if (row) row.count += 1;
    else
      rows.set(key, {
        role: p.role,
        name: ROLE_NAMES[p.role] ?? p.role,
        lengthMm: p.lengthMm,
        widthMm: p.widthMm,
        thicknessMm: p.thicknessMm,
        count: 1,
        material: decorName(p.material),
        edgeLength,
        edgeWidth,
      });
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.material.localeCompare(b.material) ||
      b.lengthMm * b.widthMm - a.lengthMm * a.widthMm ||
      a.name.localeCompare(b.name),
  );
}

// ---------- drawing primitives ----------

const INK = rgb(0.1, 0.11, 0.13);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.75, 0.77, 0.8);
const FILL = rgb(0.94, 0.95, 0.96);
const ACCENT = rgb(1, 0.68, 0.12);
const DIM = rgb(0.05, 0.45, 0.85);

interface Fonts {
  regular: PDFFont[];
  bold: PDFFont[];
}

/** Splits text into runs drawable by one font each (Inter latin / cyrillic / cyrillic-ext). */
function runs(text: string, fonts: PDFFont[]): { font: PDFFont; text: string }[] {
  const sets = fonts.map((f) => new Set(f.getCharacterSet()));
  const out: { font: PDFFont; text: string }[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    let i = sets.findIndex((s) => s.has(cp));
    let c = ch;
    if (i < 0) {
      i = 0;
      c = '?';
    }
    const last = out.at(-1);
    if (last && last.font === fonts[i]) last.text += c;
    else out.push({ font: fonts[i]!, text: c });
  }
  return out;
}

class Writer {
  page!: PDFPage;
  y = 0;
  pageNo = 0;
  readonly pages: PDFPage[] = [];
  static readonly W = 595.28;
  static readonly H = 841.89;
  static readonly M = 36;

  constructor(
    readonly doc: PDFDocument,
    readonly fonts: Fonts,
  ) {}

  newPage() {
    this.page = this.doc.addPage([Writer.W, Writer.H]);
    this.pages.push(this.page);
    this.y = Writer.H - Writer.M;
  }

  width(text: string, size: number, bold = false) {
    return runs(text, bold ? this.fonts.bold : this.fonts.regular).reduce(
      (w, r) => w + r.font.widthOfTextAtSize(r.text, size),
      0,
    );
  }

  text(
    text: string,
    x: number,
    y: number,
    o: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      align?: 'left' | 'right' | 'center';
      maxWidth?: number;
    } = {},
  ) {
    const size = o.size ?? 9;
    let s = text;
    if (o.maxWidth) {
      while (s.length > 1 && this.width(s, size, o.bold) > o.maxWidth) s = s.slice(0, -2) + '…';
    }
    const w = this.width(s, size, o.bold);
    let cx = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
    for (const r of runs(s, o.bold ? this.fonts.bold : this.fonts.regular)) {
      this.page.drawText(r.text, { x: cx, y, size, font: r.font, color: o.color ?? INK });
      cx += r.font.widthOfTextAtSize(r.text, size);
    }
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color = INK,
    thickness = 0.6,
    dash?: number[],
  ) {
    this.page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      color,
      thickness,
      dashArray: dash,
    });
  }

  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    o: {
      fill?: ReturnType<typeof rgb>;
      stroke?: ReturnType<typeof rgb>;
      width?: number;
      dash?: number[];
    } = {},
  ) {
    this.page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: o.fill,
      borderColor: o.stroke,
      borderWidth: o.stroke ? (o.width ?? 0.6) : 0,
      borderDashArray: o.dash,
    });
  }

  /** a dimension line with end ticks and the value in mm */
  dim(x1: number, y1: number, x2: number, y2: number, label: string, side: 1 | -1 = 1) {
    this.line(x1, y1, x2, y2, DIM, 0.6);
    const tick = (x: number, y: number) => this.line(x - 2.5, y - 2.5, x + 2.5, y + 2.5, DIM, 0.8);
    tick(x1, y1);
    tick(x2, y2);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    if (y1 === y2)
      this.text(label, mx, my + (side > 0 ? 3 : -9), { size: 8, color: DIM, align: 'center' });
    else
      this.page.drawText(label, {
        x: mx + (side > 0 ? -4 : 10),
        y: my - this.width(label, 8) / 2,
        size: 8,
        font: this.fonts.regular[0]!,
        color: DIM,
        rotate: degrees(90),
      });
  }
}

// ---------- the PDF ----------

export interface OrderPdfInput {
  lead: LeadRecord;
  template: Template;
  params: Params;
  result: GenerateResult;
}

/** The lead's own configuration, regenerated by the engine (null = cannot be rebuilt). */
export function orderPdfInput(lead: LeadRecord): OrderPdfInput | null {
  const template = PRODUCT_TEMPLATES[lead.templateId || 'wardrobe'];
  if (!template) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(lead.paramsJson);
  } catch {
    return null;
  }
  const params = resolveParams(template, raw).params;
  const result = generate(template, params);
  if (!result.dimensions) return null;
  return { lead, template, params, result };
}

export async function buildOrderPdf({
  lead,
  template,
  params,
  result,
}: OrderPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Dafna — ariza ${lead.id}`);
  doc.setProducer('Dafna configurator');
  const embed = (list: string[]) =>
    Promise.all(list.map((b64) => doc.embedFont(Buffer.from(b64, 'base64'), { subset: true })));
  const fonts: Fonts = { regular: await embed(INTER_400), bold: await embed(INTER_700) };
  const w = new Writer(doc, fonts);
  const M = Writer.M;
  const right = Writer.W - M;
  const summary = summarizeResult(params, result, 'uz', template);

  // ----- page 1: header -----
  w.newPage();
  w.rect(0, Writer.H - 64, Writer.W, 64, { fill: INK });
  w.text('DAFNA', M, Writer.H - 40, { size: 20, bold: true, color: rgb(1, 1, 1) });
  w.text(`Ariza ${lead.id}`, right, Writer.H - 34, {
    size: 14,
    bold: true,
    color: rgb(1, 1, 1),
    align: 'right',
  });
  w.text(`${summary.productName} · ${lead.createdAt}`, right, Writer.H - 50, {
    size: 9,
    color: rgb(0.8, 0.82, 0.85),
    align: 'right',
  });
  w.y = Writer.H - 64 - 22;

  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
  const bom = computeBom(template, params, result);
  const hwLine = (kind: string) => {
    const l = bom.find(
      (b) => b.kind === 'hardware' && hardwareV1.items.find((i) => i.id === b.ref)?.kind === kind,
    );
    return l
      ? `${HARDWARE_NAMES[l.ref] ?? l.ref} — ${l.qty} ${UNIT_NAMES[l.unit] ?? l.unit}`
      : null;
  };
  const [mainLabel, secondLabel] =
    template.templateId === 'desk'
      ? ['Stoleshnitsa', 'Oyoq']
      : template.templateId === 'pedestal'
        ? ['Korpus', 'Old panel']
        : ['Korpus', 'Eshik'];
  const info: [string, string][] = [
    ['Mijoz', name || '—'],
    ['Telefon', lead.phone],
    ["O'lcham (E × B × Ch)", `${summary.sizeMm} mm`],
    [mainLabel, summary.corpus + (summary.corpusCode ? ` (${summary.corpusCode})` : '')],
    ...(summary.door
      ? ([[secondLabel, summary.door + (summary.doorCode ? ` (${summary.doorCode})` : '')]] as [
          string,
          string,
        ][])
      : []),
    ...(summary.sections
      ? ([[template.templateId === 'wardrobe' ? "Bo'limlar" : 'Tuzilishi', summary.sections]] as [
          string,
          string,
        ][])
      : []),
    ...(summary.doors
      ? ([[template.templateId === 'pedestal' ? 'Asos' : 'Eshiklar', summary.doors]] as [
          string,
          string,
        ][])
      : []),
    ...(hwLine('hinge') ? ([['Petlyalar', hwLine('hinge')!]] as [string, string][]) : []),
    ...(hwLine('slide') ? ([["Yo'naltiruvchilar", hwLine('slide')!]] as [string, string][]) : []),
    ['Kiosk', lead.kiosk || '—'],
  ];
  for (const [k, v] of info) {
    w.text(k, M, w.y, { size: 9, color: MUTED });
    // long values (the sections of a wide wardrobe) wrap onto the next lines
    const lines: string[] = [];
    for (const word of v.split(' ')) {
      const last = lines.at(-1);
      if (last !== undefined && w.width(`${last} ${word}`, 9.5, true) <= right - M - 120)
        lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    }
    for (const line of lines) {
      w.text(line, M + 120, w.y, { size: 9.5, bold: true, maxWidth: right - M - 120 });
      w.y -= 13;
    }
    w.y -= 2;
  }

  // ----- page 1: front + side view -----
  w.y -= 8;
  const hasDoors = result.panels.some((p) => p.role === 'door');
  w.text(hasDoors ? 'Old ko‘rinish (eshiklar punktir bilan)' : 'Old ko‘rinish', M, w.y, {
    size: 10,
    bold: true,
  });
  const sideX = drawViews(w, result, {
    x: M + 26,
    top: w.y - 30,
    w: right - M - 26,
    h: w.y - 30 - (M + 40),
  });
  w.text('Yon ko‘rinish', sideX, w.y, { size: 10, bold: true });

  // ----- cut list -----
  w.newPage();
  w.text('Detallar ro‘yxati', M, w.y, { size: 14, bold: true });
  w.y -= 8;
  const cols = [
    { title: '№', x: M, align: 'left' as const },
    { title: 'Detal', x: M + 18, align: 'left' as const },
    { title: 'Uzunlik', x: M + 160, align: 'right' as const },
    { title: 'Eni', x: M + 205, align: 'right' as const },
    { title: 'Qal.', x: M + 232, align: 'right' as const },
    { title: 'Soni', x: M + 262, align: 'right' as const },
    { title: 'Kromka U/E', x: M + 318, align: 'right' as const },
    { title: 'Material', x: M + 330, align: 'left' as const },
  ];
  const head = () => {
    w.y -= 18;
    w.rect(M - 4, w.y - 5, right - M + 8, 17, { fill: FILL });
    for (const c of cols)
      w.text(c.title, c.x, w.y, { size: 8, bold: true, color: MUTED, align: c.align });
    w.y -= 16;
  };
  head();
  const rows = cutList(result);
  rows.forEach((r, i) => {
    if (w.y < M + 40) {
      w.newPage();
      head();
    }
    const cells = [
      String(i + 1),
      r.name,
      String(r.lengthMm),
      String(r.widthMm),
      String(r.thicknessMm),
      String(r.count),
      `${r.edgeLength} / ${r.edgeWidth}`,
      r.material,
    ];
    cols.forEach((c, j) =>
      w.text(cells[j]!, c.x, w.y, {
        size: 8.5,
        bold: j === 5,
        align: c.align,
        maxWidth: j === 1 ? 135 : j === 7 ? right - c.x : undefined,
      }),
    );
    w.line(M - 4, w.y - 5, right + 4, w.y - 5, LINE, 0.4);
    w.y -= 15;
  });
  w.y -= 4;
  w.text(
    'Kromka U/E: uzunlik bo‘yicha / eni bo‘yicha kromkalanadigan qirralar soni. O‘lchamlar mm.',
    M,
    w.y,
    {
      size: 7.5,
      color: MUTED,
    },
  );

  // ----- hardware + totals -----
  const section = (title: string, lines: [string, string][]) => {
    if (w.y < M + 60 + lines.length * 15) w.newPage();
    else w.y -= 26;
    w.text(title, M, w.y, { size: 12, bold: true });
    w.y -= 18;
    for (const [k, v] of lines) {
      w.text(k, M, w.y, { size: 9, maxWidth: 330 });
      w.text(v, right, w.y, { size: 9, bold: true, align: 'right' });
      w.line(M - 4, w.y - 5, right + 4, w.y - 5, LINE, 0.4);
      w.y -= 15;
    }
  };
  const hardware = bom.filter((b) => b.kind === 'hardware');
  if (hardware.length > 0)
    section(
      'Furnitura',
      hardware.map((b) => [
        HARDWARE_NAMES[b.ref] ?? b.ref,
        `${b.unit === 'm' ? b.qty.toFixed(2) : b.qty} ${UNIT_NAMES[b.unit] ?? b.unit}`,
      ]),
    );
  section('Jami material', [
    ...bom
      .filter((b) => b.kind === 'board')
      .map((b): [string, string] => [`Plita: ${decorName(b.ref)}`, `${b.qty.toFixed(2)} m²`]),
    ...bom
      .filter((b) => b.kind === 'edge')
      .map((b): [string, string] => [edgeName(result, b.ref), `${b.qty.toFixed(1)} m`]),
  ]);
  w.y -= 10;
  w.text(
    'Plita maydoni — kesilgan detallar bo‘yicha, chiqindisiz.' +
      (hardware.length > 0 ? ' Furnitura ro‘yxati Dafna tomonidan hali tasdiqlanmagan.' : ''),
    M,
    w.y,
    { size: 7.5, color: MUTED },
  );

  // ----- footer on every page -----
  w.pages.forEach((p, i) => {
    w.page = p;
    w.line(M, M - 6, right, M - 6, LINE, 0.5);
    w.text(`Dafna · ariza ${lead.id} · ${summary.productName} ${summary.sizeMm} mm`, M, M - 18, {
      size: 7.5,
      color: MUTED,
    });
    w.text(`${i + 1} / ${w.pages.length}`, right, M - 18, {
      size: 7.5,
      color: MUTED,
      align: 'right',
    });
  });

  return doc.save();
}

/** Front view (X-Y) and side view (Z-Y), scaled to fit, with overall + section dimensions. */
function drawViews(
  w: Writer,
  result: GenerateResult,
  area: { x: number; top: number; w: number; h: number },
): number {
  const boxes = result.panels.map((p) => ({ p, b: boardBox(p) }));
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const { b } of boxes)
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i]!, b.min[i]!);
      hi[i] = Math.max(hi[i]!, b.max[i]!);
    }
  const W = hi[0] - lo[0];
  const H = hi[1] - lo[1];
  const D = hi[2] - lo[2];
  const GAP = 60; // between the front and the side view
  const k = Math.min((area.w - GAP - 10) / (W + D), (area.h - 40) / H);
  const fx = (x: number) => area.x + (x - lo[0]) * k;
  const fy = (y: number) => area.top - 16 - (hi[1] - y) * k; // anchored under the titles
  const sideX = area.x + W * k + GAP;
  const sx = (z: number) => sideX + (hi[2] - z) * k; // front of the product (+Z) on the left
  const fronts = new Set(['door', 'drawer_front']);

  // front view: carcass and interior, back to front; then drawer fronts; doors dashed on top
  const order = [...boxes].sort((a, b) => a.b.max[2] - b.b.max[2]);
  for (const { p, b } of order) {
    if (fronts.has(p.role) || p.role === 'back') continue;
    w.rect(fx(b.min[0]), fy(b.min[1]), (b.max[0] - b.min[0]) * k, (b.max[1] - b.min[1]) * k, {
      fill: p.role === 'frame' ? rgb(0.55, 0.58, 0.62) : FILL,
      stroke: INK,
      width: 0.5,
    });
  }
  for (const r of result.rails) {
    const y = fy(r.position[1]);
    w.line(fx(r.position[0] - r.lengthMm / 2), y, fx(r.position[0] + r.lengthMm / 2), y, INK, 1.6);
  }
  for (const { p, b } of boxes) {
    if (p.role !== 'drawer_front') continue;
    const x0 = fx(b.min[0]);
    const y0 = fy(b.min[1]);
    const ww = (b.max[0] - b.min[0]) * k;
    const hh = (b.max[1] - b.min[1]) * k;
    w.rect(x0, y0, ww, hh, { fill: rgb(1, 1, 1), stroke: INK, width: 0.8 });
  }
  for (const { p, b } of boxes) {
    if (p.role !== 'door') continue;
    const x0 = fx(b.min[0]);
    const x1 = fx(b.max[0]);
    const y0 = fy(b.min[1]);
    const y1 = fy(b.max[1]);
    w.rect(x0, y0, x1 - x0, y1 - y0, { stroke: INK, width: 0.9, dash: [4, 2.5] });
    // opening symbol: from the hinge-side corners to the middle of the handle side
    const hingeX = p.hingeSide === 'right' ? x1 : x0;
    const handleX = p.hingeSide === 'right' ? x0 : x1;
    w.line(hingeX, y0, handleX, (y0 + y1) / 2, MUTED, 0.5, [2, 2]);
    w.line(hingeX, y1, handleX, (y0 + y1) / 2, MUTED, 0.5, [2, 2]);
    // hinges on the hinge side: as many as the BOM counts, 100 mm from each end
    const n = hingeCount(p.widthMm);
    const span = y1 - y0 - 200 * k;
    for (let i = 0; i < n; i++) {
      const yy = y0 + 100 * k + (n > 1 ? (span * i) / (n - 1) : span / 2);
      w.rect(hingeX - 2, yy - 2, 4, 4, { fill: ACCENT });
    }
  }

  // overall dimensions
  w.dim(fx(lo[0]), fy(hi[1]) + 14, fx(hi[0]), fy(hi[1]) + 14, `${Math.round(W)}`);
  w.dim(fx(lo[0]) - 14, fy(lo[1]), fx(lo[0]) - 14, fy(hi[1]), `${Math.round(H)}`);
  // section inner widths under the product
  for (const s of result.sections) {
    if (result.sections.length < 2) break;
    w.dim(
      fx(s.xStartMm),
      fy(lo[1]) - 12,
      fx(s.xStartMm + s.innerWidthMm),
      fy(lo[1]) - 12,
      `${s.innerWidthMm}`,
      -1,
    );
  }

  // side view
  for (const { p, b } of order) {
    if (p.role === 'door' || p.role === 'drawer_front') continue;
    w.rect(sx(b.max[2]), fy(b.min[1]), (b.max[2] - b.min[2]) * k, (b.max[1] - b.min[1]) * k, {
      fill: FILL,
      stroke: INK,
      width: 0.4,
    });
  }
  w.dim(sx(hi[2]), fy(hi[1]) + 14, sx(lo[2]), fy(hi[1]) + 14, `${Math.round(D)}`);
  return sideX;
}
