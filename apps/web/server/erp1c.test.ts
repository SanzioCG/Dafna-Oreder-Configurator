import { describe, expect, it } from 'vitest';
import { DEFAULT_ERP_URL, erpFromEnv, handleErp, type ErpConfig } from './erp1c';
import { RateLimiter } from './rateLimit';

/** D-30: Dafna's 1C (OData, read-only) for the manager page, with a fake 1C */
const KEY = '115514ae-80f4-4095-9117-42bae0a43d76';
const UZS = '9d722115-8095-11ea-a9af-505dac4282cc';

function fake1C(fail = false) {
  const urls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = decodeURIComponent(String(input));
    urls.push(url);
    expect((init?.headers as Record<string, string>)['X-API-TOKEN']).toBe('t0ken');
    if (fail) return new Response('{"detail":"internal 192.168.1.1"}', { status: 500 });
    const value = url.includes('Catalog_Номенклатура')
      ? [
          {
            Ref_Key: KEY,
            Description: 'Петля Master 18ММ',
            Артикул: '10100432Y',
            ЕдиницаИзмерения: { Description: 'шт' },
          },
          { Ref_Key: 'x', Description: 'Папка', Артикул: '', IsFolder: true },
        ]
      : url.includes('ЦеныНоменклатуры')
        ? [{ Номенклатура_Key: KEY, Цена: 11598.9, Валюта_Key: UZS }]
        : url.includes('СвободныеОстатки')
          ? [
              { Номенклатура_Key: KEY, ВНаличииBalance: 9000 },
              { Номенклатура_Key: KEY, ВНаличииBalance: 461 },
            ]
          : url.includes('Catalog_Валюты')
            ? [{ Ref_Key: UZS, Description: 'UZS' }]
            : [];
    return new Response(JSON.stringify({ value }), { status: 200 });
  }) as typeof fetch;
  return { urls, fetchImpl };
}

const cfg = (f: typeof fetch): ErpConfig => ({
  url: DEFAULT_ERP_URL,
  token: 't0ken',
  priceType: '1b9d6aa5-fe2c-11ea-a9b9-505dac4282cc',
  fetchImpl: f,
});
const req = (body: unknown, pin = '1234') =>
  new Request('http://localhost/api/erp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-manager-pin': pin },
    body: JSON.stringify(body),
  });
const deps = (erp: ErpConfig | null) => ({
  erp,
  managerPin: '1234',
  limiter: new RateLimiter(100, 60_000),
});

describe('D-30 /api/erp (1C for the manager page)', () => {
  it('the token comes from the environment only; no token -> erp_not_configured', async () => {
    expect(erpFromEnv({})).toBeNull();
    expect(erpFromEnv({ EMAN_1C_TOKEN: ' abc ' })?.token).toBe('abc');
    const r = await handleErp(req({ action: 'search', q: 'master' }), deps(null));
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('erp_not_configured');
  });

  it('the manager PIN is required', async () => {
    const { fetchImpl, urls } = fake1C();
    const r = await handleErp(req({ action: 'search', q: 'master' }, '9999'), deps(cfg(fetchImpl)));
    expect(r.status).toBe(401);
    expect(urls).toEqual([]);
  });

  it('search: by name words or the exact article, folders and deleted items left out', async () => {
    const { fetchImpl, urls } = fake1C();
    const r = await handleErp(req({ action: 'search', q: "MASTER 18'" }), deps(cfg(fetchImpl)));
    const body = (await r.json()) as { items: unknown[] };
    expect(body.items).toEqual([
      { key: KEY, name: 'Петля Master 18ММ', article: '10100432Y', unit: 'шт' },
    ]);
    // quotes are doubled inside the OData literal
    expect(urls[0]).toContain(
      "substringof('MASTER', Description) and substringof('18''', Description)",
    );
  });

  it('prices: price, currency name and stock summed over the warehouses', async () => {
    const { fetchImpl } = fake1C();
    const r = await handleErp(
      req({ action: 'prices', articles: ['10100432Y'] }),
      deps(cfg(fetchImpl)),
    );
    expect(await r.json()).toEqual({
      prices: {
        '10100432Y': {
          name: 'Петля Master 18ММ',
          unit: 'шт',
          price: 11598.9,
          currency: 'UZS',
          stock: 9461,
        },
      },
    });
  });

  it("a 1C error is reported as erp_unavailable, never with 1C's own text", async () => {
    const { fetchImpl } = fake1C(true);
    const r = await handleErp(req({ action: 'search', q: 'master' }), deps(cfg(fetchImpl)));
    expect(r.status).toBe(502);
    const text = await r.text();
    expect(text).toContain('erp_unavailable');
    expect(text).not.toContain('192.168');
  });
});

describe('D-31 1C catalogue browse and links on save', () => {
  it('kinds: groups first, names sorted, service kinds (_ / !) left out', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          value: [
            { Ref_Key: KEY, Description: 'Кромка', IsFolder: true },
            { Ref_Key: UZS, Description: 'ЛДСП', IsFolder: true },
            { Ref_Key: 'a', Description: '!Деловые отходы', IsFolder: false },
            { Ref_Key: 'b', Description: 'Блоки', IsFolder: false },
          ],
        }),
      )) as typeof fetch;
    const r = await handleErp(req({ action: 'kinds' }), deps(cfg(fetchImpl)));
    const body = (await r.json()) as { kinds: { name: string; folder: boolean }[] };
    expect(body.kinds.map((k) => k.name)).toEqual(['Кромка', 'ЛДСП', 'Блоки']);
  });

  it('items of a kind: the count is asked apart ($expand and $inlinecount do not mix in 1C)', async () => {
    const { fetchImpl, urls } = fake1C();
    const r = await handleErp(req({ action: 'items', kind: KEY, skip: 50 }), deps(cfg(fetchImpl)));
    const body = (await r.json()) as { items: { article: string; price: number }[] };
    expect(body.items[0]).toMatchObject({ article: '10100432Y', price: 11598.9, stock: 9461 });
    const page = urls.find((u) => u.includes('$skip=50'))!;
    expect(page).toContain('$expand');
    expect(page).not.toContain('$inlinecount');
  });
});
