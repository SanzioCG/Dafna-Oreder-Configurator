import { allMaterials, getMaterial, priceListDemo, type PriceList } from '@dafna/engine';
import { uz } from '../src/i18n/uz';
import type { PriceStore } from './prices';
import { serviceAccountJwt, type ServiceAccount } from './sheets';

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
  'Varaq uzunligi (mm)',
  'Varaq eni (mm)',
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
  rows.push(['yangilangan', '', 'Oxirgi saqlash (Toshkent)', updatedAt, '', '']);
  rows.push(['foyda_foiz', '', 'Foyda, umumiy qiymatdan %', list.markupPct, '', '']);
  rows.push(['ish_haqi_m2', '', 'Ish haqi, 1 m² plita uchun', list.laborPerM2, '', '']);
  rows.push(['kromka_m', '', 'Kromka, 1 metr', list.edgePerM, '', '']);
  for (const [type, v] of Object.entries(list.assembly ?? {}))
    rows.push(['yigish', type, "Yig'ish, 1 dona mahsulot", v, '', '']);
  for (const [id, s] of Object.entries(list.boardSheets ?? {}))
    rows.push(['list', id, boardName(id), s.price, s.lengthMm, s.widthMm]);
  for (const [id, v] of Object.entries(list.hardware)) rows.push(['furnitura', id, id, v, '', '']);
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
  };
  for (const r of rows.slice(1)) {
    const [type, code, , value, len, wid] = r;
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

export class GoogleSheetsPriceStore implements PriceStore {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private token: { value: string; exp: number } | null = null;
  private tabReady = false;

  constructor(private readonly config: PriceSheetConfig) {
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
    if (!meta.sheets?.some((s) => s.properties.title === PRICE_TAB)) {
      await this.api(':batchUpdate', {
        method: 'POST',
        body: { requests: [{ addSheet: { properties: { title: PRICE_TAB } } }] },
      });
    }
    this.tabReady = true;
  }

  private range(a1: string) {
    return encodeURIComponent(`${PRICE_TAB}!${a1}`);
  }

  async load() {
    await this.ensureTab();
    const data = await this.api<{ values?: unknown[][] }>(`/values/${this.range('A1:F')}`);
    return rowsToPriceList(data.values ?? []);
  }

  async save(list: PriceList, updatedAt: string) {
    await this.ensureTab();
    await this.api(`/values/${this.range('A1:F')}:clear`, { method: 'POST', body: {} });
    await this.api(`/values/${this.range('A1')}?valueInputOption=RAW`, {
      method: 'PUT',
      body: { values: priceListToRows(list, updatedAt) },
    });
  }
}
