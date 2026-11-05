// @vitest-environment node
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HEADERS, LAST_COLUMN, leadToRow } from './columns';
import { GoogleSheetsStore, parseServiceAccount, SHEET_TITLE } from './sheets';
import { TelegramNotifier, telegramText } from './telegram';
import { LEAD_STATUSES, type LeadRecord } from './types';

const LEAD: LeadRecord = {
  id: 'DFN-261105-K7QM',
  createdAt: '2026-11-05 14:03:12',
  status: 'Yangi',
  firstName: 'Aziz<b>',
  lastName: "G'ulomov",
  phone: '+998901234567',
  sizeMm: '1360 × 1900 × 600',
  corpus: 'Oq',
  door: 'Och eman',
  sections: '2 ta qism: 1) Shtanga + javon; 2) Javonlar',
  doors: '1) Ikki tabaqali; 2) Chap ilmoq',
  kiosk: 'chilonzor-1',
  lang: 'uz',
  telegram: 'pending',
  managerNote: '',
  paramsJson: '{"width":1360}',
  schemaVersion: 'dafna-order/0.3-draft',
  templateVersion: '0.5.0',
  engineVersion: 'abc1234',
  idempotencyKey: 'key-0123456789abcdef',
  telegramAttempts: 0,
};

/** the parts of a Sheets batchUpdate request the tests look at */
type SheetRequest = {
  setDataValidation?: {
    range: { startColumnIndex: number };
    rule: { strict: boolean; condition: { values: { userEnteredValue: string }[] } };
  };
  updateDimensionProperties?: { properties: { hiddenByUser: boolean } };
};

type Call = { url: string; method: string; body: unknown };

/** fetch fake: records calls, answers with the handler's JSON */
function fakeFetch(handler: (c: Call) => { status?: number; json: unknown }) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let body: unknown = init?.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        /* form-encoded */
      }
    }
    const call = { url, method: init?.method ?? 'GET', body };
    calls.push(call);
    const r = handler(call);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

describe('Telegram notifier', () => {
  it('message: ID, escaped name, tappable +998 phone, size, colours, interior, kiosk, status', () => {
    const text = telegramText(LEAD);
    expect(text).toContain('DFN-261105-K7QM');
    expect(text).toContain('Aziz&lt;b&gt;');
    expect(text).not.toContain('Aziz<b>');
    expect(text).toContain('+998901234567');
    expect(text).toContain('136 × 190 × 60 sm');
    expect(text).toContain('Korpus: Oq · Eshik: Och eman');
    expect(text).toContain('Shtanga + javon');
    expect(text).toContain('chilonzor-1');
    expect(text).toContain('Holat: <b>Yangi</b>');
  });

  it('with a render: sendPhoto with caption; without: sendMessage', async () => {
    const f = fakeFetch(() => ({ json: { ok: true } }));
    const n = new TelegramNotifier({ token: 'T0KEN', chatId: '-100', fetch: f.impl });
    await n.notify(LEAD, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    await n.notify(LEAD);
    expect(f.calls.map((c) => c.url.split('/').pop())).toEqual(['sendPhoto', 'sendMessage']);
    expect(f.calls[0]!.body).toBeInstanceOf(FormData);
    expect((f.calls[1]!.body as { chat_id: string }).chat_id).toBe('-100');
  });

  it('photo rejected -> falls back to text; Telegram error -> throws without the token', async () => {
    const f = fakeFetch((c) =>
      c.url.endsWith('sendPhoto') ? { status: 400, json: { ok: false } } : { json: { ok: true } },
    );
    await new TelegramNotifier({ token: 'T0KEN', chatId: '1', fetch: f.impl }).notify(
      LEAD,
      new Uint8Array([1]),
    );
    expect(f.calls.map((c) => c.url.split('/').pop())).toEqual(['sendPhoto', 'sendMessage']);

    const down = fakeFetch(() => ({
      status: 502,
      json: { ok: false, description: 'Bad Gateway' },
    }));
    const err = await new TelegramNotifier({ token: 'T0KEN', chatId: '1', fetch: down.impl })
      .notify(LEAD)
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain('T0KEN');
  });

  it('forceFail (preview-only failure simulation) never calls Telegram', async () => {
    const f = fakeFetch(() => ({ json: { ok: true } }));
    const n = new TelegramNotifier({ token: 'T', chatId: '1', fetch: f.impl, forceFail: true });
    await expect(n.notify(LEAD)).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });
});

describe('Google Sheets store', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = {
    client_email: 'kiosk@test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };

  function sheet(rows: unknown[][] = [], header: string[] = HEADERS) {
    return fakeFetch((c) => {
      if (c.url.startsWith('https://oauth2'))
        return { json: { access_token: 'AT', expires_in: 3600 } };
      if (c.url.includes('?fields=sheets')) {
        return { json: { sheets: [{ properties: { sheetId: 7, title: SHEET_TITLE } }] } };
      }
      if (c.url.includes(encodeURIComponent(`${SHEET_TITLE}!A1:`)) && c.method === 'GET') {
        return { json: { values: [header] } };
      }
      if (c.url.includes(':append')) {
        return {
          json: {
            updates: { updatedRange: `${SHEET_TITLE}!A${rows.length + 2}:U${rows.length + 2}` },
          },
        };
      }
      if (c.method === 'GET') return { json: { values: rows } };
      return { json: {} };
    });
  }

  it('service account JSON: parsed, escaped newlines in the key restored', () => {
    const raw = JSON.stringify({
      ...account,
      private_key: account.private_key.replace(/\n/g, '\\n'),
    });
    expect(parseServiceAccount(raw)?.private_key).toBe(account.private_key);
    expect(parseServiceAccount('{')).toBeNull();
    expect(parseServiceAccount(undefined)).toBeNull();
  });

  it('append: one RAW row in column order, row reference from the API', async () => {
    const f = sheet();
    const store = new GoogleSheetsStore({ sheetId: 'S1', account, fetch: f.impl });
    const stored = await store.append(LEAD);
    expect(stored.ref).toBe(2);
    const append = f.calls.find((c) => c.url.includes(':append'))!;
    expect(append.url).toContain('valueInputOption=RAW');
    expect((append.body as { values: unknown[][] }).values[0]![0]).toBe(LEAD.id);
    expect((append.body as { values: unknown[][] }).values[0]![5]).toBe('+998901234567');
    expect(f.calls.every((c) => !c.url.includes('oauth2') || c.method === 'POST')).toBe(true);
    // header already correct: no rewrite
    expect(f.calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('setup: header, frozen row, "Holat" dropdown with the 5 statuses, hidden technical columns', async () => {
    const f = sheet([], []);
    const store = new GoogleSheetsStore({ sheetId: 'S1', account, fetch: f.impl });
    expect(await store.ensureSchema()).toEqual({ created: false, headerWritten: true });
    const put = f.calls.find((c) => c.method === 'PUT')!;
    expect((put.body as { values: string[][] }).values[0]).toEqual(HEADERS);
    const batch = f.calls.find((c) => c.url.endsWith(':batchUpdate'))!;
    const requests = (batch.body as { requests: SheetRequest[] }).requests;
    const validation = requests.find((r) => r.setDataValidation)!.setDataValidation!;
    expect(validation.range.startColumnIndex).toBe(2); // column C = Holat
    expect(
      validation.rule.condition.values.map((v: { userEnteredValue: string }) => v.userEnteredValue),
    ).toEqual([...LEAD_STATUSES]);
    expect(validation.rule.strict).toBe(true);
    expect(requests.some((r) => r.updateDimensionProperties?.properties.hiddenByUser)).toBe(true);
  });

  it('idempotency lookup, Telegram bookkeeping and retry selection read the sheet', async () => {
    const row = (over: Partial<LeadRecord>) => leadToRow({ ...LEAD, ...over });
    const f = sheet([
      row({ id: 'DFN-261105-AAAA', telegram: 'sent', telegramAttempts: 1 }),
      row({
        id: 'DFN-261105-BBBB',
        idempotencyKey: 'k2-0123456789abcd',
        telegram: 'failed',
        telegramAttempts: 2,
      }),
      row({
        id: 'DFN-261105-CCCC',
        idempotencyKey: 'k3-0123456789abcd',
        telegram: 'failed',
        telegramAttempts: 5,
      }),
      row({
        id: 'DFN-261105-DDDD',
        idempotencyKey: 'k4-0123456789abcd',
        telegram: 'pending',
        createdAt: '2026-11-05 14:00:00',
      }),
      row({
        id: 'DFN-261105-EEEE',
        idempotencyKey: 'k5-0123456789abcd',
        telegram: 'pending',
        createdAt: '2026-11-05 14:09:30',
      }),
    ]);
    const store = new GoogleSheetsStore({
      sheetId: 'S1',
      account,
      fetch: f.impl,
      now: () => new Date('2026-11-05T09:10:00Z'), // 14:10:00 Tashkent
    });
    expect((await store.findByKey('k2-0123456789abcd'))?.ref).toBe(3);
    expect(await store.findByKey('nope-0123456789ab')).toBeNull();
    expect(await store.hasId('DFN-261105-AAAA')).toBe(true);
    // failed with attempts left + pending stuck > 2 min; not exhausted, not fresh pending
    expect((await store.listForRetry()).map((l) => l.id)).toEqual([
      'DFN-261105-BBBB',
      'DFN-261105-DDDD',
    ]);
    await store.updateTelegram(3, 'sent', 3);
    const upd = f.calls.find((c) => c.url.endsWith('/values:batchUpdate'))!;
    expect((upd.body as { data: { range: string; values: unknown[][] }[] }).data).toEqual([
      { range: `${SHEET_TITLE}!N3`, values: [['sent']] },
      { range: `${SHEET_TITLE}!U3`, values: [[3]] },
    ]);
    expect(LAST_COLUMN).toBe('U');
  });
});
