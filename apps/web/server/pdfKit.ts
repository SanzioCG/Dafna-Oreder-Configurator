import fontkit from '@pdf-lib/fontkit';
import type { Panel } from '@dafna/engine';
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { INTER_400, INTER_700 } from './pdfFonts';
import { LOGO_PATHS, LOGO_VIEWBOX } from './pdfLogo';

/** Shared PDF kit (D-11 order sheet, D-12 assembly instructions): fonts, text, lines, geometry. */

// ---------- geometry: board boxes in product mm (rotations are multiples of 90°) ----------

export type V3 = [number, number, number];

export function rotate(v: V3, [rx, ry, rz]: V3): V3 {
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

// ---------- drawing primitives ----------

export const INK = rgb(0.1, 0.11, 0.13);
export const MUTED = rgb(0.42, 0.45, 0.5);
export const LINE = rgb(0.75, 0.77, 0.8);
export const FILL = rgb(0.94, 0.95, 0.96);
export const ACCENT = rgb(1, 0.68, 0.12);
export const DIM = rgb(0.05, 0.45, 0.85);

export interface Fonts {
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

export class Writer {
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

/** Embeds Inter (latin, cyrillic, cyrillic-ext) regular + bold, subset to the glyphs used. */
export async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  doc.registerFontkit(fontkit);
  const embed = (list: string[]) =>
    Promise.all(list.map((b64) => doc.embedFont(Buffer.from(b64, 'base64'), { subset: true })));
  return { regular: await embed(INTER_400), bold: await embed(INTER_700) };
}

// ---------- logo ----------

/** Draws the Dafna logo with its top-left corner at (x, yTop), `width` points wide. */
export function drawLogo(w: Writer, x: number, yTop: number, width: number, white = false) {
  const k = width / LOGO_VIEWBOX.width;
  for (const p of LOGO_PATHS) {
    const c = white && p.fill !== '#009FE2' ? '#FFFFFF' : p.fill;
    const n = parseInt(c.slice(1), 16);
    w.page.drawSvgPath(p.d, {
      x: x + p.tx * k,
      y: yTop - p.ty * k,
      scale: k,
      color: rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255),
    });
  }
}

export const logoHeight = (width: number) => (width * LOGO_VIEWBOX.height) / LOGO_VIEWBOX.width;

/** Filled / stroked polygon in page coordinates. */
export function polygon(
  w: Writer,
  pts: [number, number][],
  o: { fill?: ReturnType<typeof rgb>; stroke?: ReturnType<typeof rgb>; width?: number },
) {
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${(-y).toFixed(2)}`).join(' ');
  w.page.drawSvgPath(`${d} Z`, {
    x: 0,
    y: 0,
    color: o.fill,
    borderColor: o.stroke,
    borderWidth: o.stroke ? (o.width ?? 0.6) : 0,
  });
}
