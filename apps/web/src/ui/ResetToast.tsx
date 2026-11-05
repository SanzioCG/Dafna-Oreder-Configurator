import { getParamDef } from '@dafna/engine';
import { useEffect } from 'react';
import { optionLabel, useI18n } from '../i18n/I18n';
import { TEMPLATE, type ResetNotice } from '../state/useConfigurator';
import type { Mode } from '../mode';
import { CloseIcon } from './icons';
import { customerOptionLabel, customerParamLabel, customerReason } from './plainText';
import { StatusMessage } from './StatusMessage';

export const TOAST_MS = 3000;

/**
 * Tells the customer that the app changed one of their choices because of another change
 * (e.g. sections 1 -> auto after widening). Lives inside the configurator sheet, above the
 * navigation; dismissible, and disappears after 3 s. A choice is never changed silently.
 */
export function ResetToast({
  notice,
  onDismiss,
  mode = 'customer',
}: {
  notice: ResetNotice | null;
  onDismiss: () => void;
  /** customer: plain words and reasons (no codes, no engineering terms); staff: technical */
  mode?: Mode;
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  if (!notice) return null;

  return (
    <StatusMessage
      className="sheet-toast"
      testId="reset-toast"
      action={
        <button
          type="button"
          className="sheet-toast-close"
          aria-label={t('toast.dismiss')}
          onClick={onDismiss}
        >
          <CloseIcon />
        </button>
      }
    >
      <ul>
        {notice.resets.map((r) => {
          const def = getParamDef(TEMPLATE, r.key);
          const optionKey = def ? def.labelKey.replace(/^param\./, '') : r.key;
          if (mode === 'customer') {
            return (
              <li key={r.key}>
                {t('toast.autoReset', {
                  param: customerParamLabel(t, r.key),
                  from: customerOptionLabel(t, r.key, r.from),
                  to: customerOptionLabel(t, r.key, r.to),
                  reason: customerReason(t, r.code),
                })}
              </li>
            );
          }
          const reasonKey = `reason.${r.code}`;
          const reason = t(reasonKey) === reasonKey ? t('reason.default') : t(reasonKey);
          return (
            <li key={r.key}>
              {t('toast.autoReset', {
                param: def ? t(def.labelKey, { n: def.appliesToSection }) : r.key,
                from: optionLabel(t, optionKey, r.from),
                to: optionLabel(t, optionKey, r.to),
                reason,
              })}
            </li>
          );
        })}
      </ul>
    </StatusMessage>
  );
}
