import { EMPTY_EXTENSION, priceListDemo } from '@dafna/engine';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MaterialsSection } from './MaterialsSection';
import { ErpContext, pictureWarning, type ErpApi } from './erp';

afterEach(cleanup);

const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value });
const api = (copy: ErpApi['copyPicture']): ErpApi => ({
  search: () => ok([]),
  prices: () => ok({}),
  pictures: () => ok({}),
  copyPicture: copy,
  kinds: () => ok([]),
  counts: () => ok({}),
  items: () => ok({ items: [], total: 0 }),
});

/** D-53: a picture that could not be saved is said, and can be taken again from the card */
describe('D-53 eman.uz pictures', () => {
  it('no photo store: the reason, and where to connect it', () => {
    expect(pictureWarning('storage_not_configured')).toContain('Storage → Blob');
    expect(pictureWarning('no_picture')).toContain('topilmadi');
  });

  it('the material card takes its eman.uz picture by its 1C code; a failure is shown', async () => {
    const calls: string[] = [];
    let fail = true;
    const textures: unknown[] = [];
    const list = { ...priceListDemo, erpCodes: { hdf_white_3: 'H-0001' } };
    render(
      <ErpContext.Provider
        value={api((article) => {
          calls.push(article);
          return Promise.resolve(
            fail
              ? { ok: false as const, code: 'storage_not_configured' }
              : { ok: true as const, value: 'https://blob.example/hdf.jpg' },
          );
        })}
      >
        <MaterialsSection
          list={list}
          edit={() => {}}
          draft={EMPTY_EXTENSION}
          setDraft={(d) => textures.push(d.textures?.hdf_white_3)}
          uploadTexture={() => Promise.resolve({ ok: false as const, code: 'network' })}
          onFromErp={() => {}}
        />
      </ErpContext.Provider>,
    );
    fireEvent.click(screen.getByTestId('mgr-material-row-hdf_white_3'));
    fireEvent.click(screen.getByTestId('mgr-texture-eman'));
    await waitFor(() =>
      expect(screen.getByTestId('mgr-texture').textContent).toContain('rasm ombori ulanmagan'),
    );
    expect(calls).toEqual(['H-0001']);
    fail = false;
    fireEvent.click(screen.getByTestId('mgr-texture-eman'));
    await waitFor(() =>
      expect(textures.at(-1)).toEqual({
        url: 'https://blob.example/hdf.jpg',
        widthMm: 1000,
        heightMm: 1000,
      }),
    );
  });
});
