import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  EMPTY_EXTENSION,
  applyCatalogExtension,
  defaultParams,
  generate,
  priceListDemo,
  wardrobeTemplate,
  type CatalogExtension,
} from '@dafna/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { fetchQuote } from '../state/priceSource';
import { forgetStaffPin, verifyStaffPin } from '../state/staffAccess';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ManagerPage } from './ManagerPage';

afterEach(() => {
  cleanup();
  forgetStaffPin();
  applyCatalogExtension(EMPTY_EXTENSION);
});

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** a fake /api/manager: PIN 9137, keeps what is PUT */
function fakeManagerApi() {
  const calls: Call[] = [];
  let saved: { list: unknown; updatedAt: string } | null = null;
  // the server's append-only merge, simplified: new entries get ids
  let catalog: CatalogExtension = EMPTY_EXTENSION;
  const impl = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    const body = init.body
      ? (JSON.parse(String(init.body)) as { list: unknown; catalog?: CatalogExtension })
      : undefined;
    calls.push({ url, method: String(init.method), headers, body });
    if (headers['x-manager-pin'] !== '9137')
      return new Response(JSON.stringify({ error: { code: 'wrong_pin' } }), { status: 401 });
    if (init.method === 'PUT') {
      if (body!.catalog)
        catalog = {
          materials: body!.catalog.materials.map((m, i) => ({ ...m, id: m.id ?? `x_m${i + 1}` })),
          hardware: body!.catalog.hardware.map((h, i) => ({
            ...h,
            id: h.id ?? `x_h${i + 1}`,
            brandKey: h.brandKey ?? `x_${h.brand.toLowerCase()}`,
          })),
        };
      saved = { list: { ...(body!.list as object), demo: false }, updatedAt: '2026-11-23 14:05' };
      return new Response(JSON.stringify({ ok: true, ...saved, catalog }));
    }
    return new Response(
      JSON.stringify({ ...(saved ?? { list: priceListDemo, updatedAt: null }), catalog }),
    );
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const login = async (pin: string) => {
  fireEvent.change(screen.getByTestId('mgr-pin'), { target: { value: pin } });
  fireEvent.click(screen.getByRole('button', { name: 'Kirish' }));
};

describe('D-19 manager price page', () => {
  it('a wrong PIN stays on the PIN form', async () => {
    const api = fakeManagerApi();
    render(
      <ThemeProvider>
        <ManagerPage fetchImpl={api.impl} />
      </ThemeProvider>,
    );
    await login('1234');
    expect((await screen.findByRole('alert')).textContent).toContain("PIN noto'g'ri");
    expect(screen.queryByTestId('mgr-save')).toBeNull();
  });

  it('materials: every board with its data; a sheet price and 1C code are saved', async () => {
    const api = fakeManagerApi();
    render(
      <ThemeProvider>
        <ManagerPage fetchImpl={api.impl} />
      </ThemeProvider>,
    );
    await login('9137');
    await screen.findByTestId('mgr-save');
    expect(screen.getByTestId('mgr-updated').textContent).toContain('hali saqlanmagan');
    // the built-in catalog is listed (search narrows it); a row opens the full card
    fireEvent.change(screen.getByTestId('mgr-material-search'), { target: { value: 'шагрень' } });
    fireEvent.click(screen.getByTestId('mgr-material-row-ldsp_white_16'));
    const card = screen.getByTestId('mgr-material-card');
    expect(card.textContent).toContain('Asosiy katalog');
    fireEvent.change(screen.getByTestId('mgr-sheet-ldsp_white_16'), {
      target: { value: '579600' },
    });
    fireEvent.change(screen.getByTestId('mgr-erp-ldsp_white_16'), { target: { value: 'LD-0001' } });
    fireEvent.change(screen.getByTestId('mgr-edge-price'), { target: { value: '4200' } });
    expect(screen.getByTestId('mgr-updated').textContent).toContain('Saqlanmagan');
    fireEvent.click(screen.getByTestId('mgr-save'));
    await waitFor(() =>
      expect(screen.getByTestId('mgr-updated').textContent).toContain('2026-11-23 14:05'),
    );
    const put = api.calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe('/api/manager');
    expect(put.headers['x-manager-pin']).toBe('9137'); // a header, never the URL
    const list = (put.body as { list: Record<string, unknown> }).list as {
      edgePerM: number;
      erpCodes: Record<string, string>;
      boardSheets: Record<string, { price: number; lengthMm: number; widthMm: number }>;
    };
    expect(list.boardSheets.ldsp_white_16).toEqual({
      price: 579600,
      lengthMm: 2750, // Dafna chipboard (no EGGER code): the GibLab sheet size
      widthMm: 1830,
    });
    expect(list.erpCodes.ldsp_white_16).toBe('LD-0001');
    expect(list.edgePerM).toBe(4200);
  });

  it('labour and assembly are services; the profit % and services change the price', async () => {
    const api = fakeManagerApi();
    render(
      <ThemeProvider>
        <ManagerPage fetchImpl={api.impl} />
      </ThemeProvider>,
    );
    await login('9137');
    await screen.findByTestId('mgr-save');
    fireEvent.click(screen.getByTestId('mgr-tab-profit'));
    const total = () =>
      Number(screen.getByTestId('mgr-total-wardrobe').textContent?.replace(/\D/g, ''));
    const t0 = total();
    fireEvent.change(screen.getByTestId('mgr-markup'), { target: { value: '40' } });
    const t1 = total();
    expect(t1).toBeGreaterThan(t0);
    // the demo labour per m² became a service; edge banding per metre and assembly per m² wait
    fireEvent.click(screen.getByTestId('mgr-tab-services'));
    const names = () =>
      [...document.querySelectorAll('[data-testid^="mgr-service-name-"]')].map(
        (x) => (x as HTMLInputElement).value,
      );
    // D-29: Rover per m², the oval edge by hand
    expect(names()).toEqual([
      'Ish haqi (kesish, ishlov berish)',
      'Kromkalash',
      "Yig'ish",
      'Rover (CNC ishlov)',
      'Ovalniy kromka',
    ]);
    const basis = (i: number) =>
      (screen.getByTestId(`mgr-service-basis-${i}`) as HTMLSelectElement).value;
    expect([0, 1, 2, 3, 4].map(basis)).toEqual(['m2', 'edge_m', 'm2', 'm2', 'manual_m']);
    fireEvent.change(screen.getByTestId('mgr-service-price-1'), { target: { value: '1500' } });
    fireEvent.change(screen.getByTestId('mgr-service-price-2'), { target: { value: '20000' } });
    fireEvent.click(screen.getByTestId('mgr-tab-profit'));
    expect(total()).toBeGreaterThan(t1);
    fireEvent.click(screen.getByTestId('mgr-save'));
    await waitFor(() => expect(screen.getByTestId('mgr-save').textContent).toBe('Saqlandi'));
    const list = (api.calls.find((c) => c.method === 'PUT')!.body as { list: PriceListLike }).list;
    expect(list.markupPct).toBe(40);
    expect(list.laborPerM2).toBe(0); // the labour lives in the services now (same price)
    expect(list.services.map((s) => [s.name, s.basis, s.price])).toEqual([
      ['Ish haqi (kesish, ishlov berish)', 'm2', priceListDemo.laborPerM2],
      ['Kromkalash', 'edge_m', 1500],
      ["Yig'ish", 'm2', 20000],
      ['Rover (CNC ishlov)', 'm2', 0],
      ['Ovalniy kromka', 'manual_m', 0],
    ]);
  });
});

interface PriceListLike {
  markupPct: number;
  laborPerM2: number;
  services: { name: string; basis: string; price: number }[];
}

describe('D-20 manager adds materials, hardware and services', () => {
  it('a new board (all its data) and a new hinge become kiosk options with price rows', async () => {
    const api = fakeManagerApi();
    render(
      <ThemeProvider>
        <ManagerPage fetchImpl={api.impl} />
      </ThemeProvider>,
    );
    await login('9137');
    await screen.findByTestId('mgr-save');
    // a board: its card opens at once
    fireEvent.click(screen.getByTestId('mgr-material-add'));
    fireEvent.change(screen.getByTestId('mgr-material-name'), {
      target: { value: 'Дуб Гладстоун табак' },
    });
    expect(screen.getByTestId('mgr-material-card').textContent).toContain('avval «Saqlash»');
    // a hinge
    fireEvent.click(screen.getByTestId('mgr-tab-hardware'));
    fireEvent.click(screen.getByTestId('mgr-hw-add'));
    // D-33: the new item is picked from 1C; an item 1C does not have is added by hand
    fireEvent.click(screen.getByRole('button', { name: "Qo'lda qo'shish" }));
    fireEvent.change(screen.getByTestId('mgr-hw-brand-0'), { target: { value: 'Blum' } });
    fireEvent.change(screen.getByTestId('mgr-hw-model-0'), {
      target: { value: 'Clip Top Blumotion' },
    });
    fireEvent.click(screen.getByTestId('mgr-save'));
    await waitFor(() => expect(screen.getByTestId('mgr-save').textContent).toBe('Saqlandi'));
    const put = api.calls.find((c) => c.method === 'PUT')!.body as { catalog: CatalogExtension };
    expect(put.catalog.materials[0]).toMatchObject({
      name: 'Дуб Гладстоун табак',
      kind: 'ldsp',
      thicknessMm: 16,
      grain: true,
      moistureResistant: false,
      usage: ['corpus', 'door'],
    });
    expect(put.catalog.materials[0]!.id).toBeUndefined(); // the server assigns ids
    // the saved catalog is applied: the kiosk templates offer the new board and brand
    const opts = (key: string) =>
      wardrobeTemplate.parameters.find((p) => p.key === key)?.options ?? [];
    expect(opts('corpusMaterial')).toContain('x_m1');
    expect(opts('hingeBrand')).toContain('x_blum');
    // the hinge now has its price and 1C code row
    expect(screen.getByTestId('mgr-hw-x_h1')).toBeTruthy();
    expect(screen.getByTestId('mgr-erp-x_h1')).toBeTruthy();
    // the board's card has its price fields now
    fireEvent.click(screen.getByTestId('mgr-tab-materials'));
    fireEvent.click(screen.getByTestId('mgr-material-row-x_m1'));
    expect(screen.getByTestId('mgr-sheet-x_m1')).toBeTruthy();
    expect(screen.getByTestId('mgr-erp-x_m1')).toBeTruthy();
  });
});

describe('D-21 unsaved new materials', () => {
  it('one blank new material at a time, and it can be dropped before saving', async () => {
    const api = fakeManagerApi();
    render(
      <ThemeProvider>
        <ManagerPage fetchImpl={api.impl} />
      </ThemeProvider>,
    );
    await login('9137');
    await screen.findByTestId('mgr-save');
    const blanks = () => document.querySelectorAll('[data-testid^="mgr-material-row-new-"]').length;
    fireEvent.click(screen.getByTestId('mgr-material-add'));
    fireEvent.click(screen.getByTestId('mgr-material-add'));
    fireEvent.click(screen.getByTestId('mgr-material-add'));
    expect(blanks()).toBe(1);
    fireEvent.click(screen.getByTestId('mgr-material-drop'));
    expect(blanks()).toBe(0);
  });
});

describe('D-19 kiosk price request', () => {
  const input = () => {
    const params = defaultParams(wardrobeTemplate);
    return { template: wardrobeTemplate, params, result: generate(wardrobeTemplate, params) };
  };
  const capture = () => {
    const seen: Call[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      seen.push({
        url,
        method: String(init.method),
        headers: init.headers as Record<string, string>,
        body: JSON.parse(String(init.body)),
      });
      if (url === '/api/staff-pin') return new Response('{"ok":true}');
      return new Response(
        JSON.stringify({ total: 2571000, currency: 'UZS', demo: false, priceListVersion: 'live' }),
      );
    }) as unknown as typeof fetch;
    return { seen, impl };
  };

  it('a customer sends the product and its params only, no PIN', async () => {
    const { seen, impl } = capture();
    const q = await fetchQuote(input(), undefined, impl);
    expect(q?.total).toBe(2571000);
    expect(seen[0]!.headers['x-staff-pin']).toBeUndefined();
    expect(Object.keys(seen[0]!.body as object).sort()).toEqual([
      'params',
      'templateId',
      'templateVersion',
    ]);
  });

  it('after the consultant PIN is accepted, the quote asks for the breakdown with it', async () => {
    const { seen, impl } = capture();
    expect((await verifyStaffPin('2580', impl)).ok).toBe(true);
    await fetchQuote(input(), undefined, impl);
    expect(seen.at(-1)!.headers['x-staff-pin']).toBe('2580');
    forgetStaffPin();
    await fetchQuote(input(), undefined, impl);
    expect(seen.at(-1)!.headers['x-staff-pin']).toBeUndefined();
  });

  it('the server unreachable -> no price (never a made-up one)', async () => {
    const down = (() =>
      Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    expect(await fetchQuote(input(), undefined, down)).toBeNull();
  });
});
