import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SheetTab } from './priceSheet';
import {
  HEADER_BG,
  TAB_FORMAT_KEY,
  TAB_FORMAT_VERSION,
  TAB_PROTECTION,
  hex,
  tabFormatRequests,
} from './sheetFormat';

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** D-46: Narxlar, Katalog, Xodimlar look like "Arizalar" (Figma "Google Sheet") */
describe('D-46 the look of the program-written tabs', () => {
  it('dark frozen header (Dafna ink), zebra rows, widths, hidden columns, a hand-edit warning', () => {
    expect(HEADER_BG).toBe('#191d24');
    const reqs = tabFormatRequests(
      5,
      8,
      { bandedRangeIds: [11], protectedRangeIds: [12], metadataIds: [13] },
      { widths: [120, 180], hidden: [3] },
    ) as R[];
    // the old look is removed first
    expect(reqs.slice(0, 3).map((r) => Object.keys(r)[0])).toEqual([
      'deleteBanding',
      'deleteProtectedRange',
      'deleteDeveloperMetadata',
    ]);
    expect(reqs.find((r) => r.updateSheetProperties)?.updateSheetProperties.properties).toEqual({
      sheetId: 5,
      gridProperties: { frozenRowCount: 1 },
    });
    const header = reqs.find((r) => r.repeatCell?.range.endRowIndex === 1)!.repeatCell;
    expect(header.cell.userEnteredFormat.backgroundColor).toEqual(hex('#191d24'));
    expect(header.cell.userEnteredFormat.textFormat).toEqual({
      foregroundColor: hex('#ffffff'),
      bold: true,
      fontSize: 10,
    });
    const dims = reqs.filter((r) => r.updateDimensionProperties?.range.dimension === 'COLUMNS');
    expect(dims.map((r) => r.updateDimensionProperties.properties)).toEqual([
      { pixelSize: 120 },
      { pixelSize: 180 },
      { hiddenByUser: true },
    ]);
    expect(reqs.find((r) => r.addBanding)?.addBanding.bandedRange.rowProperties).toEqual({
      firstBandColor: hex('#ffffff'),
      secondBandColor: hex('#f6f7f9'),
    });
    expect(reqs.find((r) => r.addProtectedRange)?.addProtectedRange.protectedRange).toEqual({
      range: { sheetId: 5 },
      description: TAB_PROTECTION,
      warningOnly: true,
    });
    expect(reqs.at(-1)?.createDeveloperMetadata.developerMetadata).toMatchObject({
      metadataKey: TAB_FORMAT_KEY,
      metadataValue: TAB_FORMAT_VERSION,
    });
  });

  it('a tab is formatted once after its first save; a broken format never fails the save', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const account = {
      client_email: 'x@test.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    };
    let formatted = false;
    let failFormat = false;
    const batches: R[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
      if (url.startsWith('https://oauth2')) return json({ access_token: 'AT', expires_in: 3600 });
      if (url.includes('?fields=sheets'))
        return json({
          sheets: [
            {
              properties: { sheetId: 9, title: 'Xodimlar' },
              developerMetadata: formatted
                ? [
                    {
                      metadataId: 1,
                      metadataKey: TAB_FORMAT_KEY,
                      metadataValue: TAB_FORMAT_VERSION,
                    },
                  ]
                : [],
            },
          ],
        });
      if (url.includes(':batchUpdate')) {
        const body = JSON.parse(String(init?.body)) as R;
        if (body.requests.some((r: R) => r.addSheet)) return json({ replies: [] });
        if (failFormat) return json({ error: 'x' }, 500);
        batches.push(body);
        formatted = true;
        return json({});
      }
      return json({});
    }) as typeof fetch;

    const broken = new SheetTab({ sheetId: 'S', account, fetch: impl }, 'Xodimlar', {
      hidden: [3],
    });
    failFormat = true;
    await expect(broken.write([['login', 'ism']])).resolves.toBeUndefined();

    failFormat = false;
    const tab = new SheetTab({ sheetId: 'S', account, fetch: impl }, 'Xodimlar', { hidden: [3] });
    await tab.write([['login', 'ism']]);
    await tab.write([['login', 'ism']]);
    expect(batches).toHaveLength(1);
    // a new instance sees the mark and leaves the sheet alone
    await new SheetTab({ sheetId: 'S', account, fetch: impl }, 'Xodimlar', {}).write([['a']]);
    expect(batches).toHaveLength(1);
  });
});
