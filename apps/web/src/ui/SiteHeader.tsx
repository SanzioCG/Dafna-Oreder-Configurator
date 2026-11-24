import { Phone, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LANGS, useI18n } from '../i18n/I18n';
import { DAFNA_CONTACT } from '../site';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from './Button';
import { CloseIcon, MoonIcon, SunIcon } from './icons';

/**
 * D-43: the website's header (Figma "Web — desktop / mobile"): logo, language, theme and
 * "Bog'lanish" (a popover on a computer, a bottom sheet on a phone). The kiosk keeps its own
 * header in the panel with "Konsultant chaqirish".
 */
export function SiteHeader() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggleTheme, logoUrl } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="site-header" data-testid="site-header">
      <img className="site-logo" src={logoUrl} alt={t('app.brand')} draggable={false} />
      <div className="site-tools">
        <div className="lang-switch" role="group" aria-label={t('lang.label')}>
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              className={l === lang ? 'lang active' : 'lang'}
              aria-pressed={l === lang}
              onClick={() => setLang(l)}
            >
              <span className="lang-long">{t(`lang.${l}`)}</span>
              <span className="lang-short" aria-hidden="true">
                {l.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
        <IconButton
          className="site-theme"
          label={t('theme.dark')}
          aria-pressed={theme === 'dark'}
          onClick={toggleTheme}
          icon={theme === 'dark' ? <MoonIcon /> : <SunIcon />}
        />
        <div className="site-contact-wrap">
          <button
            type="button"
            className="site-contact-btn"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            data-testid="site-contact"
          >
            <Phone className="icon" aria-hidden />
            <span>{t('site.contact')}</span>
          </button>
          {open && (
            <>
              <div
                className="site-sheet-backdrop"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />
              <div
                className="site-contact-card"
                role="dialog"
                aria-labelledby="site-contact-title"
                data-testid="site-contact-card"
              >
                <div className="site-contact-head">
                  <h2 id="site-contact-title">{t('site.contactTitle')}</h2>
                  <IconButton
                    label={t('consultant.close')}
                    onClick={() => setOpen(false)}
                    icon={<CloseIcon />}
                  />
                </div>
                <p className="muted">{t('site.contactText')}</p>
                <a className="btn btn-secondary consultant-btn btn-wide" href={DAFNA_CONTACT.tel}>
                  <Phone className="icon" aria-hidden />
                  <span>
                    {t('site.call')} · {DAFNA_CONTACT.phone}
                  </span>
                </a>
                {DAFNA_CONTACT.telegram && (
                  <a
                    className="btn btn-secondary btn-wide"
                    href={DAFNA_CONTACT.telegram}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Send className="icon" aria-hidden />
                    <span>{t('site.telegram')}</span>
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
