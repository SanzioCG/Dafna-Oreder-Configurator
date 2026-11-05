import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ru } from './ru';
import { uz, type Messages } from './uz';

export type Lang = 'uz' | 'ru';
export const LANGS: Lang[] = ['uz', 'ru'];
const DICTS: Record<Lang, Messages> = { uz, ru };

export type TranslateValues = Record<string, string | number | boolean | undefined>;
export type Translate = (key: string, values?: TranslateValues) => string;

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);

export function translate(lang: Lang, key: string, values?: TranslateValues): string {
  const dict = DICTS[lang] as Record<string, string>;
  const template = dict[key] ?? (uz as Record<string, string>)[key] ?? key;
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = values[name];
    return v === undefined ? match : String(v);
  });
}

export function I18nProvider({
  children,
  initial = 'uz',
}: {
  children: ReactNode;
  initial?: Lang;
}) {
  const [lang, setLang] = useState<Lang>(initial);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (key, values) => translate(lang, key, values) }),
    [lang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Label for an enum option: `option.<key>.<value>` if defined, otherwise the raw value. */
export function optionLabel(t: Translate, key: string, value: unknown): string {
  const k = `option.${key}.${String(value)}`;
  const label = t(k);
  return label === k ? String(value) : label;
}
