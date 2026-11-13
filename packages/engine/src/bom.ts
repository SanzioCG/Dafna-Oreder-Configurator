import hardwareV1Json from '../catalog/hardware.v1.json' with { type: 'json' };
import priceListDemoJson from '../catalog/pricelist.demo.json' with { type: 'json' };
import { getMaterial } from './catalog.js';
import type { GenerateResult, MaterialCatalog, Params, Template } from './types.js';

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
}

export interface HardwareCatalog {
  hardwareVersion: string;
  items: HardwareItem[];
  brands: Record<string, Record<string, string>>;
  hingeRule: { maxDoorHeightMm: number; count: number }[];
}

export interface PriceList {
  priceListVersion: string;
  currency: string;
  demo: boolean;
  boardPerM2: Record<string, number>;
  boardPerM2ByThickness: Record<string, number>;
  boardPerM2ById: Record<string, number>;
  edgePerM: number;
  hardware: Record<string, number>;
  laborPerM2: number;
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

/** Hinges for one door leaf of the given height. */
export function hingeCount(heightMm: number, hw: HardwareCatalog = hardwareV1): number {
  const rule = hw.hingeRule.find((r) => heightMm <= r.maxDoorHeightMm);
  return rule ? rule.count : (hw.hingeRule.at(-1)?.count ?? 2) + 1;
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
  const hinges = result.panels
    .filter((p) => p.role === 'door')
    .reduce((n, d) => n + hingeCount(d.widthMm, hw), 0);
  addHw(brand('hinge', 'hingeBrand'), hinges);
  addHw(
    brand('slide', 'slideBrand'),
    result.panels.filter((p) => p.role === 'drawer_front').length,
  );
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
  if (list.boardPerM2ById[id] !== undefined) return list.boardPerM2ById[id];
  const m = getMaterial(catalog, id);
  if (!m) return undefined;
  return list.boardPerM2ByThickness[String(m.thicknessMm)] ?? list.boardPerM2[m.kind];
}

export function computePrice(
  bom: BomLine[],
  catalog: MaterialCatalog,
  list: PriceList = priceListDemo,
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
    return { ...l, unitPrice: unitPrice ?? 0, cost: Math.round(qty * (unitPrice ?? 0)) };
  });
  const sum = (k: BomLine['kind']) =>
    lines.filter((l) => l.kind === k).reduce((s, l) => s + l.cost, 0);
  const area = bom.filter((l) => l.kind === 'board').reduce((s, l) => s + l.qty, 0);
  const boards = sum('board');
  const edges = sum('edge');
  const hardware = sum('hardware');
  const labor = Math.round(area * list.laborPerM2);
  const subtotal = boards + edges + hardware + labor;
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
    subtotal,
    markup,
    total,
    missing,
  };
}
