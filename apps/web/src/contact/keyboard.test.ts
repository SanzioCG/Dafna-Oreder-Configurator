import { describe, expect, it } from 'vitest';
import {
  LAYOUTS,
  NUMERIC_ROWS,
  OKINA,
  TUTUQ,
  autoCapitalize,
  backspace,
  capitalizesNext,
  insertText,
  keyLabel,
} from './keyboard';

const typeAll = (keys: string[]) => keys.reduce((v, k) => insertText(v, k), '');

describe('on-screen keyboard layouts', () => {
  it('Latin: QWERTY + Oʻ Gʻ ʼ and hyphen', () => {
    const keys = LAYOUTS.latin.flat();
    expect(LAYOUTS.latin[0]!.join('')).toBe('qwertyuiop');
    expect(keys).toEqual(expect.arrayContaining([`o${OKINA}`, `g${OKINA}`, TUTUQ, '-']));
    expect(keys.filter((k) => /^[a-z]$/.test(k))).toHaveLength(26);
  });

  it('Cyrillic: ЙЦУКЕН + Ў Қ Ғ Ҳ', () => {
    expect(LAYOUTS.cyrillic[0]!.slice(0, 6).join('')).toBe('йцукен');
    expect(LAYOUTS.cyrillic.flat()).toEqual(expect.arrayContaining(['ў', 'қ', 'ғ', 'ҳ']));
    expect(LAYOUTS.cyrillic.flat()).toHaveLength(12 + 11 + 10 + 5);
  });

  it('numeric pad: 0-9 once each', () => {
    expect(NUMERIC_ROWS.flat().sort().join('')).toBe('0123456789');
  });

  it('key labels are shown capitalised', () => {
    expect(keyLabel(`o${OKINA}`)).toBe(`O${OKINA}`);
    expect(keyLabel('ў')).toBe('Ў');
  });
});

describe('auto-capitalisation and editing', () => {
  it('capital at the start, after a space and after a hyphen', () => {
    expect(capitalizesNext('')).toBe(true);
    expect(capitalizesNext('Ali ')).toBe(true);
    expect(capitalizesNext('Ali-')).toBe(true);
    expect(capitalizesNext('Ali')).toBe(false);
    expect(typeAll(['a', 'l', 'i', ' ', 'v', 'a', 'l', 'i'])).toBe('Ali Vali');
    expect(typeAll(['a', 'n', 'n', 'a', '-', 'm', 'a', 'r', 'i', 'y', 'a'])).toBe('Anna-Mariya');
    expect(typeAll([`o${OKINA}`, 'k', 't', 'a', 'm'])).toBe(`O${OKINA}ktam`);
    expect(typeAll(['g', 'u', 'l', `o${OKINA}`])).toBe(`Gulo${OKINA}`);
    expect(typeAll(['ш', 'е', 'р', 'з', 'о', 'д'])).toBe('Шерзод');
    expect(typeAll(['ў', 'т', 'к', 'и', 'р'])).toBe('Ўткир');
  });

  it('no leading or double space / hyphen; length capped at 50', () => {
    expect(typeAll([' ', '-', 'a'])).toBe('A');
    expect(typeAll(['a', ' ', ' ', '-', 'b'])).toBe('A B');
    expect(typeAll(Array.from({ length: 80 }, () => 'a'))).toHaveLength(50);
  });

  it('backspace removes one character (Oʻ = two)', () => {
    expect(backspace('Ali')).toBe('Al');
    expect(backspace(`O${OKINA}`)).toBe('O');
    expect(backspace('')).toBe('');
  });

  it('physical keyboard / paste: same capitalisation rules', () => {
    expect(autoCapitalize('ali vali-zoda')).toBe('Ali Vali-Zoda');
    expect(autoCapitalize('азиз')).toBe('Азиз');
    expect(autoCapitalize('McDonald')).toBe('McDonald');
  });
});
