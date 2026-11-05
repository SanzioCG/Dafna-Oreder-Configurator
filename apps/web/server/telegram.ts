import type { LeadRecord, Notifier } from './types';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Telegram message for a new application (HTML parse mode). The phone is written as
 * +998XXXXXXXXX so Telegram turns it into a tappable number. Customer input is escaped.
 */
export function telegramText(lead: LeadRecord): string {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
  const [w, h, d] = lead.sizeMm.split(' × ').map((x) => Math.round(Number(x) / 10));
  const sizeCm = [w, h, d].every((x) => Number.isFinite(x)) ? `${w} × ${h} × ${d} sm` : '';
  const colors =
    `Korpus: ${lead.corpus}` + (lead.door && lead.door !== '—' ? ` · Eshik: ${lead.door}` : '');
  return [
    `🆕 <b>Yangi ariza ${escapeHtml(lead.id)}</b>`,
    `👤 ${escapeHtml(name)}`,
    `📞 ${escapeHtml(lead.phone)}`,
    `📐 ${escapeHtml(sizeCm)} (${escapeHtml(lead.sizeMm)} mm)`,
    `🎨 ${escapeHtml(colors)}`,
    `🗄 ${escapeHtml(lead.sections)}`,
    `🚪 Eshiklar: ${escapeHtml(lead.doors)}`,
    `📍 Kiosk: ${escapeHtml(lead.kiosk || '—')} · Til: ${escapeHtml(lead.lang)}`,
    `Holat: <b>${escapeHtml(lead.status)}</b>`,
  ].join('\n');
}

/** Telegram photo captions are limited to 1024 characters. */
const CAPTION_LIMIT = 1024;

export interface TelegramConfig {
  token: string;
  chatId: string;
  fetch?: typeof fetch;
  /** non-production only: every call fails (verifies the failure + retry path) */
  forceFail?: boolean;
}

export class TelegramNotifier implements Notifier {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: TelegramConfig) {
    this.fetchImpl = config.fetch ?? fetch;
  }

  private async call(method: string, body: BodyInit, headers?: Record<string, string>) {
    if (this.config.forceFail) throw new Error('telegram: forced failure (TELEGRAM_FORCE_FAIL)');
    const res = await this.fetchImpl(`https://api.telegram.org/bot${this.config.token}/${method}`, {
      method: 'POST',
      body,
      headers,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
    } | null;
    // never include the URL (it contains the token) in errors
    if (!res.ok || !data?.ok)
      throw new Error(`telegram ${method}: ${res.status} ${data?.description ?? ''}`.trim());
  }

  async notify(lead: LeadRecord, renderPng?: Uint8Array): Promise<void> {
    const text = telegramText(lead);
    if (renderPng && text.length <= CAPTION_LIMIT) {
      const form = new FormData();
      form.append('chat_id', this.config.chatId);
      form.append('caption', text);
      form.append('parse_mode', 'HTML');
      form.append(
        'photo',
        new Blob([renderPng as BlobPart], { type: 'image/png' }),
        `${lead.id}.png`,
      );
      try {
        await this.call('sendPhoto', form);
        return;
      } catch {
        // the photo is a bonus: fall back to the text message
      }
    }
    await this.call(
      'sendMessage',
      JSON.stringify({ chat_id: this.config.chatId, text, parse_mode: 'HTML' }),
      { 'content-type': 'application/json' },
    );
  }
}
