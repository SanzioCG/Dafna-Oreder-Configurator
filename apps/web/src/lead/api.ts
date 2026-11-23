import type { Params } from '@dafna/engine';
import type { Lang } from '../i18n/translate';
import type { ContactInput } from './contact';

/** D-25: one product of a multi-product order */
export interface SubmitItem {
  /** 'wardrobe' | 'pedestal' | 'desk' */
  product: string;
  params: Params;
  /** 1..MAX_QUANTITY */
  quantity?: number;
  /** data:image/png;base64,… render of this product */
  renderPng?: string;
}

/** D-25: at most this many products in one order, each at most MAX_QUANTITY pieces */
export const MAX_ORDER_ITEMS = 5;
export const MAX_QUANTITY = 10;

/** POST /api/submit request body (contract shared by the kiosk and the API). */
export interface SubmitRequest {
  /**
   * D-25: several products in one order (one contact). When present, product / params /
   * renderPng are ignored; each item becomes its own application, linked by the order ID.
   */
  items?: SubmitItem[];
  /** generated once per application attempt; a retry reuses it (same key -> same ID) */
  idempotencyKey: string;
  /** D-8: 'wardrobe' (default, older kiosks send nothing) | 'pedestal' | 'desk' */
  product?: string;
  params?: Params;
  contact: ContactInput;
  lang: Lang;
  kioskId?: string;
  /** data:image/png;base64,… (~1280 px wide render of the configured wardrobe) */
  renderPng?: string;
  /** honeypot: always empty for humans (hidden field); bots fill it */
  website?: string;
}

export interface SubmitSuccess {
  id: string;
  status: 'submitted';
  /** D-12: "/api/assembly?id=…&t=…", the customer's assembly instructions (QR) */
  assemblyPath?: string;
  /** D-25: every product's application ID, in order (the first one is `id`, the order ID) */
  ids?: string[];
  /** D-25: every product's assembly instructions link, in order */
  assemblyPaths?: string[];
}

export type SubmitErrorCode =
  | 'method_not_allowed'
  | 'payload_too_large'
  | 'invalid_json'
  | 'invalid_request'
  | 'invalid_contact'
  | 'invalid_configuration'
  | 'rejected'
  | 'rate_limited'
  | 'storage_failed'
  | 'server_misconfigured'
  | 'network'
  | 'timeout';

export interface SubmitError {
  error: { code: SubmitErrorCode; fields?: string[]; issues?: string[] };
}

export type SubmitOutcome =
  | { ok: true; id: string; assemblyPath?: string; ids?: string[]; assemblyPaths?: string[] }
  | { ok: false; code: SubmitErrorCode };

export const SUBMIT_TIMEOUT_MS = 15_000;
export const SUBMIT_URL = '/api/submit';

/** Random idempotency key (UUID v4 where available). */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const isAssemblyPath = (v: unknown): v is string =>
  typeof v === 'string' && v.startsWith('/api/assembly?');

/**
 * Client side of /api/submit: 15 s timeout, typed outcome, never throws.
 * `fetchImpl` is injectable for tests.
 */
export async function submitApplication(
  body: SubmitRequest,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = SUBMIT_TIMEOUT_MS,
): Promise<SubmitOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(SUBMIT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as SubmitSuccess | SubmitError | null;
    if (res.ok && data && 'id' in data && data.status === 'submitted') {
      return {
        ok: true,
        id: data.id,
        ...(isAssemblyPath(data.assemblyPath) ? { assemblyPath: data.assemblyPath } : {}),
        // D-25: a multi-product order
        ...(Array.isArray(data.ids) && data.ids.every((x) => typeof x === 'string')
          ? { ids: data.ids }
          : {}),
        ...(Array.isArray(data.assemblyPaths) && data.assemblyPaths.every(isAssemblyPath)
          ? { assemblyPaths: data.assemblyPaths }
          : {}),
      };
    }
    const code = data && 'error' in data ? data.error.code : 'storage_failed';
    return { ok: false, code };
  } catch {
    return { ok: false, code: controller.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
