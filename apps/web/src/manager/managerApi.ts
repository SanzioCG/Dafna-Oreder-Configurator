import type { PriceList } from '@dafna/engine';

/** D-19: client of GET / PUT /api/manager (the manager PIN travels in a header, never a URL). */
export const MANAGER_URL = '/api/manager';

export type ManagerOutcome =
  | { ok: true; list: PriceList; updatedAt: string | null }
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
      error?: { code?: string; field?: string };
    } | null;
    if (res.ok && data?.list)
      return { ok: true, list: data.list, updatedAt: data.updatedAt ?? null };
    return { ok: false, code: data?.error?.code ?? 'network', field: data?.error?.field };
  } catch {
    return { ok: false, code: 'network' };
  }
}

export const managerLoad = (pin: string, fetchImpl?: typeof fetch) =>
  call(pin, { method: 'GET' }, fetchImpl);

export const managerSave = (pin: string, list: PriceList, fetchImpl?: typeof fetch) =>
  call(pin, { method: 'PUT', body: { list } }, fetchImpl);
