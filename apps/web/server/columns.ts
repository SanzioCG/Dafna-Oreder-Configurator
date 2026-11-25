import type { LeadRecord, TelegramState } from './types';

/**
 * Sheet columns, in order (A…U). The first 19 are the approved layout; the last two are
 * technical (idempotency and retry bookkeeping) and hidden by the setup script.
 * Changing this order breaks existing sheets: only ever append new columns at the end.
 */
export const COLUMNS: { key: keyof LeadRecord; header: string }[] = [
  { key: 'id', header: 'ID' },
  { key: 'createdAt', header: 'Sana (Asia/Tashkent)' },
  { key: 'status', header: 'Holat' },
  { key: 'firstName', header: 'Ism' },
  { key: 'lastName', header: 'Familiya' },
  { key: 'phone', header: 'Telefon' },
  { key: 'sizeMm', header: "O'lcham W×H×D mm" },
  { key: 'corpus', header: 'Korpus' },
  { key: 'door', header: 'Eshik' },
  { key: 'sections', header: 'Qismlar + ichki' },
  { key: 'doors', header: 'Eshiklar' },
  { key: 'kiosk', header: 'Filial/Kiosk' },
  { key: 'lang', header: 'Til' },
  { key: 'telegram', header: 'Telegram holati' },
  { key: 'managerNote', header: 'Menejer izohi' },
  { key: 'paramsJson', header: 'params JSON' },
  { key: 'schemaVersion', header: 'schemaVersion' },
  { key: 'templateVersion', header: 'templateVersion' },
  { key: 'engineVersion', header: 'engineVersion' },
  { key: 'idempotencyKey', header: 'idempotencyKey' },
  { key: 'telegramAttempts', header: 'Telegram urinishlar' },
  // D-8 (appended: existing sheets keep their columns)
  { key: 'product', header: 'Mahsulot' },
  { key: 'templateId', header: 'templateId' },
  // D-25: several products in one order (appended: existing sheets keep their columns)
  { key: 'orderId', header: 'Buyurtma' },
  { key: 'orderItem', header: 'Buyurtmada' },
  { key: 'quantity', header: 'Soni' },
  // D-47: who changed the status on the manager page (appended: existing sheets keep theirs)
  { key: 'manager', header: 'Menejer' },
];

export const HEADERS = COLUMNS.map((c) => c.header);
export const STATUS_COLUMN_INDEX = COLUMNS.findIndex((c) => c.key === 'status');
export const TELEGRAM_COLUMN_INDEX = COLUMNS.findIndex((c) => c.key === 'telegram');

/** "A".."Z", "AA".."ZZ" for a 0-based column index (D-47: "Menejer" is the 27th, "AA"). */
export function columnLetter(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 701)
    throw new Error(`column index out of range: ${index}`);
  const last = String.fromCharCode(65 + (index % 26));
  return index < 26 ? last : String.fromCharCode(64 + Math.floor(index / 26)) + last;
}
export const LAST_COLUMN = columnLetter(COLUMNS.length - 1);

/** Google Sheets cell limit is 50 000 characters; params JSON stays far below it. */
export const CELL_LIMIT = 50_000;

export function leadToRow(lead: LeadRecord): (string | number)[] {
  return COLUMNS.map(({ key }) => {
    const v = lead[key];
    if (typeof v === 'number') return v;
    const s = String(v ?? '');
    if (s.length > CELL_LIMIT) throw new Error(`cell too long: ${String(key)}`);
    return s;
  });
}

const TELEGRAM_STATES: TelegramState[] = ['pending', 'sent', 'failed'];

export function rowToLead(row: unknown[]): LeadRecord {
  const cell = (i: number) => (row[i] === undefined || row[i] === null ? '' : String(row[i]));
  const out: Record<string, string | number> = {};
  COLUMNS.forEach(({ key }, i) => {
    out[key] = cell(i);
  });
  const attempts = Number(out.telegramAttempts);
  // D-25: rows written before the order columns existed are single products, one piece
  const quantity = Number(out.quantity);
  const telegram = TELEGRAM_STATES.includes(out.telegram as TelegramState)
    ? (out.telegram as TelegramState)
    : 'failed';
  return {
    ...(out as unknown as LeadRecord),
    telegram,
    telegramAttempts: Number.isFinite(attempts) ? attempts : 0,
    quantity: Number.isInteger(quantity) && quantity >= 1 ? quantity : 1,
  };
}
