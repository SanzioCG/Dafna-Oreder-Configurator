import type { ParamValue } from '@dafna/engine';
import { optionLabel, type Translate } from '../i18n/I18n';

/**
 * Customer-facing words (D-4, ADR-010): no codes and no engineering words in customer UI.
 * Staff keeps the technical vocabulary (reason.*, param.*, option.*).
 */
export const CUSTOMER_BANNED_WORDS = ["bo'lim", 'tsokol', 'shtanga', 'ldsp', 'avto'];

/** Plain-language reason for a blocked option, e.g. "Bu kenglikda javon egilib qoladi". */
export function customerReason(t: Translate, code: string): string {
  const key = `creason.${code}`;
  const text = t(key);
  return text === key ? t('creason.default') : text;
}

/** Customer label of a parameter in toasts ("2-qism", "Eshiklar", …). */
export function customerParamLabel(t: Translate, key: string): string {
  const m = /^interior(\d)$/.exec(key);
  if (m) return t('c.partN', { n: Number(m[1]) });
  const k = `c.param.${key}`;
  const text = t(k);
  return text === k ? t(`param.${key}`) : text;
}

/** Customer label of an option value in toasts. */
export function customerOptionLabel(t: Translate, key: string, value: ParamValue): string {
  if (/^interior\d$/.test(key)) {
    const k = `c.opt.${String(value)}`;
    const text = t(k);
    if (text !== k) return text;
  }
  const k = `c.option.${key}.${String(value)}`;
  const text = t(k);
  return text === k ? optionLabel(t, key, value) : text;
}
