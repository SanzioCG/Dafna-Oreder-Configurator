import { describe, expect, it } from 'vitest';
import themesCss from './themes.css?raw';
import tokensCss from './tokens.css?raw';

/** Value of a custom property in a CSS block. */
function prop(css: string, selector: string, name: string): string | null {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return null;
  const block = css.slice(start, css.indexOf('\n}', start));
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(block);
  return m?.[1]?.trim() ?? null;
}

const remPx = (v: string) => {
  const m = /^(\d*\.?\d+)rem\b/.exec(v.trim());
  return m?.[1] ? Number(m[1]) * 16 : null;
};

/*
 * Outline rules of design system V3 (token level). theme/outline.test.ts checks that the
 * stylesheet only uses these tokens for borders.
 */
describe('outline tokens', () => {
  it('inside colored cards: 2 px solid --ink (both themes)', () => {
    const v = prop(tokensCss, ':root', '--line-in-card') ?? '';
    expect(remPx(v)).toBe(2);
    expect(v).toContain('solid var(--ink)');
    expect(prop(themesCss, ":root[data-theme='dark']", '--line-in-card')).toBeNull();
  });

  it('on the page: Light 2.5 px solid --ink, Dark none', () => {
    const lightLine = prop(tokensCss, ':root', '--line-on-bg') ?? '';
    expect(remPx(lightLine)).toBe(2.5);
    expect(lightLine).toContain('solid var(--ink)');
    expect(prop(themesCss, ":root[data-theme='dark']", '--line-on-bg')).toBe('0 solid transparent');
  });

  it('focus ring: 3 px --ink, no glow; --ink and --paper are theme-independent', () => {
    const f = prop(tokensCss, ':root', '--focus-line') ?? '';
    expect(remPx(f)).toBe(3);
    expect(f).toContain('var(--ink)');
    for (const name of ['--ink', '--paper', '--on-ink', '--step-size', '--step-color'])
      expect(prop(themesCss, ":root[data-theme='dark']", name)).toBeNull();
  });
});
