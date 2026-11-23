import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { priceListDemo, wardrobeTemplate, defaultParams, generate } from '@dafna/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { fetchQuote } from '../state/priceSource';
import { forgetStaffPin, verifyStaffPin } from '../state/staffAccess';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ManagerPage } from './ManagerPage';

afterEach(() => {
  cleanup();
  forgetStaffPin();
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
  const impl = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    const body = init.body ? (JSON.parse(String(init.body)) as { list: unknown }) : undefined;
    calls.push({ url, method: String(init.method), headers, body });
    if (headers['x-manager-pin'] !== '9137')
      return new Response(JSON.stringify({ error: { code: 'wrong_pin' } }), { status: 401 });
    if (init.method === 'PUT') {
      saved = { list: { ...(body!.list as object), demo: false }, updatedAt: '2026-11-23 14:05' };
      return new Response(JSON.stringify({ ok: true, ...saved }));
    }
    return new Response(JSON.stringify(saved ?? { list: priceListDemo, updatedAt: null }));
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

  it('profit %, assembly and a sheet price change the sample price; Saqlash sends them', async () => {
    const api = fakeManagerApi();
    render(
      <ThemeProvider>
        <ManagerPage fetchImpl={api.impl} />
      </ThemeProvider>,
    );
    await login('9137');
    await screen.findByTestId('mgr-save');
    // the ERP is not connected yet: said plainly, sheet prices are typed here
    expect(screen.getByTestId('mgr-erp-note').textContent).toContain('ERP hali ulanmagan');
    expect(screen.getByTestId('mgr-updated').textContent).toContain('Hali saqlanmagan');
    const total = () =>
      Number(screen.getByTestId('mgr-total-wardrobe').textContent?.replace(/\s/g, ''));
    const t0 = total();
    fireEvent.change(screen.getByTestId('mgr-markup'), { target: { value: '40' } });
    const t1 = total();
    expect(t1).toBeGreaterThan(t0);
    fireEvent.change(screen.getByTestId('mgr-assembly-wardrobe'), { target: { value: '300000' } });
    expect(total()).toBeGreaterThan(t1);
    fireEvent.change(screen.getByTestId('mgr-sheet-ldsp_white_16'), {
      target: { value: '579600' },
    });
    fireEvent.click(screen.getByTestId('mgr-save'));
    await waitFor(() =>
      expect(screen.getByTestId('mgr-updated').textContent).toContain('2026-11-23 14:05'),
    );
    const put = api.calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe('/api/manager');
    expect(put.headers['x-manager-pin']).toBe('9137'); // a header, never the URL
    const list = (put.body as { list: Record<string, unknown> }).list as {
      markupPct: number;
      assembly: Record<string, number>;
      boardSheets: Record<string, { price: number; lengthMm: number; widthMm: number }>;
    };
    expect(list.markupPct).toBe(40);
    expect(list.assembly.wardrobe).toBe(300000);
    expect(list.boardSheets.ldsp_white_16).toEqual({
      price: 579600,
      lengthMm: 2750, // Dafna chipboard (no EGGER code): the GibLab sheet size
      widthMm: 1830,
    });
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
