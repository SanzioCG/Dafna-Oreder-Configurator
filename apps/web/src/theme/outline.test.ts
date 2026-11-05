import { describe, expect, it } from 'vitest';
import stylesCss from '../styles.css?raw';

/*
 * Outline rules of design system V3 (stylesheet level): no customer-facing component may use a
 * border thinner than 2 px or a non-ink border colour. Every border / outline declaration in
 * styles.css must be `0`, `none` or one of the line tokens, whose values are checked in
 * theme/lines.test.ts (2 px --ink in cards, 2.5 px --ink / none on the page, 3 px focus).
 */
const ALLOWED = new Set([
  '0',
  'none',
  'var(--line-in-card)',
  'var(--line-on-bg)',
  'var(--focus-line)',
]);

function declarations(css: string): { prop: string; value: string; line: number }[] {
  const out: { prop: string; value: string; line: number }[] = [];
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  noComments.split('\n').forEach((text, i) => {
    const m = /^\s*(border(?:-(?:top|right|bottom|left))?|outline)\s*:\s*([^;]+);/.exec(text);
    if (m?.[1] && m[2]) out.push({ prop: m[1], value: m[2].trim(), line: i + 1 });
  });
  return out;
}

describe('stylesheet outline rules', () => {
  const decls = declarations(stylesCss);

  it('finds the border declarations (sanity)', () => {
    expect(decls.length).toBeGreaterThan(20);
  });

  it('every border / outline is 0, none or a line token (2 px+ --ink)', () => {
    const bad = decls
      .filter((d) => !ALLOWED.has(d.value))
      .map((d) => `${d.line}: ${d.prop}: ${d.value}`);
    expect(bad).toEqual([]);
  });

  it('no underlined text anywhere (D-4.1)', () => {
    expect(stylesCss).not.toMatch(/text-decoration[^;]*underline/);
  });

  it('no border-color / border-width / outline-color overrides, no V2 grey tokens', () => {
    expect(stylesCss).not.toMatch(/^\s*(border|outline)-(color|width|style)\s*:/m);
    expect(stylesCss).not.toMatch(/--border-control|--divider|--primary-strong|--surface\b/);
  });
});
