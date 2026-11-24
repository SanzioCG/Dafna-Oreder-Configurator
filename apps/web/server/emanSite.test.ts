import { afterEach, describe, expect, it } from 'vitest';
import { clearPictureCache, copyPicture, emanPicture, parseProductPage } from './emanSite';

/** D-34: product pictures from EMAN's shop (eman.uz), found by the 1C article */
const PAGE = (article: string, img = '/media/product_images/1000015080.webp') => `
  <div class="products-card-vendor-code"><span>Артикул</span>
      <b>${article}</b></div>
  <img src="/media/product_thumbnails/abc.jpg"><img src="${img}">`;

function fakeShop(pages: Record<number, string>, found: number[]) {
  const urls: string[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/api/v1/product/search/'))
      return new Response(JSON.stringify(found.map((id) => ({ id, name: 'x' }))));
    const id = Number(/product\/(\d+)\//.exec(url)?.[1]);
    if (pages[id]) return new Response(pages[id]);
    if (url.endsWith('.webp'))
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } });
    return new Response('', { status: 404 });
  }) as typeof fetch;
  return { f, urls };
}

afterEach(clearPictureCache);

describe('D-34 eman.uz pictures', () => {
  it('a shop page: its article and its full image (before the thumbnail)', () => {
    expect(parseProductPage(PAGE('H1362 ST12'))).toEqual({
      article: 'H1362 ST12',
      image: 'https://eman.uz/media/product_images/1000015080.webp',
    });
  });

  it('only the product whose page shows exactly the article counts', async () => {
    // the search finds the edge band of the same decor first
    const { f } = fakeShop({ 1: PAGE('H1362 ST12 ABS'), 2: PAGE('H1362 ST12') }, [1, 2]);
    expect(await emanPicture('H1362 ST12', f)).toBe(
      'https://eman.uz/media/product_images/1000015080.webp',
    );
    const none = fakeShop({ 1: PAGE('OTHER') }, [1]);
    expect(await emanPicture('Z999', none.f)).toBeNull();
  });

  it('a found picture is cached (one shop lookup per article)', async () => {
    const { f, urls } = fakeShop({ 2: PAGE('A1') }, [2]);
    await emanPicture('A1', f);
    await emanPicture('a1 ', f);
    expect(urls.filter((u) => u.includes('/search/'))).toHaveLength(1);
  });

  it('copy: only eman.uz/media pictures, into our store (none without a store)', async () => {
    const { f } = fakeShop({}, []);
    const put = async (name: string) => `https://x.public.blob.vercel-storage.com/${name}`;
    expect(
      await copyPicture('https://eman.uz/media/product_images/1.webp', 'eman/a1', put, f),
    ).toBe('https://x.public.blob.vercel-storage.com/eman/a1.webp');
    expect(await copyPicture('https://evil.example/media/1.webp', 'eman/a1', put, f)).toBeNull();
    expect(await copyPicture('https://eman.uz/admin/1.webp', 'eman/a1', put, f)).toBeNull();
    expect(
      await copyPicture('https://eman.uz/media/product_images/1.webp', 'x', undefined, f),
    ).toBeNull();
    expect(
      (
        await copyPicture('https://eman.uz/media/product_images/1.webp', 'x', undefined, f, true)
      )?.startsWith('data:image/webp;base64,'),
    ).toBe(true);
  });
});
