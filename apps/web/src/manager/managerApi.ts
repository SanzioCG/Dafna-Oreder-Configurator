import type { CatalogExtension, PriceList } from '@dafna/engine';
import type { CatalogDraft } from './ManagerPage';

/** D-19: client of GET / PUT /api/manager (D-38: the staff session cookie goes by itself). */
export const MANAGER_URL = '/api/manager';

export type ManagerOutcome =
  | { ok: true; list: PriceList; updatedAt: string | null; catalog?: CatalogExtension }
  | { ok: false; code: string; field?: string };

async function call(
  init: { method: 'GET' | 'PUT'; body?: unknown },
  fetchImpl: typeof fetch = fetch,
): Promise<ManagerOutcome> {
  try {
    const res = await fetchImpl(MANAGER_URL, {
      method: init.method,
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
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

export const managerLoad = (fetchImpl?: typeof fetch) => call({ method: 'GET' }, fetchImpl);

/** D-20: the catalog (materials / hardware) is saved first, then the prices */
export const managerSave = (list: PriceList, catalog: CatalogDraft, fetchImpl?: typeof fetch) =>
  call({ method: 'PUT', body: { list, catalog } }, fetchImpl);

/** D-21: uploads a decor photo; the returned URL is saved with the catalog afterwards */
export async function managerUploadTexture(
  materialId: string,
  image: Blob,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; url: string } | { ok: false; code: string }> {
  try {
    const res = await fetchImpl(MANAGER_URL, {
      method: 'POST',
      headers: {
        'content-type': image.type || 'image/jpeg',
        'x-material-id': materialId,
      },
      credentials: 'same-origin',
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
