import type { Params } from '@dafna/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18n';
import {
  newIdempotencyKey,
  submitApplication,
  type SubmitErrorCode,
  type SubmitOutcome,
  type SubmitRequest,
} from '../lead/api';
import {
  cleanContact,
  validateContact,
  type ContactErrors,
  type ContactField,
  type ContactInput,
} from '../lead/contact';
import { PHONE_COUNTRY_CODE, formatPhoneDigits, normalizePhoneDigits } from '../lead/phone';
import { Button } from '../ui/Button';
import { ArrowLeftIcon, CheckIcon, CloseIcon, SpinnerIcon, WarningIcon } from '../ui/icons';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { autoCapitalize, backspace, insertText, type KeyboardLayout } from './keyboard';

type TextField = 'firstName' | 'lastName' | 'phone';
const FIELD_ORDER: ContactField[] = ['firstName', 'lastName', 'phone', 'consent'];

export interface ContactScreenProps {
  params: Params;
  kioskId?: string;
  onBack: () => void;
  onSubmitted: (id: string, renderPng: string | undefined) => void;
  /** PNG data URL of the 3D view (~1280 px wide), or null when unavailable */
  captureRender?: () => string | null;
  /** injectable for tests */
  submit?: (body: SubmitRequest) => Promise<SubmitOutcome>;
}

const failKey = (code: SubmitErrorCode) =>
  code === 'network' ||
  code === 'timeout' ||
  code === 'rate_limited' ||
  code === 'invalid_configuration'
    ? `contact.fail.${code}`
    : 'contact.fail.generic';

/**
 * Contact screen (D-5): name (required), surname (optional), phone +998 + 9 digits, consent.
 * States: empty / filled / validation error (on blur or submit) / submitting (locked) /
 * submission error (message + "Qayta urinish" with the SAME idempotency key, data kept).
 * Typing happens on the on-screen keyboard; the OS keyboard is suppressed (inputMode="none").
 */
export function ContactScreen({
  params,
  kioskId,
  onBack,
  onSubmitted,
  captureRender,
  submit = submitApplication,
}: ContactScreenProps) {
  const { t, lang } = useI18n();
  const [contact, setContact] = useState<ContactInput>({
    firstName: '',
    lastName: '',
    phone: '',
    consent: false,
  });
  const [active, setActive] = useState<TextField | null>('firstName');
  const [script, setScript] = useState<'latin' | 'cyrillic'>(lang === 'ru' ? 'cyrillic' : 'latin');
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({});
  const [showAll, setShowAll] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [failCode, setFailCode] = useState<SubmitErrorCode | null>(null);
  const [consentInfo, setConsentInfo] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  // one key per application attempt: a retry after an error reuses it (same key -> same ID)
  const keyRef = useRef(newIdempotencyKey());
  const refs = {
    firstName: useRef<HTMLInputElement>(null),
    lastName: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    consent: useRef<HTMLInputElement>(null),
  };

  const errors: ContactErrors = useMemo(() => validateContact(contact), [contact]);
  const valid = Object.keys(errors).length === 0;
  const locked = status === 'submitting';
  const shownError = (f: ContactField) => (showAll || touched[f] ? errors[f] : undefined);

  // the name field has the focus when the screen opens
  useEffect(() => {
    refs.firstName.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusField = (f: ContactField) => {
    refs[f].current?.focus();
    if (f !== 'consent') setActive(f);
  };

  /** functional updates: fast taps in one frame never read a stale value */
  const change = (fn: (c: ContactInput) => ContactInput) => {
    setContact(fn);
    if (status === 'error') {
      setStatus('idle');
      setFailCode(null);
    }
  };
  const update = (patch: Partial<ContactInput>) => change((c) => ({ ...c, ...patch }));

  const typeText = (text: string) => {
    if (!active || locked) return;
    const f = active;
    change((c) =>
      f === 'phone'
        ? { ...c, phone: normalizePhoneDigits(c.phone + text) }
        : { ...c, [f]: insertText(c[f] ?? '', text) },
    );
  };
  const erase = () => {
    if (!active || locked) return;
    const f = active;
    change((c) =>
      f === 'phone' ? { ...c, phone: c.phone.slice(0, -1) } : { ...c, [f]: backspace(c[f] ?? '') },
    );
  };
  const next = () => {
    if (active === 'firstName') focusField('lastName');
    else if (active === 'lastName') focusField('phone');
    else if (active === 'phone') {
      refs.phone.current?.blur();
      setActive(null);
      refs.consent.current?.focus();
    }
  };

  const send = async () => {
    if (locked) return;
    if (!valid) {
      setShowAll(true);
      const first = FIELD_ORDER.find((f) => errors[f]);
      if (first) focusField(first);
      return;
    }
    setStatus('submitting');
    setFailCode(null);
    let renderPng: string | undefined;
    try {
      renderPng = captureRender?.() ?? undefined;
    } catch {
      renderPng = undefined; // the render is a bonus, never a blocker
    }
    const outcome = await submit({
      idempotencyKey: keyRef.current,
      params,
      contact: cleanContact(contact),
      lang,
      ...(kioskId ? { kioskId } : {}),
      ...(renderPng ? { renderPng } : {}),
      ...(honeypot ? { website: honeypot } : {}),
    });
    if (outcome.ok) {
      onSubmitted(outcome.id, renderPng);
      return;
    }
    setStatus('error');
    setFailCode(outcome.code);
  };

  const fieldProps = (f: TextField) => ({
    ref: refs[f],
    id: `contact-${f}`,
    inputMode: 'none' as const,
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    disabled: locked,
    'aria-invalid': shownError(f) ? true : undefined,
    'aria-describedby': shownError(f) ? `contact-${f}-error` : undefined,
    onFocus: () => setActive(f),
    onBlur: () => setTouched((x) => ({ ...x, [f]: true })),
  });
  const errorText = (f: ContactField) => {
    const e = shownError(f);
    return e ? (
      <span className="contact-error" id={`contact-${f}-error`} role="alert">
        {t(`contact.err.${f}.${e}`)}
      </span>
    ) : null;
  };

  const layout: KeyboardLayout | null = active === 'phone' ? 'numeric' : active ? script : null;

  return (
    <div
      className="contact-screen"
      role="dialog"
      aria-modal="true"
      aria-label={t('contact.title')}
      data-testid="contact-screen"
      data-state={status === 'idle' ? (valid ? 'filled' : 'editing') : status}
    >
      <form
        className="contact-card"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="contact-head">
          <h2>{t('contact.title')}</h2>
          <p className="muted">{t('contact.subtitle')}</p>
        </div>

        <div className="contact-names">
          <label className={`contact-field${shownError('firstName') ? ' has-error' : ''}`}>
            <span className="contact-label">{t('contact.firstName')}</span>
            <input
              {...fieldProps('firstName')}
              value={contact.firstName}
              onChange={(e) => update({ firstName: autoCapitalize(e.target.value) })}
            />
            {errorText('firstName')}
          </label>
          <label className={`contact-field${shownError('lastName') ? ' has-error' : ''}`}>
            <span className="contact-label">
              {t('contact.lastName')} <span className="muted">({t('contact.optional')})</span>
            </span>
            <input
              {...fieldProps('lastName')}
              value={contact.lastName}
              onChange={(e) => update({ lastName: autoCapitalize(e.target.value) })}
            />
            {errorText('lastName')}
          </label>
        </div>

        <label className={`contact-field contact-phone${shownError('phone') ? ' has-error' : ''}`}>
          <span className="contact-label">{t('contact.phone')}</span>
          <span className="phone-box">
            <span className="phone-code">{PHONE_COUNTRY_CODE}</span>
            <input
              {...fieldProps('phone')}
              value={formatPhoneDigits(contact.phone)}
              placeholder="90 123 45 67"
              data-testid="contact-phone"
              onChange={(e) => update({ phone: normalizePhoneDigits(e.target.value) })}
            />
          </span>
          {errorText('phone')}
        </label>

        <div className={`contact-consent${shownError('consent') ? ' has-error' : ''}`}>
          <label className="consent-check">
            <input
              ref={refs.consent}
              type="checkbox"
              checked={contact.consent}
              disabled={locked}
              onChange={(e) => update({ consent: e.target.checked })}
              onBlur={() => setTouched((x) => ({ ...x, consent: true }))}
              data-testid="contact-consent"
            />
            <span className="consent-box" aria-hidden>
              {contact.consent && <CheckIcon />}
            </span>
            <span>{t('contact.consent')}</span>
          </label>
          <Button variant="text" onClick={() => setConsentInfo(true)} disabled={locked}>
            {t('contact.consentMore')}
          </Button>
          {errorText('consent')}
        </div>

        {/* honeypot: invisible to people (and screen readers); bots fill every field */}
        <input
          className="contact-hp"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />

        {status === 'error' && failCode && (
          <div className="contact-fail" role="alert" data-testid="contact-fail">
            <WarningIcon />
            <span>{t(failKey(failCode))}</span>
          </div>
        )}

        <div className="contact-actions">
          <Button
            variant="secondary"
            icon={<ArrowLeftIcon />}
            onClick={onBack}
            disabled={locked}
            data-testid="contact-back"
          >
            {t('contact.back')}
          </Button>
          <Button
            type="submit"
            variant="success"
            large
            disabled={locked || !valid}
            aria-busy={locked || undefined}
            icon={locked ? <SpinnerIcon className="icon spin" /> : undefined}
            data-testid="contact-submit"
          >
            {locked
              ? t('contact.submitting')
              : status === 'error'
                ? t('contact.retry')
                : t('contact.submit')}
          </Button>
        </div>
      </form>

      {layout && (
        <OnScreenKeyboard
          layout={layout}
          onInsert={typeText}
          onBackspace={erase}
          onNext={next}
          onToggleScript={() => setScript((s) => (s === 'latin' ? 'cyrillic' : 'latin'))}
          disabled={locked}
        />
      )}

      {consentInfo && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConsentInfo(false);
          }}
        >
          <div
            className="modal-card consent-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-title"
          >
            <h2 id="consent-title">{t('contact.consentTitle')}</h2>
            {/* TODO(legal): final consent text from Dafna's lawyer (data-localization review) */}
            <p data-testid="consent-text">{t('contact.consentText')}</p>
            <Button variant="secondary" icon={<CloseIcon />} onClick={() => setConsentInfo(false)}>
              {t('contact.close')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
