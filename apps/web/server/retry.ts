import { MAX_TELEGRAM_ATTEMPTS, type LeadStore, type Notifier } from './types';

export interface RetryReport {
  checked: number;
  sent: number;
  failed: number;
}

/**
 * Cron job (daily on Vercel Hobby; any scheduler may call it more often): re-sends failed (or stuck pending) Telegram notifications, at most
 * MAX_TELEGRAM_ATTEMPTS per lead in total. The render image is not stored, so a retry is text only.
 */
export async function retryNotifications(
  store: LeadStore,
  notifier: Notifier,
): Promise<RetryReport> {
  const leads = await store.listForRetry();
  const report: RetryReport = { checked: leads.length, sent: 0, failed: 0 };
  for (const lead of leads) {
    if (lead.telegramAttempts >= MAX_TELEGRAM_ATTEMPTS) continue;
    const attempts = lead.telegramAttempts + 1;
    try {
      await notifier.notify(lead);
      await store.updateTelegram(lead.ref, 'sent', attempts);
      report.sent += 1;
    } catch {
      await store.updateTelegram(lead.ref, 'failed', attempts).catch(() => {});
      report.failed += 1;
    }
  }
  return report;
}
