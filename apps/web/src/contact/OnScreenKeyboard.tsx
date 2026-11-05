import type { MouseEvent } from 'react';
import { useI18n } from '../i18n/I18n';
import { BackspaceIcon } from '../ui/icons';
import { LAYOUTS, NUMERIC_ROWS, keyLabel, type KeyboardLayout } from './keyboard';

interface Props {
  layout: KeyboardLayout;
  onInsert: (text: string) => void;
  onBackspace: () => void;
  onNext: () => void;
  /** name fields: switch Latin <-> Cyrillic */
  onToggleScript?: () => void;
  disabled?: boolean;
}

/** keys never take the focus away from the field being typed into (no blur, no caret jump) */
const keepFocus = (e: MouseEvent) => e.preventDefault();

/**
 * Kiosk on-screen keyboard: Latin (with Oʻ Gʻ ʼ -), Cyrillic (ЙЦУКЕН + Ў Қ Ғ Ҳ) or a numeric
 * pad for the phone. Backspace, space (letters only) and "Keyingi" on every layout.
 */
export function OnScreenKeyboard({
  layout,
  onInsert,
  onBackspace,
  onNext,
  onToggleScript,
  disabled = false,
}: Props) {
  const { t } = useI18n();
  const rows = layout === 'numeric' ? NUMERIC_ROWS : LAYOUTS[layout];
  const key = (text: string) => (
    <button
      key={text}
      type="button"
      className="kb-key"
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={() => onInsert(text)}
      data-key={text}
    >
      {keyLabel(text)}
    </button>
  );
  return (
    <div
      className={`kb kb-${layout}`}
      role="group"
      aria-label={t('kb.label')}
      data-testid="keyboard"
      data-layout={layout}
    >
      {rows.map((row, i) => (
        <div className="kb-row" key={i}>
          {row.map(key)}
        </div>
      ))}
      <div className="kb-row kb-row-actions">
        {layout !== 'numeric' && onToggleScript && (
          <button
            type="button"
            className="kb-key kb-wide"
            disabled={disabled}
            onMouseDown={keepFocus}
            onClick={onToggleScript}
            data-testid="kb-script"
          >
            {layout === 'latin' ? t('kb.toCyrillic') : t('kb.toLatin')}
          </button>
        )}
        {layout !== 'numeric' && (
          <button
            type="button"
            className="kb-key kb-space"
            disabled={disabled}
            onMouseDown={keepFocus}
            onClick={() => onInsert(' ')}
            aria-label={t('kb.space')}
            data-key=" "
          >
            {t('kb.space')}
          </button>
        )}
        <button
          type="button"
          className="kb-key kb-wide"
          disabled={disabled}
          onMouseDown={keepFocus}
          onClick={onBackspace}
          aria-label={t('kb.backspace')}
          data-testid="kb-backspace"
        >
          <BackspaceIcon />
        </button>
        <button
          type="button"
          className="kb-key kb-wide kb-next"
          disabled={disabled}
          onMouseDown={keepFocus}
          onClick={onNext}
          data-testid="kb-next"
        >
          {t('kb.next')}
        </button>
      </div>
    </div>
  );
}
