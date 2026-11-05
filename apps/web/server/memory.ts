import {
  MAX_TELEGRAM_ATTEMPTS,
  type LeadRecord,
  type LeadStore,
  type Notifier,
  type StoredLead,
  type TelegramState,
} from './types';

/** In-memory LeadStore: tests and local development (no Google account needed). */
export class MemoryLeadStore implements LeadStore {
  readonly rows: StoredLead[] = [];
  failAppend = false;

  async findByKey(key: string) {
    return this.rows.find((r) => r.idempotencyKey === key) ?? null;
  }
  async hasId(id: string) {
    return this.rows.some((r) => r.id === id);
  }
  async append(lead: LeadRecord) {
    if (this.failAppend) throw new Error('memory store: append failed');
    const row = { ...lead, ref: this.rows.length + 2 };
    this.rows.push(row);
    return row;
  }
  async updateTelegram(ref: number, state: TelegramState, attempts: number) {
    const row = this.rows.find((r) => r.ref === ref);
    if (row) {
      row.telegram = state;
      row.telegramAttempts = attempts;
    }
  }
  async listForRetry() {
    return this.rows.filter(
      (r) => r.telegram === 'failed' && r.telegramAttempts < MAX_TELEGRAM_ATTEMPTS,
    );
  }
}

/** Notifier fake: records deliveries; `failing` makes every call throw. */
export class FakeNotifier implements Notifier {
  readonly sent: { lead: LeadRecord; png?: Uint8Array }[] = [];
  failing = false;
  calls = 0;

  async notify(lead: LeadRecord, png?: Uint8Array) {
    this.calls += 1;
    if (this.failing) throw new Error('fake notifier: failure');
    this.sent.push({ lead, png });
  }
}
