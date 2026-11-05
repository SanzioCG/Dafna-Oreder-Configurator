/**
 * Reads a colour token from tokens.css for code that cannot use CSS variables (Three.js).
 * Call at render time (not at module load) so the stylesheet is applied. The fallback is only
 * used if the token is missing, e.g. in tests.
 */
export function cssToken(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
