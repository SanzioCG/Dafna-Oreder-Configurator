/** Pure translation (no React): shared by the app, the API (server/) and tests. */
import { ru } from './ru';
import { uz, type Messages } from './uz';

export type Lang = 'uz' | 'ru';
export const LANGS: Lang[] = ['uz', 'ru'];
const DICTS: Record<Lang, Messages> = { uz, ru };

export type TranslateValues = Record<string, string | number | boolean | undefined>;
export type Translate = (key: string, values?: TranslateValues) => string;

export function translate(lang: Lang, key: string, values?: TranslateValues): string {
  const dict = DICTS[lang] as Record<string, string>;
  const template = dict[key] ?? (uz as Record<string, string>)[key] ?? key;
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = values[name];
    return v === undefined ? match : String(v);
  });
}
