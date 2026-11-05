import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance, tokensFromCss } from './contrast';
import themesCss from './themes.css?raw';
import tokensCss from './tokens.css?raw';

/*
 * Automated contrast gate (design system V3 "Bold Bento"). Computes WCAG relative luminance
 * from the token VALUES in tokens.css (Light + shared) and themes.css (Dark):
 *   text 4.5:1 · selected vs unselected / toggle states 3:1.
 * Boundary contrast is not required for text-labelled controls (ADR-007): unselected pills are
 * identified by their label and the --ink outline / fill inversion, not by a grey hairline.
 */
const light = tokensFromCss(tokensCss, ':root');
const dark = { ...light, ...tokensFromCss(themesCss, ":root[data-theme='dark']") };
const THEMES = { light, dark } as const;

type Pair = [fg: string, bg: string];
const TEXT: Pair[] = [
  ['--text', '--bg'],
  ['--text-2', '--bg'],
  ['--error', '--bg'],
  ['--ink', '--paper'], // unselected pills / cards
  ['--on-ink', '--ink'], // selected pills (white on ink)
  ['--ink', '--step-size'],
  ['--ink', '--step-color'],
  ['--ink', '--step-interior'],
  ['--ink', '--step-review'],
  ['--ink', '--accent-peach'],
  ['--on-primary', '--primary'],
  ['--on-success', '--success'],
  ['--text', '--viewport'], // viewport hint text
];
const STATE: Pair[] = [
  ['--ink', '--paper'], // selected vs unselected fill
  ['--ink', '--step-size'], // selected pill vs its card
  ['--ink', '--step-color'],
  ['--ink', '--step-interior'],
  ['--paper', '--ink'], // toggle OFF track vs ON track
];

describe('WCAG luminance helper', () => {
  it('matches known values', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe.each(Object.entries(THEMES))('%s theme contrast', (_name, tokens) => {
  const value = (t: string) => {
    const v = tokens[t];
    if (!v) throw new Error(`token ${t} missing`);
    return v;
  };
  it.each(TEXT)('text %s on %s >= 4.5:1', (fg, bg) => {
    expect(contrastRatio(value(fg), value(bg))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(STATE)('state %s vs %s >= 3:1', (a, b) => {
    expect(contrastRatio(value(a), value(b))).toBeGreaterThanOrEqual(3);
  });
});
