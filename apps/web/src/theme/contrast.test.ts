import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance, tokensFromCss } from './contrast';
import themesCss from './themes.css?raw';
import tokensCss from './tokens.css?raw';

/*
 * Automated contrast gate (D-3a design system V2). Computes WCAG relative luminance from the
 * token VALUES in tokens.css (White) and themes.css (Dark) and fails below:
 *   text 4.5:1 · large text 3:1 · UI boundaries and focus indicators 3:1
 */
const white = tokensFromCss(tokensCss, ':root');
const dark = { ...white, ...tokensFromCss(themesCss, ":root[data-theme='dark']") };
const THEMES = { white, dark } as const;

type Pair = [fg: string, bg: string];
const TEXT: Pair[] = [
  ['--text', '--bg'],
  ['--text', '--surface'],
  ['--text', '--panel'],
  ['--text-2', '--bg'],
  ['--text-2', '--surface'],
  ['--text-2', '--panel'],
  ['--error', '--panel'],
  ['--on-primary', '--primary'],
  ['--on-success', '--success'],
  ['--error', '--bg'],
  ['--error', '--surface'],
  ['--text', '--viewport-bg'], // viewport overlays without their own pill (hints)
];
const LARGE_TEXT: Pair[] = [
  ['--primary-strong', '--surface'], // large accent headings / numbers
  ['--text-2', '--viewport-bg'],
];
const UI_BOUNDARY: Pair[] = [
  ['--primary-strong', '--bg'], // focus ring, selected borders
  ['--primary-strong', '--surface'],
  ['--primary-strong', '--viewport-bg'], // dimension lines over the 3D background
  ['--primary-strong', '--panel'],
  ['--border-control', '--bg'], // unselected controls, inputs, slider track
  ['--border-control', '--surface'],
  ['--border-control', '--panel'],
  ['--border-control', '--viewport-bg'], // floating buttons over the 3D
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
  const check = (pairs: Pair[], min: number) =>
    pairs.map(([fg, bg]) => {
      const ratio = contrastRatio(value(fg), value(bg));
      return { pair: `${fg} on ${bg}`, ratio: Number(ratio.toFixed(2)), ok: ratio >= min };
    });

  it.each(TEXT)('text %s on %s >= 4.5:1', (fg, bg) => {
    expect(check([[fg, bg]], 4.5)[0]).toMatchObject({ ok: true });
  });
  it.each(LARGE_TEXT)('large text %s on %s >= 3:1', (fg, bg) => {
    expect(check([[fg, bg]], 3)[0]).toMatchObject({ ok: true });
  });
  it.each(UI_BOUNDARY)('UI boundary / focus %s on %s >= 3:1', (fg, bg) => {
    expect(check([[fg, bg]], 3)[0]).toMatchObject({ ok: true });
  });
});
