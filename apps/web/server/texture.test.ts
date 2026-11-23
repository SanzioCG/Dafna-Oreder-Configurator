// @vitest-environment node
import { EMPTY_EXTENSION, applyCatalogExtension, textureFor } from '@dafna/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { BLOB_API, blobPutter, blobTokenFrom } from './blob';
import {
  CachedCatalog,
  MemoryCatalogStore,
  catalogToRows,
  mergeCatalog,
  rowsToCatalog,
  textureUrlAllowed,
} from './catalog';
import { CachedPrices, MemoryPriceStore, handleManager, type ManagerDeps } from './prices';
import { RateLimiter } from './rateLimit';

afterEach(() => applyCatalogExtension(EMPTY_EXTENSION));

const BLOB = 'https://abc123.public.blob.vercel-storage.com/textures/ldsp_white_16-x1y2.jpg';

function deps(extra: Partial<ManagerDeps> = {}): ManagerDeps & { uploaded: string[] } {
  const uploaded: string[] = [];
  const catalogStore = new MemoryCatalogStore();
  const store = new MemoryPriceStore();
  return {
    store,
    prices: new CachedPrices(store, 0),
    catalogStore,
    catalog: new CachedCatalog(catalogStore, 0),
    managerPin: '9137',
    limiter: new RateLimiter(100, 60_000),
    now: () => new Date('2026-11-23T09:05:00Z'),
    putTexture: async (name) => {
      uploaded.push(name);
      return BLOB;
    },
    uploaded,
    ...extra,
  };
}

const upload = (d: ManagerDeps, body: BodyInit, headers: Record<string, string>) =>
  handleManager(
    new Request('http://x/api/manager', {
      method: 'POST',
      headers: { 'x-manager-pin': '9137', ...headers },
      body,
    }),
    d,
  );

describe('D-21 decor photos (textures)', () => {
  it('the manager uploads a photo for a material and gets its URL', async () => {
    const d = deps();
    const res = await upload(d, new Uint8Array([1, 2, 3]), {
      'content-type': 'image/jpeg',
      'x-material-id': 'ldsp_white_16',
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { url: string }).url).toBe(BLOB);
    expect(d.uploaded).toEqual(['textures/ldsp_white_16.jpg']);
  });

  it('no PIN, not an image, too large or no storage -> refused', async () => {
    const d = deps();
    const img = { 'content-type': 'image/png', 'x-material-id': 'ldsp_white_16' };
    expect(
      (
        await handleManager(
          new Request('http://x/api/manager', { method: 'POST', headers: img, body: 'x' }),
          d,
        )
      ).status,
    ).toBe(401);
    expect((await upload(d, 'x', { ...img, 'content-type': 'text/html' })).status).toBe(400);
    expect((await upload(d, 'x', { ...img, 'x-material-id': '../etc' })).status).toBe(400);
    expect((await upload(d, new Uint8Array(3 * 1024 * 1024 + 1), img)).status).toBe(413);
    const none = deps({ putTexture: undefined });
    const res = await upload(none, 'x', img);
    expect([res.status, ((await res.json()) as { error: { code: string } }).error.code]).toEqual([
      503,
      'storage_not_configured',
    ]);
  });

  it('a photo is saved with the catalog for built-in and added boards; only Blob URLs', () => {
    const ok = mergeCatalog(EMPTY_EXTENSION, {
      textures: { ldsp_white_16: { url: BLOB, widthMm: 1200, heightMm: 800 } },
    });
    if (!ok.ok) throw new Error(ok.field);
    expect(ok.ext.textures).toEqual({
      ldsp_white_16: { url: BLOB, widthMm: 1200, heightMm: 800 },
    });
    // rows round-trip
    expect(rowsToCatalog(catalogToRows(ok.ext)).textures).toEqual(ok.ext.textures);
    // an unknown material, a foreign URL or a silly size are refused
    for (const textures of [
      { nope: { url: BLOB, widthMm: 1000, heightMm: 1000 } },
      { ldsp_white_16: { url: 'https://evil.example/x.jpg', widthMm: 1000, heightMm: 1000 } },
      { ldsp_white_16: { url: 'javascript:alert(1)', widthMm: 1000, heightMm: 1000 } },
      { ldsp_white_16: { url: BLOB, widthMm: 5, heightMm: 1000 } },
    ])
      expect(mergeCatalog(EMPTY_EXTENSION, { textures }).ok).toBe(false);
    // data URLs only on the dev server
    expect(textureUrlAllowed('data:image/jpeg;base64,AAAA')).toBe(false);
    expect(textureUrlAllowed('data:image/jpeg;base64,AAAA', true)).toBe(true);
  });

  it('removing a photo is allowed (visual only); applying makes it the engine texture', () => {
    const first = mergeCatalog(EMPTY_EXTENSION, {
      textures: { ldsp_white_16: { url: BLOB, widthMm: 1000, heightMm: 1000 } },
    });
    if (!first.ok) throw new Error(first.field);
    applyCatalogExtension(first.ext);
    expect(textureFor('ldsp_white_16')?.url).toBe(BLOB);
    const second = mergeCatalog(first.ext, { textures: {} });
    if (!second.ok) throw new Error(second.field);
    applyCatalogExtension(second.ext);
    expect(textureFor('ldsp_white_16')).toBeUndefined();
  });
});

describe('D-21 Vercel Blob upload request', () => {
  it('no token -> no storage; with a token: a public PUT with a random suffix', async () => {
    expect(blobPutter(undefined)).toBeUndefined();
    const seen: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ url: BLOB }));
    }) as unknown as typeof fetch;
    const put = blobPutter('vercel_blob_rw_STORE1_secret', fake)!;
    expect(await put('textures/a.jpg', new ArrayBuffer(4), 'image/jpeg')).toBe(BLOB);
    const h = seen[0]!.init.headers as Record<string, string>;
    expect(seen[0]!.url).toBe(`${BLOB_API}/?pathname=textures%2Fa.jpg`);
    expect([seen[0]!.init.method, h['x-vercel-blob-access'], h['x-add-random-suffix']]).toEqual([
      'PUT',
      'public',
      '1',
    ]);
    expect(h['x-vercel-blob-store-id']).toBe('STORE1');
    expect(h.authorization).toBe('Bearer vercel_blob_rw_STORE1_secret');
  });
});

describe('D-21 Blob token', () => {
  it('BLOB_READ_WRITE_TOKEN, or a custom-prefixed one holding a Blob token', () => {
    expect(blobTokenFrom({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_A_x' })).toBe(
      'vercel_blob_rw_A_x',
    );
    expect(blobTokenFrom({ TEXTURES_READ_WRITE_TOKEN: 'vercel_blob_rw_B_y' })).toBe(
      'vercel_blob_rw_B_y',
    );
    expect(blobTokenFrom({ OTHER_READ_WRITE_TOKEN: 'not-a-blob-token' })).toBeUndefined();
    expect(blobTokenFrom({})).toBeUndefined();
  });
});
