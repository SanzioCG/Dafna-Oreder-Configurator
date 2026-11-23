import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18n';
import type { LeadSummary } from '../lead/summary';
import { Button } from '../ui/Button';
import { QrCode } from '../ui/QrCode';
import { CheckIcon } from '../ui/icons';

/** Seconds until the kiosk returns to the start screen on its own. */
export const SUBMITTED_COUNTDOWN_S = 45;

interface Props {
  id: string;
  summary: LeadSummary;
  /** PNG data URL captured at submit time (absent when the capture failed) */
  renderPng?: string;
  /** D-12: "/api/assembly?id=…&t=…" -> QR code for the customer's phone */
  assemblyPath?: string;
  /**
   * D-25: a multi-product order - every product with its application ID, a one-line summary
   * and its assembly instructions link (QR each); `id` is then the order ID.
   */
  items?: { id: string; name: string; line: string; quantity: number; assemblyPath?: string }[];
  onFinish: () => void;
}

/**
 * "Arizangiz yuborildi!" (D-5): the real application ID from the API, what happens next, the
 * render and a short summary. "Yakunlash" or the 45 s countdown -> full session reset.
 * D-12: a QR code to the assembly instructions PDF (signed link, no personal data in it).
 */
export function SubmittedScreen({
  id,
  summary,
  renderPng,
  assemblyPath,
  items = [],
  onFinish,
}: Props) {
  const multi = items.length > 1;
  const { t } = useI18n();
  const [left, setLeft] = useState(SUBMITTED_COUNTDOWN_S);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    buttonRef.current?.focus();
    const started = Date.now();
    const timer = window.setInterval(() => {
      const remaining = SUBMITTED_COUNTDOWN_S - Math.floor((Date.now() - started) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        window.clearInterval(timer);
        finishRef.current();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const colors = summary.colorsLine;

  return (
    <div
      className="submitted-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submitted-title"
      data-testid="submitted-screen"
    >
      <div className="submitted-card">
        <span className="submitted-badge" aria-hidden>
          <CheckIcon />
        </span>
        <h2 id="submitted-title">{t('submitted.title')}</h2>
        <p className="submitted-id">
          <span className="muted">{t(multi ? 'submitted.orderId' : 'submitted.id')}</span>
          <strong data-testid="submitted-id">{id}</strong>
        </p>
        <p className="submitted-text">{t('submitted.text')}</p>
        {renderPng && (
          <img className="submitted-render" src={renderPng} alt="" data-testid="submitted-render" />
        )}
        {multi ? (
          <ul className="submitted-items" data-testid="submitted-items">
            {items.map((it) => (
              <li key={it.id} className="submitted-item">
                {it.assemblyPath && (
                  <QrCode
                    value={new URL(it.assemblyPath, window.location.origin).href}
                    label={t('submitted.qr')}
                  />
                )}
                <p>
                  <strong>
                    {it.name}
                    {it.quantity > 1 ? ` × ${it.quantity}` : ''}
                  </strong>
                  <span className="muted">
                    {it.id} · {it.line}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="submitted-summary" data-testid="submitted-summary">
            {summary.sizeCm} · {colors}
          </p>
        )}
        {multi && <p className="muted">{t('submitted.qrEach')}</p>}
        {!multi && assemblyPath && (
          <div className="submitted-qr" data-testid="submitted-qr">
            <QrCode
              value={new URL(assemblyPath, window.location.origin).href}
              label={t('submitted.qr')}
            />
            <p>
              <strong>{t('submitted.qr')}</strong>
              <span className="muted">{t('submitted.qrHint')}</span>
            </p>
          </div>
        )}
        <Button
          ref={buttonRef}
          variant="primary"
          large
          wide
          onClick={onFinish}
          data-testid="submitted-finish"
        >
          {t('submitted.finish')}
        </Button>
        <p className="muted submitted-countdown" aria-live="off" data-testid="submitted-countdown">
          {t('submitted.countdown', { s: left })}
        </p>
      </div>
    </div>
  );
}
