/**
 * Submission pipeline contracts (D-5, ADR-011). Storage and notification sit behind these two
 * interfaces so Google Sheets / Telegram can later be replaced by a CRM or a server hosted in
 * Uzbekistan (data-localization review pending) without touching the submit logic.
 */

/** Lead lifecycle; the sales manager changes it by hand in the sheet ("Holat" dropdown). */
export const LEAD_STATUSES = [
  'Yangi',
  "Qo'ng'iroq qilindi",
  'Tasdiqlandi',
  'Ishlab chiqarishga berildi',
  'Bekor qilindi',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Delivery state of the Telegram notification ("Telegram holati" column). */
export type TelegramState = 'pending' | 'sent' | 'failed';

/** Cron retries a failed notification until this many attempts (including the first one). */
export const MAX_TELEGRAM_ATTEMPTS = 5;

/** One application (lead) = one sheet row. */
export interface LeadRecord {
  id: string;
  /** "2026-11-05 14:03:12" in Asia/Tashkent */
  createdAt: string;
  status: string;
  firstName: string;
  lastName: string;
  /** +998XXXXXXXXX */
  phone: string;
  /** "1360 × 1900 × 600" */
  sizeMm: string;
  corpus: string;
  door: string;
  sections: string;
  doors: string;
  kiosk: string;
  lang: string;
  telegram: TelegramState;
  managerNote: string;
  /** compact engine params JSON — with templateVersion it regenerates the full order draft */
  paramsJson: string;
  schemaVersion: string;
  templateVersion: string;
  engineVersion: string;
  idempotencyKey: string;
  telegramAttempts: number;
}

export interface StoredLead extends LeadRecord {
  /** store-specific row reference (sheet row number) */
  ref: number;
}

export interface LeadStore {
  findByKey(idempotencyKey: string): Promise<StoredLead | null>;
  hasId(id: string): Promise<boolean>;
  append(lead: LeadRecord): Promise<StoredLead>;
  updateTelegram(ref: number, state: TelegramState, attempts: number): Promise<void>;
  /** leads whose notification failed (or got stuck pending) and still have attempts left */
  listForRetry(): Promise<StoredLead[]>;
}

export interface Notifier {
  /** resolves when delivered; throws on any failure */
  notify(lead: LeadRecord, renderPng?: Uint8Array): Promise<void>;
}
