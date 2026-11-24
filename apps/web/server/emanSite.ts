/**
 * D-34: product pictures from EMAN's public shop (eman.uz). 1C has almost no pictures, the shop
 * has them, and every shop product shows the same 1C article. A picture is found by article:
 *
 *   GET https://eman.uz/api/v1/product/search/?q=<article>  -> [{id, name}]   (the shop's own search)
 *   GET https://eman.uz/ru/product/<id>/                    -> the page: "Артикул <b>…</b>", images
 *
 * Only a product whose page shows exactly that article counts. Read-only, public pages only;
 * a picture the kiosk uses is copied once into our own photo store (see copyPicture), so the
 * kiosk and its 3D view never load from the shop.
 */
export const EMAN_SITE = 'https://eman.uz';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** the article and the first product image of a shop page */
export function parseProductPage(html: string): { article: string | null; image: string | null } {
  const article = /Артикул[\s\S]{0,300}?<b>([^<]+)<\/b>/.exec(html)?.[1];
  const images = [...html.matchAll(/["'(](\/media\/product_(?:images|thumbnails)\/[^"' )]+)/g)].map(
    (m) => m[1]!,
  );
  // the full image first, the thumbnail when that is all there is
  const image = images.find((i) => i.includes('/product_images/')) ?? images[0] ?? null;
  return {
    article: article ? decode(article).trim() : null,
    image: image ? `${EMAN_SITE}${image}` : null,
  };
}

const cache = new Map<string, { at: number; url: string | null }>();
const TTL = 6 * 3600_000;

/** the shop picture of a 1C article, or null (cached per warm instance for 6 hours) */
export async function emanPicture(
  article: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<string | null> {
  const key = norm(article);
  if (!key) return null;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL) return hit.url;
  let url: string | null = null;
  const res = await fetchImpl(
    `${EMAN_SITE}/api/v1/product/search/?q=${encodeURIComponent(article.trim())}`,
    { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) },
  );
  if (res.ok) {
    const found = ((await res.json()) as { id?: unknown }[])
      .map((p) => p.id)
      .filter((id): id is number => typeof id === 'number')
      .slice(0, 5);
    for (const id of found) {
      const page = await fetchImpl(`${EMAN_SITE}/ru/product/${id}/`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!page.ok) continue;
      const p = parseProductPage(await page.text());
      if (p.article && norm(p.article) === key) {
        url = p.image;
        break;
      }
    }
  }
  cache.set(key, { at: now, url });
  return url;
}

/** test hook */
export function clearPictureCache() {
  cache.clear();
}

export const PICTURE_MAX_BYTES = 3 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * D-34: copies a shop picture into our photo store (the Vercel Blob store; a data URL on the
 * dev server) and returns its URL. Only https://eman.uz/media/… pictures are fetched.
 */
export async function copyPicture(
  src: string,
  name: string,
  put: ((name: string, body: ArrayBuffer, contentType: string) => Promise<string>) | undefined,
  fetchImpl: typeof fetch = fetch,
  /** dev server only: no store, a data URL */
  dataUrls = false,
): Promise<string | null> {
  if (!put && !dataUrls) return null;
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return null;
  }
  if (u.origin !== EMAN_SITE || !u.pathname.startsWith('/media/')) return null;
  const res = await fetchImpl(u.toString(), { signal: AbortSignal.timeout(15_000) });
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
  if (!res.ok || !TYPES[type]) return null;
  const body = await res.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > PICTURE_MAX_BYTES) return null;
  if (!put) return `data:${type};base64,${Buffer.from(body).toString('base64')}`; // dev only
  return put(`${name}.${TYPES[type]}`, body, type);
}
