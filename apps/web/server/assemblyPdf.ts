import {
  allMaterials,
  computeBom,
  getMaterial,
  hardwareV1,
  hingesForDoor,
  type GenerateResult,
  type Panel,
  type Params,
  type Rail,
  type Template,
} from '@dafna/engine';
import { PDFDocument, rgb } from 'pdf-lib';
import { translate, type Lang } from '../src/i18n/translate';
import { cutList } from './orderPdf';
import {
  ACCENT,
  FILL,
  INK,
  LINE,
  MUTED,
  Writer,
  boardBox,
  drawLogo,
  loadFonts,
  logoHeight,
  polygon,
  type Box,
  type V3,
} from './pdfKit';

/**
 * D-12: the customer's assembly instructions (a picture book in the spirit of flat-pack
 * furniture manuals, drawn in Dafna's own style): a cover with the logo and the finished
 * product, the parts (one letter per identical board) and hardware, then one isometric drawing
 * per step — what is already built in grey, the boards added in this step in amber, pulled out
 * along the way they go in, with their letters. Generated from the engine output, in the
 * customer's language (uz / ru). Fasteners are not modelled yet, so they are not counted.
 *
 * Safety: a tall wardrobe gets the wall-fixing page (tip-over: EN 14749 / ISO 7170 require
 * storage furniture to stay stable; manufacturers ship a wall fixing for tall units).
 */

type Dict = Record<string, string>;

const TXT: Record<Lang, Dict> = {
  uz: {
    title: "Yig'ish ko'rsatmasi",
    order: 'Ariza',
    parts: 'Detallar',
    hardware: 'Furnitura',
    fasteners: 'Shuruplar va mahkamlagichlar to‘plamda keladi.',
    tools: 'Kerakli asboblar: krestli otvertka, shurupovert, ruletka.',
    twoPeople: 'Ikki kishi bilan yig‘ing.',
    floor: 'Yig‘ishni yumshoq, toza polda bajaring — detallar tirnalmasin.',
    step: 'Qadam',
    wallTitle: 'Devorga mahkamlang',
    wallText:
      'Shkaf ag‘darilib ketmasligi uchun uni yuqori qismidan devorga albatta mahkamlang. Devor turiga mos dyubel ishlating.',
    help: 'Savol bo‘lsa, Dafna menejeriga ariza raqamini ayting: {id}',
    doneTitle: 'Tayyor!',
    page: 'sahifa',
    // steps
    base: 'Pastki qism',
    sides: 'Yon devorlar',
    partitions: 'Oraliq devorlar',
    top: 'Yuqori qopqoq',
    back: 'Orqa devor',
    backTip: 'Korpusni yotqizing, diagonallarini teng qiling, so‘ng orqa devorni mahkamlang.',
    shelves: 'Polkalar va kiyim trubasi',
    castors: "G'ildirakchalar",
    drawers: 'Tortmalar',
    drawersTip:
      'Har bir tortmani yig‘ing, yo‘naltiruvchilarni korpusga va tortmaga mahkamlang, tortmani joyiga kiriting.',
    doors: 'Eshiklar',
    doorsTip:
      'Petlyalarni avval eshikka, keyin korpusga mahkamlang. Eshiklar orasidagi tirqishni petlya vintlari bilan teng sozlang.',
    legs: 'Oyoqlar',
    modesty: "Old to'siq paneli",
    worktop: 'Stoleshnitsa',
    rest: 'Qolgan detallar',
    pcs: 'dona',
    pair: 'juft',
    m: 'm',
  },
  ru: {
    title: 'Инструкция по сборке',
    order: 'Заявка',
    parts: 'Детали',
    hardware: 'Фурнитура',
    fasteners: 'Шурупы и крепёж — в комплекте.',
    tools: 'Инструменты: крестовая отвёртка, шуруповёрт, рулетка.',
    twoPeople: 'Собирайте вдвоём.',
    floor: 'Собирайте на мягком чистом полу, чтобы не поцарапать детали.',
    step: 'Шаг',
    wallTitle: 'Закрепите на стене',
    wallText:
      'Чтобы шкаф не опрокинулся, обязательно закрепите его верхнюю часть на стене. Используйте дюбели, подходящие для вашей стены.',
    help: 'Если есть вопросы, назовите менеджеру Dafna номер заявки: {id}',
    doneTitle: 'Готово!',
    page: 'стр.',
    base: 'Нижняя часть',
    sides: 'Боковины',
    partitions: 'Перегородки',
    top: 'Крыша',
    back: 'Задняя стенка',
    backTip: 'Положите корпус, выровняйте диагонали, затем закрепите заднюю стенку.',
    shelves: 'Полки и штанга',
    castors: 'Колёсики',
    drawers: 'Ящики',
    drawersTip:
      'Соберите каждый ящик, закрепите направляющие на корпусе и на ящике, вставьте ящик.',
    doors: 'Двери',
    doorsTip:
      'Закрепите петли сначала на двери, затем на корпусе. Выровняйте зазоры между дверями винтами петель.',
    legs: 'Опоры',
    modesty: 'Царга',
    worktop: 'Столешница',
    rest: 'Остальные детали',
    pcs: 'шт.',
    pair: 'компл.',
    m: 'м',
  },
};

const ROLE: Record<Lang, Dict> = {
  uz: {
    side: 'Yon devor',
    top: 'Yuqori qopqoq',
    bottom: 'Pastki taglik',
    partition: 'Oraliq devor',
    back: 'Orqa devor',
    plinth: 'Tsokol',
    door: 'Eshik',
    shelf: 'Polka',
    drawer_front: 'Tortma oldi',
    drawer_side: 'Tortma yoni',
    drawer_back: 'Tortma orqasi',
    drawer_bottom: 'Tortma tagi',
    worktop: 'Stoleshnitsa',
    leg: 'Oyoq paneli',
    modesty: "Old to'siq",
  },
  ru: {
    side: 'Боковина',
    top: 'Крыша',
    bottom: 'Дно',
    partition: 'Перегородка',
    back: 'Задняя стенка',
    plinth: 'Цоколь',
    door: 'Дверь',
    shelf: 'Полка',
    drawer_front: 'Фасад ящика',
    drawer_side: 'Бок ящика',
    drawer_back: 'Задник ящика',
    drawer_bottom: 'Дно ящика',
    worktop: 'Столешница',
    leg: 'Опора',
    modesty: 'Царга',
  },
};

const HW: Record<Lang, Dict> = {
  uz: {
    hinge_strax: 'Petlya Strax',
    hinge_hettich_sensys: 'Petlya Hettich Sensys',
    slide_strax_ball: "Yo'naltiruvchi Strax",
    slide_hettich_quadro: "Yo'naltiruvchi Hettich Quadro",
    rail_oval_25: 'Kiyim trubasi',
    rail_holder: 'Truba ushlagichi',
    castor_standard: "G'ildirakcha",
    lift_frame_2leg: "Ko'tariluvchi rama",
  },
  ru: {
    hinge_strax: 'Петля Strax',
    hinge_hettich_sensys: 'Петля Hettich Sensys',
    slide_strax_ball: 'Направляющие Strax',
    slide_hettich_quadro: 'Направляющие Hettich Quadro',
    rail_oval_25: 'Штанга',
    rail_holder: 'Держатель штанги',
    castor_standard: 'Колёсико',
    lift_frame_2leg: 'Подъёмная рама',
  },
};

// ---------- steps ----------

export interface AssemblyStep {
  /** TXT key of the title */
  key: string;
  tipKey?: string;
  panels: Panel[];
  rails: Rail[];
  /** hardware item ids used in this step */
  hardware: string[];
  /** the first step lies where it is (nothing to pull it out of) */
  base: boolean;
}

const isDrawer = (p: Panel) => p.role.startsWith('drawer_');
const isCastor = (p: Panel) => p.role === 'frame' && p.id.startsWith('castor-');

/** Product -> ordered steps: [title key, which boards, tip]. Boards no step takes go last. */
const PLANS: Record<string, [string, (p: Panel) => boolean, string?][]> = {
  wardrobe: [
    // D-26: the feet go under the bottom first
    [
      'base',
      (p) =>
        p.role === 'bottom' ||
        p.role === 'plinth' ||
        (p.role === 'frame' && p.id.startsWith('foot')),
    ],
    ['sides', (p) => p.role === 'side'],
    ['partitions', (p) => p.role === 'partition'],
    ['top', (p) => p.role === 'top'],
    ['back', (p) => p.role === 'back', 'backTip'],
    ['shelves', (p) => p.role === 'shelf'],
    ['drawers', isDrawer, 'drawersTip'],
    ['doors', (p) => p.role === 'door', 'doorsTip'],
  ],
  pedestal: [
    ['base', (p) => p.role === 'bottom' || p.role === 'plinth'],
    ['sides', (p) => p.role === 'side' || p.role === 'partition'],
    ['top', (p) => p.role === 'top'],
    ['back', (p) => p.role === 'back', 'backTip'],
    ['castors', isCastor],
    ['drawers', isDrawer, 'drawersTip'],
    ['doors', (p) => p.role === 'door', 'doorsTip'],
  ],
  desk: [
    ['legs', (p) => p.role === 'leg' || p.role === 'frame'],
    ['modesty', (p) => p.role === 'modesty'],
    ['worktop', (p) => p.role === 'worktop'],
  ],
};

export function assemblySteps(
  template: Template,
  params: Params,
  result: GenerateResult,
): AssemblyStep[] {
  const plan = PLANS[template.templateId] ?? PLANS.wardrobe!;
  const left = new Set(result.panels.map((p) => p.id));
  const steps: AssemblyStep[] = [];
  const bom = computeBom(template, params, result);
  const itemsOf = (kind: string) =>
    bom
      .filter((b) => b.kind === 'hardware')
      .map((b) => b.ref)
      .filter((ref) => hardwareV1.items.find((i) => i.id === ref)?.kind === kind);
  for (const [key, take, tipKey] of plan) {
    const panels = result.panels.filter((p) => left.has(p.id) && take(p));
    const rails = key === 'shelves' ? result.rails : [];
    if (panels.length === 0 && rails.length === 0) continue;
    for (const p of panels) left.delete(p.id);
    const hardware =
      key === 'doors'
        ? [...itemsOf('hinge'), ...itemsOf('hinge_plate')] // D-28: plates go with the hinges
        : key === 'drawers'
          ? [...itemsOf('slide'), ...itemsOf('slide_lock')]
          : key === 'castors'
            ? itemsOf('castor')
            : rails.length > 0
              ? ['rail_oval_25', 'rail_holder']
              : key === 'legs'
                ? itemsOf('lift_frame')
                : [];
    steps.push({ key, tipKey, panels, rails, hardware, base: steps.length === 0 });
  }
  const rest = result.panels.filter((p) => left.has(p.id));
  if (rest.length > 0)
    steps.push({ key: 'rest', panels: rest, rails: [], hardware: [], base: steps.length === 0 });
  return steps;
}

// ---------- isometric drawing ----------

const C = Math.SQRT1_2;
const S = 1 / Math.sqrt(6);
/** isometric projection, camera at front-right-top (+X, +Y, +Z) */
const iso = (p: V3): [number, number] => [(p[0] - p[2]) * C, (2 * p[1] - p[0] - p[2]) * S];

interface Item {
  box: Box;
  fresh: boolean;
  /** pulled-out offset (mm) of a fresh board */
  off: V3;
  label?: string;
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const moved = (b: Box, o: V3): Box => ({ min: add(b.min, o), max: add(b.max, o) });
const centre = (b: Box): V3 => [
  (b.min[0] + b.max[0]) / 2,
  (b.min[1] + b.max[1]) / 2,
  (b.min[2] + b.max[2]) / 2,
];

function railBox(r: Rail): Box {
  const h = r.diameterMm / 2;
  const [x, y, z] = r.position;
  return { min: [x - r.lengthMm / 2, y - h, z - h], max: [x + r.lengthMm / 2, y + h, z + h] };
}

/** Back-to-front order: A is drawn before B when A lies behind B along some axis. */
function paintOrder(items: Item[]): Item[] {
  const boxes = items.map((i) => moved(i.box, i.off));
  const eps = 0.01;
  const behind = (a: number, b: number) =>
    [0, 1, 2].some((k) => boxes[a]!.max[k]! <= boxes[b]!.min[k]! + eps);
  const n = items.length;
  const indeg = new Array<number>(n).fill(0);
  const after: number[][] = items.map(() => []);
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++)
      if (a !== b && behind(a, b) && !behind(b, a)) {
        after[a]!.push(b);
        indeg[b]! += 1;
      }
  const sum = (i: number) => {
    const c = centre(boxes[i]!);
    return c[0] + c[1] + c[2];
  };
  const out: Item[] = [];
  const ready = items.map((_, i) => i).filter((i) => indeg[i] === 0);
  const done = new Set<number>();
  while (out.length < n) {
    if (ready.length === 0) {
      // a cycle (boards touching on two axes): fall back to the nearest-centre order
      const i = items
        .map((_, j) => j)
        .filter((j) => !done.has(j))
        .sort((x, y) => sum(x) - sum(y))[0]!;
      ready.push(i);
    }
    ready.sort((x, y) => sum(x) - sum(y));
    const i = ready.shift()!;
    if (done.has(i)) continue;
    done.add(i);
    out.push(items[i]!);
    for (const j of after[i]!) {
      indeg[j]! -= 1;
      if (indeg[j] === 0 && !done.has(j)) ready.push(j);
    }
  }
  return out;
}

const OLD = {
  top: rgb(0.98, 0.98, 0.99),
  front: rgb(0.93, 0.94, 0.95),
  right: rgb(0.86, 0.87, 0.89),
};
const NEW = { top: rgb(1, 0.9, 0.7), front: rgb(1, 0.82, 0.52), right: rgb(0.95, 0.7, 0.33) };

/** Draws the items fitted into the frame; returns nothing. */
function drawIso(
  w: Writer,
  items: Item[],
  frame: { x: number; y: number; w: number; h: number },
  arrows = true,
  /** boxes that only take part in the fit (the whole product: one scale for every step) */
  fit: Box[] = [],
) {
  // fit: every corner of every box, at its final and pulled-out place
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const b of [...fit, ...items.flatMap((it) => [it.box, moved(it.box, it.off)])])
    for (const cx of [b.min[0], b.max[0]])
      for (const cy of [b.min[1], b.max[1]])
        for (const cz of [b.min[2], b.max[2]]) {
          const [u, v] = iso([cx, cy, cz]);
          x0 = Math.min(x0, u);
          x1 = Math.max(x1, u);
          y0 = Math.min(y0, v);
          y1 = Math.max(y1, v);
        }
  const k = Math.min(frame.w / (x1 - x0), frame.h / (y1 - y0));
  const ox = frame.x + (frame.w - (x1 - x0) * k) / 2 - x0 * k;
  const oy = frame.y + (frame.h - (y1 - y0) * k) / 2 - y0 * k;
  const P = (p: V3): [number, number] => {
    const [u, v] = iso(p);
    return [ox + u * k, oy + v * k];
  };
  const face = (b: Box, fresh: boolean) => {
    const [a, c] = [b.min, b.max];
    const col = fresh ? NEW : OLD;
    const stroke = fresh ? INK : rgb(0.6, 0.62, 0.66);
    const width = fresh ? 0.7 : 0.4;
    polygon(
      w,
      [P([a[0], c[1], a[2]]), P([c[0], c[1], a[2]]), P([c[0], c[1], c[2]]), P([a[0], c[1], c[2]])],
      { fill: col.top, stroke, width },
    );
    polygon(
      w,
      [P([a[0], a[1], c[2]]), P([c[0], a[1], c[2]]), P([c[0], c[1], c[2]]), P([a[0], c[1], c[2]])],
      { fill: col.front, stroke, width },
    );
    polygon(
      w,
      [P([c[0], a[1], a[2]]), P([c[0], a[1], c[2]]), P([c[0], c[1], c[2]]), P([c[0], c[1], a[2]])],
      { fill: col.right, stroke, width },
    );
  };
  // what is already built first (ghosted), then the new boards on top so they always show
  for (const it of paintOrder(items.filter((i) => !i.fresh))) face(it.box, false);
  const fresh = paintOrder(items.filter((i) => i.fresh));
  if (arrows)
    for (const it of fresh) {
      if (!it.off.some((v) => v !== 0)) continue;
      const [ax, ay] = P(centre(moved(it.box, it.off)));
      const [bx, by] = P(centre(it.box));
      w.line(ax, ay, bx, by, INK, 0.7, [3, 2]);
      const ang = Math.atan2(by - ay, bx - ax);
      polygon(
        w,
        [
          [bx, by],
          [bx - 7 * Math.cos(ang - 0.4), by - 7 * Math.sin(ang - 0.4)],
          [bx - 7 * Math.cos(ang + 0.4), by - 7 * Math.sin(ang + 0.4)],
        ],
        { fill: INK },
      );
    }
  for (const it of fresh) face(moved(it.box, it.off), true);
  // letters on the new boards (one per letter is enough)
  const seen = new Set<string>();
  const placed: [number, number][] = [];
  for (const it of fresh) {
    if (!it.label || seen.has(it.label)) continue;
    seen.add(it.label);
    const b = moved(it.box, it.off);
    const at = P([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, b.max[2]]);
    const cy = at[1];
    let cx = at[0];
    // boards of one drawer share a centre: step the letter aside until it is free
    while (placed.some(([px, py]) => Math.hypot(px - cx, py - cy) < 18)) cx += 20;
    placed.push([cx, cy]);
    w.page.drawCircle({ x: cx, y: cy, size: 8, color: INK });
    w.text(it.label, cx, cy - 3.2, { size: 9, bold: true, color: rgb(1, 1, 1), align: 'center' });
  }
}

/** Where a board comes from when it is put in place (mm offset). */
function pullOut(p: Panel, product: Box, reach: number): V3 {
  const b = boardBox(p);
  const c = centre(b);
  const pc = centre(product);
  const sign = (v: number) => (v < 0 ? -1 : 1);
  switch (p.role) {
    case 'side':
    case 'leg':
      return [sign(c[0] - pc[0]) * reach * 0.6, 0, 0];
    case 'top':
    case 'worktop':
    case 'partition':
      return [0, reach * 0.6, 0];
    case 'back':
      return [0, 0, -reach * 0.5];
    case 'frame':
      return [0, -reach * 0.3, 0];
    case 'modesty':
      return [0, 0, sign(c[2] - pc[2]) * reach * 0.5];
    default:
      return [0, 0, reach * 0.7];
  }
}

// ---------- the PDF ----------

export interface AssemblyPdfInput {
  id: string;
  lang: Lang;
  template: Template;
  params: Params;
  result: GenerateResult;
}

export async function buildAssemblyPdf(input: AssemblyPdfInput): Promise<Uint8Array> {
  const { id, template, params, result } = input;
  const lang: Lang = input.lang === 'ru' ? 'ru' : 'uz';
  const T = (k: string, v: Record<string, string> = {}) =>
    (TXT[lang][k] ?? k).replace(/\{(\w+)\}/g, (_, n: string) => v[n] ?? '');
  const doc = await PDFDocument.create();
  doc.setTitle(`Dafna — ${T('title')} ${id}`);
  doc.setProducer('Dafna configurator');
  const w = new Writer(doc, await loadFonts(doc));
  const M = Writer.M;
  const right = Writer.W - M;
  const productName = translate(lang, `product.${template.templateId}`);
  const size = `${params.width} × ${params.height} × ${params.depth} mm`;

  // letters: one per cut-list line (identical boards)
  const rows = cutList(result);
  const letterOf = new Map<string, string>();
  rows.forEach((r, i) => {
    for (const pid of r.panelIds) letterOf.set(pid, String.fromCharCode(65 + (i % 26)));
  });
  const all = result.panels.map(boardBox);
  const product: Box = {
    min: [0, 1, 2].map((k) => Math.min(...all.map((b) => b.min[k]!))) as V3,
    max: [0, 1, 2].map((k) => Math.max(...all.map((b) => b.max[k]!))) as V3,
  };
  const reach = Math.max(...[0, 1, 2].map((k) => product.max[k]! - product.min[k]!));
  const bom = computeBom(template, params, result);
  const hwQty = (ref: string) => {
    const l = bom.find((b) => b.kind === 'hardware' && b.ref === ref);
    if (!l) return '';
    return `${l.unit === 'm' ? l.qty.toFixed(2) : l.qty} ${T(l.unit)}`;
  };

  // ----- cover -----
  w.newPage();
  drawLogo(w, M, Writer.H - M, 150);
  w.text(`${T('order')} ${id}`, right, Writer.H - M - 14, {
    size: 10,
    color: MUTED,
    align: 'right',
  });
  let y = Writer.H - M - logoHeight(150) - 40;
  w.text(T('title'), M, y, { size: 26, bold: true });
  y -= 24;
  w.text(`${productName} · ${size}`, M, y, { size: 13, color: MUTED });
  drawIso(
    w,
    result.panels.map((p) => ({ box: boardBox(p), fresh: false, off: [0, 0, 0] as V3 })),
    { x: M + 40, y: M + 150, w: right - M - 80, h: y - 40 - (M + 150) },
    false,
  );
  const notes = [T('twoPeople'), T('tools'), T('floor')];
  let ny = M + 110;
  for (const n of notes) {
    w.page.drawCircle({ x: M + 6, y: ny + 3, size: 3, color: ACCENT });
    w.text(n, M + 16, ny, { size: 10 });
    ny -= 18;
  }

  // ----- parts + hardware -----
  w.newPage();
  w.text(T('parts'), M, w.y - 6, { size: 18, bold: true });
  const cols = 2;
  const cardW = (right - M - (cols - 1) * 10) / cols;
  const cardH = 84;
  let cy = w.y - 30;
  rows.forEach((r, i) => {
    const col = i % cols;
    if (col === 0 && i > 0) cy -= cardH + 10;
    if (cy - cardH < M + 20) {
      w.newPage();
      cy = w.y - 10;
    }
    const x = M + col * (cardW + 10);
    w.rect(x, cy - cardH, cardW, cardH, { stroke: LINE, width: 0.6 });
    const letter = String.fromCharCode(65 + (i % 26));
    w.page.drawCircle({ x: x + 16, y: cy - 16, size: 10, color: INK });
    w.text(letter, x + 16, cy - 20, { size: 11, bold: true, color: rgb(1, 1, 1), align: 'center' });
    w.text(`× ${r.count}`, x + cardW - 10, cy - 20, { size: 13, bold: true, align: 'right' });
    // the board to scale, inside 70 × 40 pt
    const sc = Math.min(70 / r.lengthMm, 40 / r.widthMm);
    const bw = Math.max(r.lengthMm * sc, 3);
    const bh = Math.max(r.widthMm * sc, 3);
    w.rect(x + 12 + (70 - bw) / 2, cy - 58 - bh / 2, bw, bh, {
      fill: FILL,
      stroke: INK,
      width: 0.6,
    });
    const tx = x + 96;
    const tw = cardW - 106;
    w.text(ROLE[lang][r.role] ?? r.role, tx, cy - 40, { size: 10, bold: true, maxWidth: tw });
    w.text(`${r.lengthMm} × ${r.widthMm} × ${r.thicknessMm} mm`, tx, cy - 54, {
      size: 8.5,
      color: MUTED,
    });
    const m = getMaterial(
      allMaterials,
      result.panels.find((p) => p.id === r.panelIds[0])!.material,
    );
    w.text(m ? translate(lang, m.decorName) : '', tx, cy - 67, {
      size: 8.5,
      color: MUTED,
      maxWidth: tw,
    });
  });
  const hw = bom.filter((b) => b.kind === 'hardware');
  let hy = cy - cardH - 34;
  if (hy < M + 80 + hw.length * 16) {
    w.newPage();
    hy = w.y - 6;
  }
  w.text(T('hardware'), M, hy, { size: 18, bold: true });
  hy -= 24;
  for (const b of hw) {
    w.page.drawCircle({ x: M + 6, y: hy + 3, size: 4, color: ACCENT });
    w.text(HW[lang][b.ref] ?? b.ref, M + 18, hy, { size: 10 });
    w.text(hwQty(b.ref), right, hy, { size: 10, bold: true, align: 'right' });
    w.line(M, hy - 6, right, hy - 6, LINE, 0.4);
    hy -= 18;
  }
  w.text(T('fasteners'), M, hy - 4, { size: 9, color: MUTED });

  // ----- steps, two per page -----
  const steps = assemblySteps(template, params, result);
  const built: Panel[] = [];
  const builtRails: Rail[] = [];
  const half = (Writer.H - 2 * M - 20) / 2;
  steps.forEach((st, i) => {
    if (i % 2 === 0) w.newPage();
    const top = Writer.H - M - (i % 2) * (half + 20);
    // header: big step number + title
    w.page.drawCircle({ x: M + 16, y: top - 16, size: 16, color: INK });
    w.text(String(i + 1), M + 16, top - 22, {
      size: 16,
      bold: true,
      color: rgb(1, 1, 1),
      align: 'center',
    });
    w.text(T(st.key), M + 42, top - 22, { size: 15, bold: true });
    // what goes in: letters × count, hardware
    const counts = new Map<string, number>();
    for (const p of st.panels) {
      const l = letterOf.get(p.id);
      if (l) counts.set(l, (counts.get(l) ?? 0) + 1);
    }
    let chipX = M + 42;
    const chip = (text: string, amber = false) => {
      const tw = w.width(text, 9, true) + 14;
      w.rect(chipX, top - 46, tw, 16, { fill: amber ? rgb(1, 0.93, 0.8) : FILL });
      w.text(text, chipX + 7, top - 41, { size: 9, bold: true });
      chipX += tw + 6;
    };
    for (const [l, n] of [...counts].sort()) chip(`${l} × ${n}`);
    for (const ref of st.hardware) {
      const q = ref.startsWith('hinge_')
        ? `${st.panels.filter((p) => p.role === 'door').reduce((n, d) => n + hingesForDoor(d), 0)} ${T('pcs')}`
        : hwQty(ref);
      if (q) chip(`${HW[lang][ref] ?? ref} · ${q}`, true);
    }
    const items: Item[] = [
      ...built.map((p) => ({ box: boardBox(p), fresh: false, off: [0, 0, 0] as V3 })),
      ...builtRails.map((r) => ({ box: railBox(r), fresh: false, off: [0, 0, 0] as V3 })),
      ...st.panels.map((p) => ({
        box: boardBox(p),
        fresh: true,
        off: st.base ? ([0, 0, 0] as V3) : pullOut(p, product, reach),
        label: letterOf.get(p.id),
      })),
      ...st.rails.map((r) => ({
        box: railBox(r),
        fresh: true,
        off: [0, 0, reach * 0.7] as V3,
      })),
    ];
    const tipH = st.tipKey ? 34 : 0;
    drawIso(
      w,
      items,
      {
        x: M + 20,
        y: top - half + 10 + tipH,
        w: right - M - 40,
        h: half - 70 - tipH,
      },
      true,
      all,
    );
    if (st.tipKey) {
      w.rect(M, top - half + 6, right - M, 26, { fill: rgb(1, 0.96, 0.88) });
      w.text(T(st.tipKey), M + 10, top - half + 15, { size: 9, maxWidth: right - M - 20 });
    }
    built.push(...st.panels);
    builtRails.push(...st.rails);
  });

  // ----- wall fixing (tall wardrobes) + done -----
  w.newPage();
  let fy = w.y - 10;
  if (template.templateId === 'wardrobe') {
    w.rect(M, fy - 70, right - M, 74, { fill: rgb(1, 0.93, 0.8) });
    w.text(`! ${T('wallTitle')}`, M + 14, fy - 22, { size: 16, bold: true });
    wrap(w, T('wallText'), M + 14, fy - 44, right - M - 28, 10.5);
    fy -= 104;
  }
  w.text(T('doneTitle'), M, fy - 10, { size: 22, bold: true });
  drawIso(
    w,
    result.panels.map((p) => ({ box: boardBox(p), fresh: false, off: [0, 0, 0] as V3 })),
    { x: M + 60, y: M + 80, w: right - M - 120, h: fy - 40 - (M + 80) },
    false,
  );
  w.text(T('help', { id }), M, M + 40, { size: 10, color: MUTED });

  // footer
  w.pages.forEach((p, i) => {
    w.page = p;
    if (i > 0) drawLogo(w, M, M - 6, 44);
    w.text(`${productName} · ${size} · ${id}`, Writer.W / 2, M - 18, {
      size: 7.5,
      color: MUTED,
      align: 'center',
    });
    w.text(`${i + 1} / ${w.pages.length}`, right, M - 18, {
      size: 7.5,
      color: MUTED,
      align: 'right',
    });
  });
  return doc.save();
}

/** Word-wrapped paragraph; returns the y under it. */
function wrap(w: Writer, text: string, x: number, y: number, width: number, size: number) {
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const last = lines.at(-1);
    if (last !== undefined && w.width(`${last} ${word}`, size) <= width)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  for (const l of lines) {
    w.text(l, x, y, { size });
    y -= size * 1.4;
  }
  return y;
}
