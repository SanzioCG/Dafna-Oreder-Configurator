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
import { ThemeProvider } from '../theme/ThemeProvider';
import { ManagerPage } from './ManagerPage';
import { ORDER_STATUSES, tashkentDay, type OrderRow } from './ordersApi';
import { LEAD_STATUSES } from '../../server/types';

afterEach(() => {
  cleanup();
  applyCatalogExtension(EMPTY_EXTENSION);
});

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** a fake /api/auth + /api/manager (D-38): staff "aziz" / "aziz-pass-1", keeps what is PUT */
function fakeManagerApi() {
  const calls: Call[] = [];
  let signedIn = false;
  let saved: { list: unknown; updatedAt: string } | null = null;
  // the server's append-only merge, simplified: new entries get ids
  let catalog: CatalogExtension = EMPTY_EXTENSION;
  // D-47: two applications, one today (Tashkent) and one older
  const orders: OrderRow[] = [
    order('DFN-251125-AAAA', `${tashkentDay()} 10:15:00`, 3, { firstName: 'Malika' }),
    order('DFN-251101-BBBB', '2026-11-01 09:00:00', 2, {
      product: 'Stol',
      status: 'Tasdiqlandi',
      kiosk: 'k1',
    }),
  ];
  const impl = (async (url: string, init: RequestInit) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    if (url === '/api/auth') {
      const a = init.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {};
      calls.push({ url, method: String(init.method), headers, body: a });
      if (a.action === 'login' && a.login === 'aziz' && a.password === 'aziz-pass-1') {
        signedIn = true;
        return new Response(
          JSON.stringify({ user: { login: 'aziz', name: 'Aziz', role: 'manager' } }),
        );
      }
      if (a.action === 'logout') {
        signedIn = false;
        return new Response(JSON.stringify({ ok: true }));
      }
      return new Response(
        JSON.stringify({ error: { code: a.action === 'login' ? 'wrong_login' : 'unauthorized' } }),
        { status: 401 },
      );
    }
    if (url === '/api/orders') {
      const b = init.body ? (JSON.parse(String(init.body)) as Record<string, string>) : undefined;
      calls.push({ url, method: String(init.method), headers, body: b });
      if (!signedIn)
        return new Response(JSON.stringify({ error: { code: 'unauthorized' } }), { status: 401 });
      if (init.method === 'POST') {
        const o = orders.find((x) => x.ref === Number(b!.ref) && x.id === b!.id);
        if (!o)
          return new Response(JSON.stringify({ error: { code: 'row_moved' } }), { status: 409 });
        Object.assign(o, b!.status ? { status: b!.status } : {}, { manager: 'Aziz' });
        if (b!.managerNote !== undefined) o.managerNote = b!.managerNote;
        return new Response(JSON.stringify({ order: o }));
      }
      return new Response(JSON.stringify({ orders, sheetUrl: 'https://docs.google.com/x' }));
    }
    const body = init.body
      ? (JSON.parse(String(init.body)) as { list: unknown; catalog?: CatalogExtension })
      : undefined;
    calls.push({ url, method: String(init.method), headers, body });
    if (!signedIn)
      return new Response(JSON.stringify({ error: { code: 'unauthorized' } }), { status: 401 });
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

const order = (
  id: string,
  createdAt: string,
  ref: number,
  x: Partial<OrderRow> = {},
): OrderRow => ({
  ref,
  id,
  createdAt,
  status: 'Yangi',
  firstName: 'Aziza',
  lastName: '',
  phone: '+998 90 123 45 67',
  product: 'Shkaf',
  sizeMm: '1500 × 2100 × 600',
  corpus: 'Oq',
  door: 'Oq',
  sections: '2 ta qism',
  kiosk: '',
  telegram: 'sent',
  managerNote: '',
  manager: '',
  orderId: id,
  orderItem: '1/1',
  quantity: 1,
  ...x,
});

/** D-47: the page opens on "Bosh sahifa"; the catalogue sections have "Saqlash" */
const openCatalog = async () => {
  fireEvent.click(await screen.findByTestId('mgr-tab-materials'));
  await screen.findByTestId('mgr-save');
};

const login = async (password: string) => {
  fireEvent.change(await screen.findByTestId('mgr-login'), { target: { value: 'aziz' } });
  fireEvent.change(screen.getByTestId('mgr-password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Kirish' }));
};

describe('D-19 manager price page', () => {
  it('D-38 a wrong password stays on the sign-in form', async () => {
    const api = fakeManagerApi();
    render(
      <ThemeProvider>
        <ManagerPage fetchImpl={api.impl} />
      </ThemeProvider>,
    );
    await login('wrong-pass');
    expect((await screen.findByRole('alert')).textContent).toContain("Login yoki parol noto'g'ri");
    expect(screen.queryByTestId('mgr-save')).toBeNull();
  });

  it('materials: the back panel (HDF) and added boards only; a sheet price and 1C code are saved', async () => {
    const api = fakeManagerApi();
    render(
      <ThemeProvider>
        <ManagerPage fetchImpl={api.impl} />
      </ThemeProvider>,
    );
    await login('aziz-pass-1');
    await openCatalog();
    expect(screen.getByTestId('mgr-updated').textContent).toContain('hali saqlanmagan');
    // D-35: the demo decors are gone; the built-in back panel (HDF) stays; a row opens its card
    expect(screen.queryByTestId('mgr-material-row-ldsp_white_16')).toBeNull();
    fireEvent.click(screen.getByTestId('mgr-material-row-hdf_white_3'));
    const card = screen.getByTestId('mgr-material-card');
    expect(card.textContent).toContain('Asosiy katalog');
    fireEvent.change(screen.getByTestId('mgr-sheet-hdf_white_3'), {
      target: { value: '579600' },
    });
    fireEvent.change(screen.getByTestId('mgr-erp-hdf_white_3'), { target: { value: 'LD-0001' } });
    fireEvent.change(screen.getByTestId('mgr-edge-price'), { target: { value: '4200' } });
    expect(screen.getByTestId('mgr-updated').textContent).toContain('Saqlanmagan');
    fireEvent.click(screen.getByTestId('mgr-save'));
    await waitFor(() =>
      expect(screen.getByTestId('mgr-updated').textContent).toContain('2026-11-23 14:05'),
    );
    const put = api.calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe('/api/manager');
    // D-38: no secret in the request: the session is an HttpOnly cookie
    expect(JSON.stringify(put.headers)).not.toMatch(/pin|pass/i);
    const list = (put.body as { list: Record<string, unknown> }).list as {
      edgePerM: number;
      erpCodes: Record<string, string>;
      boardSheets: Record<string, { price: number; lengthMm: number; widthMm: number }>;
    };
    expect(list.boardSheets.hdf_white_3).toEqual({
      price: 579600,
      lengthMm: 2800,
      widthMm: 2070,
    });
    expect(list.erpCodes.hdf_white_3).toBe('LD-0001');
    expect(list.edgePerM).toBe(4200);
  });

  it('labour and assembly are services; the profit % and services change the price', async () => {
    const api = fakeManagerApi();
    render(
      <ThemeProvider>
        <ManagerPage fetchImpl={api.impl} />
      </ThemeProvider>,
    );
    await login('aziz-pass-1');
    await openCatalog();
    fireEvent.click(screen.getByTestId('mgr-tab-profit'));
    const total = () =>
      Number(screen.getByTestId('mgr-total-wardrobe').textContent?.replace(/\D/g, ''));
    const t0 = total();
    // D-48: the sheets of each board (raskroy) and the LESTER models of dafna.uz
    expect(screen.getByTestId('mgr-sheets-wardrobe').textContent).toMatch(/\d+ list/);
    expect(screen.getByTestId('mgr-lester-stol').textContent).toContain('1 706 000');
    // whole sheets cost more than the area with 15 % waste; back to the area for the rest
    fireEvent.click(screen.getByTestId('mgr-billing-sheets'));
    expect(total()).toBeGreaterThan(t0);
    expect(screen.queryByTestId('mgr-waste')).toBeNull();
    fireEvent.click(screen.getByTestId('mgr-billing-area'));
    expect(total()).toBe(t0);
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
    expect(list.boardBilling).toBe('area');
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
  boardBilling?: string;
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
    await login('aziz-pass-1');
    await openCatalog();
    // a board: its card opens at once
    fireEvent.click(screen.getByTestId('mgr-material-manual'));
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
    await login('aziz-pass-1');
    await openCatalog();
    const blanks = () => document.querySelectorAll('[data-testid^="mgr-material-row-new-"]').length;
    fireEvent.click(screen.getByTestId('mgr-material-manual'));
    fireEvent.click(screen.getByTestId('mgr-material-manual'));
    fireEvent.click(screen.getByTestId('mgr-material-manual'));
    expect(blanks()).toBe(1);
    fireEvent.click(screen.getByTestId('mgr-material-drop'));
    expect(blanks()).toBe(0);
  });
});

describe('D-47 "Bosh sahifa" and "Buyurtmalar"', () => {
  it('the page statuses are the sheet statuses', () => {
    expect([...ORDER_STATUSES]).toEqual([...LEAD_STATUSES]);
  });

  it('home counts the applications of today; a row opens it; a new status is saved with a note', async () => {
    const api = fakeManagerApi();
    render(
      <ThemeProvider>
        <ManagerPage fetchImpl={api.impl} />
      </ThemeProvider>,
    );
    await login('aziz-pass-1');
    await screen.findByTestId('mgr-home');
    // no catalogue "Saqlash" on the home page
    expect(screen.queryByTestId('mgr-save')).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('home-stat-today').querySelector('strong')!.textContent).toBe('1'),
    );
    expect(screen.getByTestId('home-stat-fresh').querySelector('strong')!.textContent).toBe('1');
    expect(screen.getByTestId('home-stat-confirmed').querySelector('strong')!.textContent).toBe(
      '1',
    );

    fireEvent.click(screen.getByTestId('home-row-DFN-251125-AAAA'));
    const drawer = await screen.findByTestId('order-drawer');
    expect(drawer.textContent).toContain('Malika');
    fireEvent.change(screen.getByTestId('order-status'), {
      target: { value: "Qo'ng'iroq qilindi" },
    });
    fireEvent.change(screen.getByTestId('order-note'), { target: { value: "Ertaga o'lchov" } });
    fireEvent.click(screen.getByTestId('order-save'));
    await waitFor(() =>
      expect(screen.getByTestId('orders-row-DFN-251125-AAAA').textContent).toContain('Aziz'),
    );
    const post = api.calls.find((c) => c.url === '/api/orders' && c.method === 'POST')!;
    expect(post.body).toEqual({
      ref: 3,
      id: 'DFN-251125-AAAA',
      status: "Qo'ng'iroq qilindi",
      managerNote: "Ertaga o'lchov",
    });
  });

  it('tabs count by status; search and the source filter narrow the list', async () => {
    const api = fakeManagerApi();
    render(
      <ThemeProvider>
        <ManagerPage fetchImpl={api.impl} />
      </ThemeProvider>,
    );
    await login('aziz-pass-1');
    fireEvent.click(await screen.findByTestId('mgr-tab-orders'));
    await screen.findByTestId('orders-row-DFN-251101-BBBB');
    expect(screen.getByTestId('orders-tab-all').textContent).toBe('Hammasi2');
    expect(screen.getByTestId('orders-tab-2').textContent).toBe('Tasdiqlandi1');
    expect(screen.getByTestId('orders-sheet').getAttribute('href')).toBe(
      'https://docs.google.com/x',
    );
    fireEvent.click(screen.getByTestId('orders-tab-2'));
    expect(screen.queryByTestId('orders-row-DFN-251125-AAAA')).toBeNull();
    fireEvent.click(screen.getByTestId('orders-tab-all'));
    fireEvent.change(screen.getByTestId('orders-search'), { target: { value: 'malika' } });
    expect(screen.queryByTestId('orders-row-DFN-251101-BBBB')).toBeNull();
    expect(screen.getByTestId('orders-row-DFN-251125-AAAA')).toBeTruthy();
    fireEvent.change(screen.getByTestId('orders-search'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('orders-source'), { target: { value: 'kiosk' } });
    expect(screen.queryByTestId('orders-row-DFN-251125-AAAA')).toBeNull();
    expect(screen.getByTestId('orders-range').textContent).toContain('1–1 / 1');
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
      return new Response(
        JSON.stringify({ total: 2571000, currency: 'UZS', demo: false, priceListVersion: 'live' }),
      );
    }) as unknown as typeof fetch;
    return { seen, impl };
  };

  it('a customer sends the product and its params only, no secret (D-38: staff = a cookie)', async () => {
    const { seen, impl } = capture();
    const q = await fetchQuote(input(), undefined, impl);
    expect(q?.total).toBe(2571000);
    expect(Object.keys(seen[0]!.headers)).toEqual(['content-type']);
    expect(Object.keys(seen[0]!.body as object).sort()).toEqual([
      'params',
      'templateId',
      'templateVersion',
    ]);
  });

  it('the server unreachable -> no price (never a made-up one)', async () => {
    const down = (() =>
      Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    expect(await fetchQuote(input(), undefined, down)).toBeNull();
  });
});
