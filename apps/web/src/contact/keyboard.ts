/**
 * On-screen keyboard for the kiosk contact form (no OS keyboard on the touch screen).
 * Pure: layouts + text editing rules, unit-tested; the component only renders them.
 */
export type KeyboardLayout = 'latin' | 'cyrillic' | 'numeric';

/** Uzbek Latin apostrophes: ʻ (U+02BB) in Oʻ / Gʻ, ʼ (U+02BC) as the tutuq belgisi. */
export const OKINA = 'ʻ';
export const TUTUQ = 'ʼ';

/** Letter rows; every key inserts its own (lower-case) text, auto-capitalised by insertText. */
export const LAYOUTS: Record<Exclude<KeyboardLayout, 'numeric'>, string[][]> = {
  latin: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
    [`o${OKINA}`, `g${OKINA}`, TUTUQ, '-'],
  ],
  cyrillic: [
    ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'],
    ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
    ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', 'ё'],
    ['ў', 'қ', 'ғ', 'ҳ', '-'],
  ],
};

export const NUMERIC_ROWS: string[][] = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['0']];

/** Key label: the letter as typed at the start of a word (Oʻ, Gʻ, Ў …). */
export function keyLabel(text: string): string {
  return capitalizeFirst(text);
}

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s;
}

/** Auto-capital position: start of the field, after a space or after a hyphen. */
export function capitalizesNext(value: string): boolean {
  if (value.length === 0) return true;
  const last = value.charAt(value.length - 1);
  return last === ' ' || last === '-';
}

/** Max name length on the keyboard (validation allows the same, lead/contact NAME_MAX). */
const NAME_KEYBOARD_MAX = 50;

/**
 * Appends a key's text to a name field: auto-capital at the start / after space / after hyphen,
 * no leading space or hyphen, no double space, length capped.
 */
export function insertText(value: string, text: string): string {
  if (value.length >= NAME_KEYBOARD_MAX) return value;
  if (text === ' ' || text === '-') {
    if (value.length === 0 || capitalizesNext(value)) return value;
    return value + text;
  }
  const next = capitalizesNext(value) ? capitalizeFirst(text) : text;
  return (value + next).slice(0, NAME_KEYBOARD_MAX);
}

/** Removes the last character (a whole "Oʻ" stays two characters: ʻ first, then O). */
export function backspace(value: string): string {
  return Array.from(value).slice(0, -1).join('');
}

/**
 * Auto-capitalisation for text typed on a physical keyboard or pasted (same rules as the
 * on-screen keys): every word / hyphen part starts upper-case, the rest is kept as typed.
 */
export function autoCapitalize(value: string): string {
  return value.replace(
    /(^|[ -])(\p{L})/gu,
    (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase(),
  );
}
