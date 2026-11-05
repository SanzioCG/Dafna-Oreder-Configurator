export type Mode = 'customer' | 'staff';

/** `?mode=staff` enables staff tools; anything else (or nothing) is customer mode. */
export function parseMode(search: string): Mode {
  return new URLSearchParams(search).get('mode') === 'staff' ? 'staff' : 'customer';
}
