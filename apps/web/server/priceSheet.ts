import { allMaterials, getMaterial, priceListDemo, type PriceList } from '@dafna/engine';
import { uz } from '../src/i18n/uz';
import type { PriceStore } from './prices';
import { serviceAccountJwt, type ServiceAccount } from './sheets';
import {
  TAB_FORMAT_KEY,
  TAB_FORMAT_VERSION,
  TAB_PROTECTION,
  tabFormatRequests,
  type TabLook,
} from './sheetFormat';

/**
 * D-19: the price list in the Google Sheet, tab "Narxlar", as a readable table (one row per
 * price) that the server reads back. The manager page rewrites the whole tab on every save.
 *
 *   Turi | Kod | Nomi | Narx (so'm) | Varaq uzunligi (mm) | Varaq eni (mm)
 */
export const PRICE_TAB = 'Narxlar';
export const PRICE_HEADER = [
  'Turi',
  'Kod',
  'Nomi',
  "Narx (so'm)",
  'Varaq uzunligi (mm) / hisob turi',
  'Varaq eni (mm) / mahsulotlar',
  'ERP kodi',
];

type Row = (string | number)[];

const boardName = (id: string) => {
  const m = getMaterial(allMaterials, id);
  if (!m) return id;
  const decor = (uz as Record<string, string>)[m.decorName] ?? m.decorName;
  return [m.code, decor, `${m.thicknessMm} mm`].filter(Boolean).join(' · ');
};

/** PriceList -> sheet rows (header first). */
export function priceListToRows(list: PriceList, updatedAt: string): Row[] {
  const rows: Row[] = [PRICE_HEADER];
  rows.push(['yangilangan', '', 'Oxirgi saqlash (Toshkent)', updatedAt, '', '', '']);
  rows.push(['foyda_foiz', '', 'Foyda, umumiy qiymatdan %', list.markupPct, '', '', '']);
  rows.push(['ish_haqi_m2', '', 'Ish haqi, 1 m² plita uchun', list.laborPerM2, '', '', '']);
  rows.push(['kromka_m', '', 'Kromka, 1 metr', list.edgePerM, '', '', '']);
  const erp = (id: string) => list.erpCodes?.[id] ?? '';
  for (const [type, v] of Object.entries(list.assembly ?? {}))
    rows.push(['yigish', type, "Yig'ish, 1 dona mahsulot", v, '', '', '']);
  for (const [id, s] of Object.entries(list.boardSheets ?? {}))
    rows.push(['list', id, boardName(id), s.price, s.lengthMm, s.widthMm, erp(id)]);
  for (const [id, v] of Object.entries(list.hardware))
    rows.push(['furnitura', id, id, v, '', '', erp(id)]);
  // a 1C code of an item without a price row yet
  for (const [id, code] of Object.entries(list.erpCodes ?? {}))
    if (!list.boardSheets?.[id] && list.hardware[id] === undefined)
      rows.push(['erp_kod', id, id, '', '', '', code]);
  for (const sv of list.services ?? [])
    rows.push(['xizmat', sv.id, sv.name, sv.price, sv.basis, sv.products.join(','), '']);
  // D-32: the group of a 1C kind (material / hardware / other) in the value column
  for (const [key, g] of Object.entries(list.erpKindGroups ?? {}))
    rows.push(['erp_tur', key, '1C turi guruhi', g, '', '', '']);
  return rows;
}

const num = (x: unknown) => {
  const n = typeof x === 'number' ? x : Number(String(x ?? '').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

/** Sheet rows -> PriceList (null when the tab holds no saved list). */
export function rowsToPriceList(rows: unknown[][]): { list: PriceList; updatedAt: string } | null {
  let updatedAt = '';
  const list: PriceList = {
    ...priceListDemo,
    demo: false,
    boardSheets: {},
    assembly: {},
    hardware: { ...priceListDemo.hardware },
    services: [],
    erpCodes: {},
    erpKindGroups: {},
  };
  const BASES = ['m2', 'edge_m', 'product', 'pct', 'manual_m'] as const;
  for (const r of rows.slice(1)) {
    const [type, code, name, value, len, wid, erpCode] = r;
    if (code && erpCode) list.erpCodes![String(code)] = String(erpCode);
    const v = num(value);
    const id = String(code ?? '');
    switch (type) {
      case 'yangilangan':
        updatedAt = String(value ?? '');
        break;
      case 'foyda_foiz':
        if (v >= 0) list.markupPct = v;
        break;
      case 'ish_haqi_m2':
        if (v >= 0) list.laborPerM2 = v;
        break;
      case 'kromka_m':
        if (v >= 0) list.edgePerM = v;
        break;
      case 'yigish':
        if (id && v >= 0) list.assembly![id] = v;
        break;
      case 'list':
        if (id && v >= 0 && num(len) > 0 && num(wid) > 0)
          list.boardSheets![id] = { price: v, lengthMm: num(len), widthMm: num(wid) };
        break;
      case 'furnitura':
        if (id && v >= 0) list.hardware[id] = v;
        break;
      case 'erp_tur': {
        const g = String(value ?? '').trim();
        if (id && (g === 'material' || g === 'hardware' || g === 'other'))
          list.erpKindGroups![id] = g;
        break;
      }
      case 'xizmat': {
        const basis = BASES.find((b) => b === len);
        if (id && v >= 0 && basis)
          list.services!.push({
            id,
            name: String(name ?? id),
            basis,
            products: String(wid ?? '')
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean),
            price: v,
          });
        break;
      }
    }
  }
  if (!updatedAt) return null;
  list.priceListVersion = `live-${updatedAt}`;
  return { list, updatedAt };
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface PriceSheetConfig {
  sheetId: string;
  account: ServiceAccount;
  fetch?: typeof fetch;
  now?: () => Date;
}

/** One tab of the spreadsheet, read and rewritten whole (REST API v4, no SDK). */
export class SheetTab {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private token: { value: string; exp: number } | null = null;
  private tabReady = false;
  private formatChecked = false;

  constructor(
    private readonly config: PriceSheetConfig,
    private readonly title: string,
    /** D-46: the tab's look (header, zebra, widths, hidden columns), applied once */
    private readonly look?: TabLook,
  ) {
    this.fetchImpl = config.fetch ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  private async accessToken(): Promise<string> {
    const nowSec = Math.floor(this.now().getTime() / 1000);
    if (this.token && this.token.exp - 60 > nowSec) return this.token.value;
    const res = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: serviceAccountJwt(this.config.account, nowSec),
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
    } | null;
    if (!res.ok || !data?.access_token) throw new Error(`google auth failed: ${res.status}`);
    this.token = { value: data.access_token, exp: nowSec + (data.expires_in ?? 3600) };
    return data.access_token;
  }

  private async api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await this.fetchImpl(`${API}/${this.config.sheetId}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${await this.accessToken()}`,
        'content-type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok)
      throw new Error(`sheets ${init.method ?? 'GET'} ${path.split('?')[0]}: ${res.status}`);
    return (await res.json()) as T;
  }

  /** creates the tab on the first use (reading a missing tab is a 400) */
  private async ensureTab(): Promise<void> {
    if (this.tabReady) return;
    const meta = await this.api<{ sheets?: { properties: { title: string } }[] }>(
      '?fields=sheets(properties(title))',
    );
    if (!meta.sheets?.some((s) => s.properties.title === this.title)) {
      await this.api(':batchUpdate', {
        method: 'POST',
        body: { requests: [{ addSheet: { properties: { title: this.title } } }] },
      });
    }
    this.tabReady = true;
  }

  private range(a1: string) {
    return encodeURIComponent(`${this.title}!${a1}`);
  }

  async read(): Promise<unknown[][]> {
    await this.ensureTab();
    const data = await this.api<{ values?: unknown[][] }>(`/values/${this.range('A1:Z')}`);
    return data.values ?? [];
  }

  async write(rows: (string | number | boolean)[][]): Promise<void> {
    await this.ensureTab();
    await this.api(`/values/${this.range('A1:Z')}:clear`, { method: 'POST', body: {} });
    await this.api(`/values/${this.range('A1')}?valueInputOption=RAW`, {
      method: 'PUT',
      body: { values: rows },
    });
    await this.ensureFormat(rows[0]?.length ?? 1);
  }

  /**
   * D-46: the tab's look, once (developer metadata). Never fails a save: a formatting error is
   * swallowed - the data is already written.
   */
  private async ensureFormat(columnCount: number): Promise<void> {
    if (!this.look || this.formatChecked) return;
    try {
      const meta = await this.api<{
        sheets?: {
          properties: { sheetId: number; title: string };
          developerMetadata?: { metadataId: number; metadataKey: string; metadataValue: string }[];
          bandedRanges?: { bandedRangeId: number }[];
          protectedRanges?: { protectedRangeId: number; description?: string }[];
        }[];
      }>(
        '?fields=sheets(properties(sheetId,title),developerMetadata(metadataId,metadataKey,metadataValue),bandedRanges(bandedRangeId),protectedRanges(protectedRangeId,description))',
      );
      const own = meta.sheets?.find((s) => s.properties.title === this.title);
      if (!own) return;
      const marks = (own.developerMetadata ?? []).filter((m) => m.metadataKey === TAB_FORMAT_KEY);
      if (marks.some((m) => m.metadataValue === TAB_FORMAT_VERSION)) {
        this.formatChecked = true;
        return;
      }
      await this.api(':batchUpdate', {
        method: 'POST',
        body: {
          requests: tabFormatRequests(
            own.properties.sheetId,
            columnCount,
            {
              bandedRangeIds: (own.bandedRanges ?? []).map((b) => b.bandedRangeId),
              protectedRangeIds: (own.protectedRanges ?? [])
                .filter((p) => p.description === TAB_PROTECTION)
                .map((p) => p.protectedRangeId),
              metadataIds: marks.map((m) => m.metadataId),
            },
            this.look,
          ),
        },
      });
      this.formatChecked = true;
    } catch {
      // the look is cosmetic: the next save tries again
    }
  }
}

export class GoogleSheetsPriceStore implements PriceStore {
  private readonly tab: SheetTab;
  constructor(config: PriceSheetConfig) {
    this.tab = new SheetTab(config, PRICE_TAB, {
      widths: [110, 170, 280, 120, 100, 160, 140],
    });
  }
  async load() {
    return rowsToPriceList(await this.tab.read());
  }
  async save(list: PriceList, updatedAt: string) {
    await this.tab.write(priceListToRows(list, updatedAt));
  }
}
