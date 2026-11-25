import { EMPTY_EXTENSION, priceListDemo } from '@dafna/engine';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ErpCatalogSection } from './ErpCatalogSection';
import { ErpContext, type ErpApi } from './erp';

afterEach(cleanup);

const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value });

/** D-50: the numbers next to the folders of "1C katalogi" (a fake 1C) */
describe('D-50 items per 1C folder', () => {
  it('each kind shows its items; a group the sum of its kinds; the tree does not wait', async () => {
    let answer: (v: Record<string, number>) => void = () => {};
    const api: ErpApi = {
      search: () => ok([]),
      prices: () => ok({}),
      pictures: () => ok({}),
      copyPicture: () => ok(''),
      kinds: (parent) =>
        ok(
          parent
            ? []
            : [
                { key: 'k1', name: 'ЛДСП', folder: true, group: 'material' as const },
                { key: 'k2', name: 'ЛМДФ', folder: false, group: 'material' as const },
                { key: 'k3', name: 'Петли', folder: false, group: 'hardware' as const },
              ],
        ),
      counts: () =>
        new Promise((resolve) => {
          answer = (v) => resolve({ ok: true, value: v });
        }),
      items: () => ok({ items: [], total: 0 }),
    };
    render(
      <ErpContext.Provider value={api}>
        <ErpCatalogSection list={priceListDemo} draft={EMPTY_EXTENSION} setDraft={() => {}} />
      </ErpContext.Provider>,
    );
    // the tree is there before the numbers
    await screen.findByTestId('erp-kind-ЛДСП');
    expect(screen.queryByTestId('erp-count-ЛДСП')).toBeNull();
    answer({ k1: 120, k2: 7, k3: 40 });
    await waitFor(() => expect(screen.getByTestId('erp-count-ЛДСП').textContent).toBe('120'));
    expect(screen.getByTestId('erp-count-ЛМДФ').textContent).toBe('7');
    // the open "Materiallar" group: its two kinds
    expect(screen.getByTestId('erp-count-Materiallar').textContent).toBe('127');
  });
});
