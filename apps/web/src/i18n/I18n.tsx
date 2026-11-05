import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translate, type Lang, type Translate } from './translate';

export { LANGS, translate, type Lang, type Translate, type TranslateValues } from './translate';

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);

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
