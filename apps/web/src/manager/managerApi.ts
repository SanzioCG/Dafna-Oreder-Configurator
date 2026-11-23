import type { CatalogExtension, PriceList } from '@dafna/engine';
import type { CatalogDraft } from './ManagerPage';

/** D-19: client of GET / PUT /api/manager (the manager PIN travels in a header, never a URL). */
export const MANAGER_URL = '/api/manager';

export type ManagerOutcome =
  | { ok: true; list: PriceList; updatedAt: string | null; catalog?: CatalogExtension }
  | { ok: false; code: string; field?: string };

async function call(
  pin: string,
  init: { method: 'GET' | 'PUT'; body?: unknown },
  fetchImpl: typeof fetch = fetch,
): Promise<ManagerOutcome> {
  try {
    const res = await fetchImpl(MANAGER_URL, {
      method: init.method,
      headers: { 'content-type': 'application/json', 'x-manager-pin': pin },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => null)) as {
      list?: PriceList;
      updatedAt?: string | null;
      catalog?: CatalogExtension;
      error?: { code?: string; field?: string };
    } | null;
    if (res.ok && data?.list)
      return {
        ok: true,
        list: data.list,
        updatedAt: data.updatedAt ?? null,
        catalog: data.catalog,
      };
    return { ok: false, code: data?.error?.code ?? 'network', field: data?.error?.field };
  } catch {
    return { ok: false, code: 'network' };
  }
}

export const managerLoad = (pin: string, fetchImpl?: typeof fetch) =>
  call(pin, { method: 'GET' }, fetchImpl);

/** D-20: the catalog (materials / hardware) is saved first, then the prices */
export const managerSave = (
  pin: string,
  list: PriceList,
  catalog: CatalogDraft,
  fetchImpl?: typeof fetch,
) => call(pin, { method: 'PUT', body: { list, catalog } }, fetchImpl);

/** D-21: uploads a decor photo; the returned URL is saved with the catalog afterwards */
export async function managerUploadTexture(
  pin: string,
  materialId: string,
  image: Blob,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; url: string } | { ok: false; code: string }> {
  try {
    const res = await fetchImpl(MANAGER_URL, {
      method: 'POST',
      headers: {
        'content-type': image.type || 'image/jpeg',
        'x-manager-pin': pin,
        'x-material-id': materialId,
      },
      body: image,
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await res.json().catch(() => null)) as {
      url?: string;
      error?: { code?: string };
    } | null;
    if (res.ok && data?.url) return { ok: true, url: data.url };
    return { ok: false, code: data?.error?.code ?? 'network' };
  } catch {
    return { ok: false, code: 'network' };
  }
}
