import hardwareV1Json from '../catalog/hardware.v1.json' with { type: 'json' };
import priceListDemoJson from '../catalog/pricelist.demo.json' with { type: 'json' };
import { allMaterials, getMaterial } from './catalog.js';
import type { GenerateResult, MaterialCatalog, Panel, Params, Template } from './types.js';

/**
 * D-9: bill of materials (BOM) and price. Pure functions on engine output:
 * - boards: m² per material (cut parts; metal frame members are purchased, not boards);
 * - edges: metres of edge band per band id (banded panel edges);
 * - hardware: hinges per door leaf (by leaf height), a pair of slides per drawer, rails per
 *   metre + 2 holders, castors, the lift frame; brands from the template params (hingeBrand,
 *   slideBrand -> hardware catalog brands).
 * Prices come from a versioned price list; until Dafna sends the real one the list is DEMO and
 * must not be shown to customers.
 */
export interface HardwareItem {
  id: string;
  kind: string;
  brand: string;
  nameKey: string;
  softClose: boolean;
  unit: 'pcs' | 'pair' | 'm';
  unconfirmed: boolean;
  note?: string;
  /** D-28: model as the office calls it (e.g. "Master 18 mm") */
  model?: string;
  /** D-28: the article's name in Dafna's 1C stock report */
  erpName?: string;
  /** D-28: cost of one unit in USD (Dafna's stock report) */
  costUsd?: number;
  /**
   * D-28: kiosk = offered to customers or counted in the BOM; production = the office's list
   * only (connectors, screws, …); legacy = kept for applications made before (Strax, Hettich)
   */
  use?: 'kiosk' | 'production' | 'legacy';
  /** D-28: slides only - side-mounted (ball bearing) or hidden under the drawer */
  slideMount?: 'side' | 'under';
}

export interface HardwareCatalog {
  hardwareVersion: string;
  items: HardwareItem[];
  brands: Record<string, Record<string, string>>;
  hingeRule: { maxDoorHeightMm: number; count: number }[];
  /** D-15: hinges by door weight (kg); the larger of both rules wins */
  hingeWeightRule?: { maxDoorWeightKg: number; count: number }[];
  /** D-15: leaves wider than this get one more hinge */
  hingeExtraAboveWidthMm?: number;
  /** D-15: board density by material kind, kg/m3 (door weight) */
  boardDensityKgM3?: Record<string, number>;
  /** D-28: hinge brand -> hinge item per mounting (full_overlay / half_overlay / inset) */
  hingeByMount?: Record<string, Record<string, string>>;
  /** D-28: hinge brand -> its mounting plate (one per hinge) */
  hingePlate?: Record<string, string>;
  /** D-28: slide brand -> parts added once per drawer (e.g. the left and right locks) */
  slideExtras?: Record<string, string[]>;
  hardwareNote?: string;
}

/** D-19: a board priced per sheet (from the supplier API or typed by the manager). */
export interface SheetPrice {
  /** price of one whole sheet */
  price: number;
  lengthMm: number;
  widthMm: number;
}

/**
 * D-20: a priced service the manager adds (cutting, drilling, delivery, …):
 * m2 = per m² of board, edge_m = per metre of edge band, product = per product (order),
 * pct = % of all other costs. `products` empty = every product.
 */
export interface PriceService {
  id: string;
  name: string;
  /**
   * m2 = board area, edge_m = edge band metres, product = once, pct = % of the costs;
   * D-29: manual_m = per metre entered by hand for the order (the oval edge of a curved part),
   * never counted automatically
   */
  basis: 'm2' | 'edge_m' | 'product' | 'pct' | 'manual_m';
  products: string[];
  price: number;
}

export interface PriceList {
  priceListVersion: string;
  currency: string;
  demo: boolean;
  /** D-19: per sheet, by material id; wins over every per-m² price below */
  boardSheets?: Record<string, SheetPrice>;
  boardPerM2: Record<string, number>;
  boardPerM2ByThickness: Record<string, number>;
  boardPerM2ById: Record<string, number>;
  edgePerM: number;
  hardware: Record<string, number>;
  laborPerM2: number;
  /** D-19: assembly (yig'ish) per product, by product type (wardrobe / pedestal / desk) */
  assembly?: Record<string, number>;
  /** D-20: services added by the manager */
  services?: PriceService[];
  /** D-20: our material / hardware id -> its ERP article (the ERP price sync matches on it) */
  erpCodes?: Record<string, string>;
  /** D-28: USD -> so'm rate the demo hardware prices were made with */
  usdRate?: number;
  wasteFactor: number;
  markupPct: number;
  roundTo: number;
}

export const hardwareV1 = hardwareV1Json as HardwareCatalog;
export const priceListDemo = priceListDemoJson as PriceList;

export interface BomLine {
  kind: 'board' | 'edge' | 'hardware';
  /** material id, edge band id or hardware item id */
  ref: string;
  qty: number;
  unit: 'm2' | 'm' | 'pcs' | 'pair';
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** D-28: the hardware item behind a brand option (hingeBrand / slideBrand value). */
export function brandItem(
  kind: string,
  key: string,
  hw: HardwareCatalog = hardwareV1,
): HardwareItem | undefined {
  const id = hw.brands[kind]?.[key];
  return id ? hw.items.find((i) => i.id === id) : undefined;
}

/** Hinges for one door leaf of the given height. */
export function hingeCount(heightMm: number, hw: HardwareCatalog = hardwareV1): number {
  const rule = hw.hingeRule.find((r) => heightMm <= r.maxDoorHeightMm);
  return rule ? rule.count : (hw.hingeRule.at(-1)?.count ?? 2) + 1;
}

/** D-15: weight of a door leaf from its size and board (kg). */
export function doorWeightKg(p: Panel, hw: HardwareCatalog = hardwareV1): number {
  const kind = getMaterial(allMaterials, p.material)?.kind ?? 'ldsp';
  const density = hw.boardDensityKgM3?.[kind] ?? 700;
  return (p.lengthMm * p.widthMm * p.thicknessMm * density) / 1e9;
}

/**
 * D-15: hinges for one door leaf: the larger of the height rule and the weight rule, one more
 * if the leaf is wider than hingeExtraAboveWidthMm. A front board's height is its panel width.
 */
export function hingesForDoor(p: Panel, hw: HardwareCatalog = hardwareV1): number {
  const byHeight = hingeCount(p.widthMm, hw);
  const rule = hw.hingeWeightRule;
  if (!rule || rule.length === 0) return byHeight;
  const kg = doorWeightKg(p, hw);
  const byWeight =
    rule.find((r) => kg <= r.maxDoorWeightKg)?.count ?? (rule.at(-1)?.count ?? 2) + 1;
  const extra =
    hw.hingeExtraAboveWidthMm !== undefined && p.lengthMm > hw.hingeExtraAboveWidthMm ? 1 : 0;
  return Math.max(byHeight, byWeight) + extra;
}

export function computeBom(
  template: Template,
  params: Params,
  result: GenerateResult,
  hw: HardwareCatalog = hardwareV1,
): BomLine[] {
  const boards = new Map<string, number>();
  const edges = new Map<string, number>();
  const hardware = new Map<string, number>();
  const addHw = (id: string | undefined, n: number) => {
    if (id && n > 0) hardware.set(id, (hardware.get(id) ?? 0) + n);
  };

  for (const p of result.panels) {
    if (p.role === 'frame') continue; // purchased metal parts (castors, lift frame)
    boards.set(p.material, (boards.get(p.material) ?? 0) + (p.lengthMm * p.widthMm) / 1e6);
    const along = { front: p.lengthMm, back: p.lengthMm, left: p.widthMm, right: p.widthMm };
    for (const side of ['front', 'back', 'left', 'right'] as const) {
      const band = p.edges[side].bandId;
      if (band) edges.set(band, (edges.get(band) ?? 0) + along[side] / 1000);
    }
  }

  const brand = (kind: string, key: string) =>
    hw.brands[kind]?.[String(params[key] ?? 'strax')] ?? hw.brands[kind]?.strax;
  // doors: hinges per leaf (a leaf's height is its panel width: front-plane boards)
  const hingeKey = String(params.hingeBrand ?? 'strax');
  const byMount = hw.hingeByMount?.[hingeKey];
  for (const d of result.panels.filter((p) => p.role === 'door')) {
    const n = hingesForDoor(d, hw);
    // D-28: the hinge model follows the leaf's mounting (0 / 8 / 18 mm), one plate per hinge
    addHw(
      byMount
        ? (byMount[d.hingeMount ?? 'full_overlay'] ?? byMount.full_overlay)
        : brand('hinge', 'hingeBrand'),
      n,
    );
    addHw(hw.hingePlate?.[hingeKey], n);
  }
  const drawers = result.panels.filter((p) => p.role === 'drawer_front').length;
  addHw(brand('slide', 'slideBrand'), drawers);
  for (const extra of hw.slideExtras?.[String(params.slideBrand ?? '')] ?? [])
    addHw(extra, drawers);
  const railM = result.rails.reduce((m, r) => m + r.lengthMm / 1000, 0);
  if (railM > 0) {
    hardware.set('rail_oval_25', r3(railM));
    addHw('rail_holder', 2 * result.rails.length);
  }
  addHw('castor_standard', result.panels.filter((p) => p.id.startsWith('castor-')).length);
  if (template.templateId === 'desk' && params.legs === 'metal_lift') addHw('lift_frame_2leg', 1);

  const unitOf = (id: string): BomLine['unit'] => hw.items.find((i) => i.id === id)?.unit ?? 'pcs';
  return [
    ...[...boards].map(([ref, qty]) => ({
      kind: 'board' as const,
      ref,
      qty: r3(qty),
      unit: 'm2' as const,
    })),
    ...[...edges].map(([ref, qty]) => ({
      kind: 'edge' as const,
      ref,
      qty: r3(qty),
      unit: 'm' as const,
    })),
    ...[...hardware].map(([ref, qty]) => ({
      kind: 'hardware' as const,
      ref,
      qty,
      unit: unitOf(ref),
    })),
  ];
}

export interface PricedLine extends BomLine {
  unitPrice: number;
  cost: number;
}

export interface PriceResult {
  priceListVersion: string;
  currency: string;
  demo: boolean;
  lines: PricedLine[];
  boards: number;
  edges: number;
  hardware: number;
  labor: number;
  /** D-19: assembly of the product */
  assembly: number;
  /** D-20: each service that applies to this product, and their sum */
  services: { id: string; name: string; cost: number }[];
  servicesTotal: number;
  subtotal: number;
  markup: number;
  total: number;
  /** BOM refs without a price in the list (counted as 0; the UI shows them) */
  missing: string[];
}

export function boardPrice(
  id: string,
  catalog: MaterialCatalog,
  list: PriceList,
): number | undefined {
  const sheet = list.boardSheets?.[id];
  if (sheet && sheet.price > 0 && sheet.lengthMm > 0 && sheet.widthMm > 0)
    return sheet.price / ((sheet.lengthMm * sheet.widthMm) / 1e6);
  if (list.boardPerM2ById[id] !== undefined) return list.boardPerM2ById[id];
  const m = getMaterial(catalog, id);
  if (!m) return undefined;
  return list.boardPerM2ByThickness[String(m.thicknessMm)] ?? list.boardPerM2[m.kind];
}

export function computePrice(
  bom: BomLine[],
  catalog: MaterialCatalog,
  list: PriceList = priceListDemo,
  /** D-19: the product type, for its assembly price */
  productType?: string,
): PriceResult {
  const missing: string[] = [];
  const lines: PricedLine[] = bom.map((l) => {
    const unitPrice =
      l.kind === 'board'
        ? boardPrice(l.ref, catalog, list)
        : l.kind === 'edge'
          ? list.edgePerM
          : list.hardware[l.ref];
    if (unitPrice === undefined) missing.push(l.ref);
    const qty = l.kind === 'board' ? l.qty * list.wasteFactor : l.qty;
    return {
      ...l,
      unitPrice: Math.round(unitPrice ?? 0),
      cost: Math.round(qty * (unitPrice ?? 0)),
    };
  });
  const sum = (k: BomLine['kind']) =>
    lines.filter((l) => l.kind === k).reduce((s, l) => s + l.cost, 0);
  const area = bom.filter((l) => l.kind === 'board').reduce((s, l) => s + l.qty, 0);
  const boards = sum('board');
  const edges = sum('edge');
  const hardware = sum('hardware');
  const labor = Math.round(area * list.laborPerM2);
  const assembly = productType ? (list.assembly?.[productType] ?? 0) : 0;
  const edgeM = bom.filter((l) => l.kind === 'edge').reduce((s, l) => s + l.qty, 0);
  const applies = (sv: PriceService) =>
    sv.products.length === 0 || (productType !== undefined && sv.products.includes(productType));
  const services: PriceResult['services'] = [];
  // D-29: a per-metre service entered by hand is not counted automatically
  for (const sv of (list.services ?? []).filter(
    (x) => applies(x) && x.basis !== 'pct' && x.basis !== 'manual_m',
  )) {
    const qty = sv.basis === 'm2' ? area : sv.basis === 'edge_m' ? edgeM : 1;
    services.push({ id: sv.id, name: sv.name, cost: Math.round(qty * sv.price) });
  }
  const base =
    boards + edges + hardware + labor + assembly + services.reduce((s, x) => s + x.cost, 0);
  for (const sv of (list.services ?? []).filter((x) => applies(x) && x.basis === 'pct'))
    services.push({ id: sv.id, name: sv.name, cost: Math.round((base * sv.price) / 100) });
  const servicesTotal = services.reduce((s, x) => s + x.cost, 0);
  const subtotal = boards + edges + hardware + labor + assembly + servicesTotal;
  const markup = Math.round((subtotal * list.markupPct) / 100);
  const total = Math.round((subtotal + markup) / list.roundTo) * list.roundTo;
  return {
    priceListVersion: list.priceListVersion,
    currency: list.currency,
    demo: list.demo,
    lines,
    boards,
    edges,
    hardware,
    labor,
    assembly,
    services,
    servicesTotal,
    subtotal,
    markup,
    total,
    missing,
  };
}
