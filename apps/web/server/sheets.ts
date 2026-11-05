import { createSign } from 'node:crypto';
import {
  COLUMNS,
  FIRST_TECHNICAL_COLUMN_INDEX,
  HEADERS,
  LAST_COLUMN,
  STATUS_COLUMN_INDEX,
  TELEGRAM_COLUMN_INDEX,
  columnLetter,
  leadToRow,
  rowToLead,
} from './columns';
import { parseTashkentTimestamp } from './ids';
import {
  LEAD_STATUSES,
  MAX_TELEGRAM_ATTEMPTS,
  type LeadRecord,
  type LeadStore,
  type StoredLead,
  type TelegramState,
} from './types';

export const SHEET_TITLE = 'Arizalar';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
/** a notification still "pending" after this long is treated as stuck and retried */
export const STUCK_PENDING_MS = 2 * 60 * 1000;

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/** Parses GOOGLE_SERVICE_ACCOUNT_JSON (the downloaded key file, as one JSON string). */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ServiceAccount>;
    if (typeof v.client_email !== 'string' || typeof v.private_key !== 'string') return null;
    return { client_email: v.client_email, private_key: v.private_key.replace(/\\n/g, '\n') };
  } catch {
    return null;
  }
}

const b64url = (s: string | Buffer) =>
  Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Signed JWT for the OAuth 2.0 service-account flow (RS256), no SDK needed. */
export function serviceAccountJwt(sa: ServiceAccount, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
}

export interface SheetsConfig {
  sheetId: string;
  account: ServiceAccount;
  fetch?: typeof fetch;
  now?: () => Date;
}

/** Google Sheets implementation of LeadStore (REST API v4, one tab "Arizalar"). */
export class GoogleSheetsStore implements LeadStore {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private token: { value: string; exp: number } | null = null;
  private schemaChecked = false;

  constructor(private readonly config: SheetsConfig) {
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

  private range(a1: string) {
    return encodeURIComponent(`${SHEET_TITLE}!${a1}`);
  }

  /** All data rows (row 2…) with their sheet row numbers. */
  private async rows(): Promise<StoredLead[]> {
    const data = await this.api<{ values?: unknown[][] }>(
      `/values/${this.range(`A2:${LAST_COLUMN}`)}`,
    );
    return (data.values ?? []).map((row, i) => ({ ...rowToLead(row), ref: i + 2 }));
  }

  async findByKey(key: string): Promise<StoredLead | null> {
    return (await this.rows()).find((r) => r.idempotencyKey === key) ?? null;
  }

  async hasId(id: string): Promise<boolean> {
    return (await this.rows()).some((r) => r.id === id);
  }

  async append(lead: LeadRecord): Promise<StoredLead> {
    if (!this.schemaChecked) {
      await this.ensureSchema();
      this.schemaChecked = true;
    }
    const res = await this.api<{ updates?: { updatedRange?: string } }>(
      `/values/${this.range(`A:${LAST_COLUMN}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: { values: [leadToRow(lead)] } },
    );
    const m = /![A-Z]+(\d+)/.exec(res.updates?.updatedRange ?? '');
    if (!m) throw new Error('sheets append: no row reference');
    return { ...lead, ref: Number(m[1]) };
  }

  async updateTelegram(ref: number, state: TelegramState, attempts: number): Promise<void> {
    const status = columnLetter(TELEGRAM_COLUMN_INDEX);
    const attemptsCol = columnLetter(COLUMNS.findIndex((c) => c.key === 'telegramAttempts'));
    await this.api(`/values:batchUpdate`, {
      method: 'POST',
      body: {
        valueInputOption: 'RAW',
        data: [
          { range: `${SHEET_TITLE}!${status}${ref}`, values: [[state]] },
          { range: `${SHEET_TITLE}!${attemptsCol}${ref}`, values: [[attempts]] },
        ],
      },
    });
  }

  async listForRetry(): Promise<StoredLead[]> {
    const now = this.now().getTime();
    return (await this.rows()).filter((r) => {
      if (!r.id || r.telegramAttempts >= MAX_TELEGRAM_ATTEMPTS) return false;
      if (r.telegram === 'failed') return true;
      if (r.telegram !== 'pending') return false;
      const created = parseTashkentTimestamp(r.createdAt).getTime();
      return Number.isFinite(created) && now - created > STUCK_PENDING_MS;
    });
  }

  /**
   * Idempotent sheet setup: tab "Arizalar", header row (bold, frozen), "Holat" dropdown with the
   * five lead statuses, technical columns hidden. Run by the setup script and before the first
   * append of every server instance (cheap when the header is already right).
   */
  async ensureSchema(): Promise<{ created: boolean; headerWritten: boolean }> {
    const meta = await this.api<{ sheets?: { properties: { sheetId: number; title: string } }[] }>(
      '?fields=sheets.properties(sheetId,title)',
    );
    let tab = meta.sheets?.find((s) => s.properties.title === SHEET_TITLE)?.properties.sheetId;
    let created = false;
    if (tab === undefined) {
      const res = await this.api<{ replies: { addSheet: { properties: { sheetId: number } } }[] }>(
        ':batchUpdate',
        {
          method: 'POST',
          body: { requests: [{ addSheet: { properties: { title: SHEET_TITLE } } }] },
        },
      );
      tab = res.replies[0]?.addSheet.properties.sheetId;
      created = true;
    }
    if (tab === undefined) throw new Error('sheets: tab not available');
    const head = await this.api<{ values?: unknown[][] }>(
      `/values/${this.range(`A1:${LAST_COLUMN}1`)}`,
    );
    const current = (head.values?.[0] ?? []).map(String);
    if (!created && HEADERS.every((h, i) => current[i] === h))
      return { created, headerWritten: false };

    await this.api(`/values/${this.range(`A1:${LAST_COLUMN}1`)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: { values: [HEADERS] },
    });
    await this.api(':batchUpdate', {
      method: 'POST',
      body: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId: tab, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
          {
            repeatCell: {
              range: { sheetId: tab, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: 'userEnteredFormat.textFormat.bold',
            },
          },
          {
            setDataValidation: {
              range: {
                sheetId: tab,
                startRowIndex: 1,
                startColumnIndex: STATUS_COLUMN_INDEX,
                endColumnIndex: STATUS_COLUMN_INDEX + 1,
              },
              rule: {
                condition: {
                  type: 'ONE_OF_LIST',
                  values: LEAD_STATUSES.map((v) => ({ userEnteredValue: v })),
                },
                strict: true,
                showCustomUi: true,
              },
            },
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId: tab,
                dimension: 'COLUMNS',
                startIndex: FIRST_TECHNICAL_COLUMN_INDEX,
                endIndex: COLUMNS.length,
              },
              properties: { hiddenByUser: true },
              fields: 'hiddenByUser',
            },
          },
        ],
      },
    });
    return { created, headerWritten: true };
  }
}
