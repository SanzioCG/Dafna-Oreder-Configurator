/**
 * D-21: decor photos in the Vercel Blob store, through its HTTP API (the request @vercel/blob's
 * put() makes; no SDK, so the function bundles stay small). Public access and a random suffix,
 * so a replaced photo gets a new URL and caches never show the old one. The token comes from
 * the Blob store connected to the Vercel project (env BLOB_READ_WRITE_TOKEN, shape
 * "vercel_blob_rw_<storeId>_<secret>"); without it uploads answer storage_not_configured.
 */
export const BLOB_API = 'https://vercel.com/api/blob';
export const BLOB_API_VERSION = '13';

export function blobPutter(
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): ((name: string, body: ArrayBuffer, contentType: string) => Promise<string>) | undefined {
  if (!token) return undefined;
  const storeId = token.split('_')[3] ?? '';
  return async (name, body, contentType) => {
    const res = await fetchImpl(`${BLOB_API}/?${new URLSearchParams({ pathname: name })}`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'x-api-version': BLOB_API_VERSION,
        'x-vercel-blob-store-id': storeId,
        'x-vercel-blob-access': 'public',
        'x-content-type': contentType,
        'x-add-random-suffix': '1',
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json().catch(() => null)) as { url?: string } | null;
    if (!res.ok || !data?.url) throw new Error(`blob put failed: ${res.status}`);
    return data.url;
  };
}
