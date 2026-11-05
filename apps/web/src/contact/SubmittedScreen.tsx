import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18n';
import type { LeadSummary } from '../lead/summary';
import { Button } from '../ui/Button';
import { CheckIcon } from '../ui/icons';

/** Seconds until the kiosk returns to the start screen on its own. */
export const SUBMITTED_COUNTDOWN_S = 45;

interface Props {
  id: string;
  summary: LeadSummary;
  /** PNG data URL captured at submit time (absent when the capture failed) */
  renderPng?: string;
  onFinish: () => void;
}

/**
 * "Arizangiz yuborildi!" (D-5): the real application ID from the API, what happens next, the
 * render and a short summary. "Yakunlash" or the 45 s countdown -> full session reset.
 * No QR code yet: it needs a protected public page (later batch).
 */
export function SubmittedScreen({ id, summary, renderPng, onFinish }: Props) {
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

  const colors = [
    `${t('present.corpus')}: ${summary.corpus}`,
    ...(summary.door ? [`${t('present.door')}: ${summary.door}`] : []),
  ].join(' · ');

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
          <span className="muted">{t('submitted.id')}</span>
          <strong data-testid="submitted-id">{id}</strong>
        </p>
        <p className="submitted-text">{t('submitted.text')}</p>
        {renderPng && (
          <img className="submitted-render" src={renderPng} alt="" data-testid="submitted-render" />
        )}
        <p className="submitted-summary" data-testid="submitted-summary">
          {summary.sizeCm} · {colors}
        </p>
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
