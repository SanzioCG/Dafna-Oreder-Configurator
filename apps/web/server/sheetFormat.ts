import { COLUMNS, STATUS_COLUMN_INDEX, TELEGRAM_COLUMN_INDEX, columnLetter } from './columns';
import type { LeadRecord } from './types';

/**
 * D-11b: how the "Arizalar" sheet looks and what the manager edits. Pure: builds Sheets API
 * batchUpdate requests. Bump SHEET_FORMAT_VERSION when the look changes: every sheet whose
 * stored version (developer metadata) differs is re-formatted once by the API, so the
 * production sheet updates itself without anyone running the setup script.
 *
 * - dark header row (frozen with the ID column), filter buttons for sorting / filtering;
 * - widths per column, long texts wrapped, technical columns hidden;
 * - "Holat" as coloured chips (one colour per status), a cancelled application greyed out;
 * - "Telegram holati": failed red, pending amber, sent green;
 * - the two columns the manager edits ("Holat", "Menejer izohi") are tinted and noted; every
 *   other cell warns before an accidental edit (warning only, nobody is locked out).
 */
export const SHEET_FORMAT_VERSION = '6';
/** D-46: the header colour (Figma "Google Sheet": Dafna ink #191D24) */
export const HEADER_BG = '#191d24';
export const FORMAT_METADATA_KEY = 'dafna.sheetFormat';
export const PROTECTION_DESCRIPTION = 'dafna: avtomatik ustunlar';

interface Color {
  red: number;
  green: number;
  blue: number;
}

export function hex(h: string): Color {
  const n = parseInt(h.replace('#', ''), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

/** Status -> chip colours (background, text). */
export const STATUS_COLORS: Record<string, [string, string]> = {
  Yangi: ['#dcebff', '#0b4fa8'],
  "Qo'ng'iroq qilindi": ['#fff1c2', '#8a5a00'],
  Tasdiqlandi: ['#d9f5e3', '#12703a'],
  'Ishlab chiqarishga berildi': ['#eadfff', '#5b2db0'],
  'Bekor qilindi': ['#ecedef', '#6b7078'],
};

const TELEGRAM_COLORS: Record<string, [string, string]> = {
  failed: ['#ffe0e0', '#b42318'],
  pending: ['#fff1c2', '#8a5a00'],
  sent: ['#ffffff', '#12703a'],
};

/** Column widths in pixels; columns not listed keep the default. */
export const COLUMN_WIDTHS: Partial<Record<keyof LeadRecord, number>> = {
  id: 150,
  createdAt: 140,
  status: 190,
  firstName: 120,
  lastName: 130,
  phone: 130,
  sizeMm: 140,
  corpus: 210,
  door: 210,
  sections: 330,
  doors: 240,
  kiosk: 110,
  lang: 50,
  telegram: 120,
  managerNote: 300,
  product: 120,
  orderId: 130,
  orderItem: 90,
  quantity: 60,
  manager: 130,
  assignee: 120,
};

/** Columns the manager never needs: hidden (still there for the API and regeneration). */
export const HIDDEN_KEYS: (keyof LeadRecord)[] = [
  'paramsJson',
  'schemaVersion',
  'templateVersion',
  'engineVersion',
  'idempotencyKey',
  'telegramAttempts',
  'templateId',
];

/** Long texts wrap instead of spilling into the next cells. */
const WRAPPED_KEYS: (keyof LeadRecord)[] = ['corpus', 'door', 'sections', 'doors', 'managerNote'];

/** What the manager edits by hand. */
export const EDITABLE_KEYS: (keyof LeadRecord)[] = ['status', 'managerNote'];

const col = (key: keyof LeadRecord) => COLUMNS.findIndex((c) => c.key === key);

/** The sheet's current formatting objects, removed before the new format is applied. */
export interface ExistingFormat {
  bandedRangeIds: number[];
  protectedRangeIds: number[];
  conditionalFormatCount: number;
  metadataIds: number[];
}

export function formatRequests(sheetId: number, existing: ExistingFormat): object[] {
  const n = COLUMNS.length;
  const all = { sheetId, startColumnIndex: 0, endColumnIndex: n };
  const header = { ...all, startRowIndex: 0, endRowIndex: 1 };
  const data = { ...all, startRowIndex: 1 };
  const column = (i: number, startRowIndex = 1) => ({
    sheetId,
    startRowIndex,
    startColumnIndex: i,
    endColumnIndex: i + 1,
  });
  const statusLetter = columnLetter(STATUS_COLUMN_INDEX);

  const cleanup = [
    ...existing.bandedRangeIds.map((bandedRangeId) => ({ deleteBanding: { bandedRangeId } })),
    ...existing.protectedRangeIds.map((protectedRangeId) => ({
      deleteProtectedRange: { protectedRangeId },
    })),
    ...Array.from({ length: existing.conditionalFormatCount }, () => ({
      deleteConditionalFormatRule: { sheetId, index: 0 },
    })),
    ...existing.metadataIds.map((metadataId) => ({
      deleteDeveloperMetadata: { dataFilter: { developerMetadataLookup: { metadataId } } },
    })),
  ];

  const chip = (range: object, formula: string, [bg, fg]: [string, string], bold = true) => ({
    addConditionalFormatRule: {
      rule: {
        ranges: [range],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] },
          format: {
            backgroundColor: hex(bg),
            textFormat: { foregroundColor: hex(fg), bold },
          },
        },
      },
      index: 0,
    },
  });

  return [
    ...cleanup,
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } },
        fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
      },
    },
    // header: dark, white bold text, centred vertically, taller
    {
      repeatCell: {
        range: header,
        cell: {
          userEnteredFormat: {
            backgroundColor: hex(HEADER_BG),
            textFormat: { foregroundColor: hex('#ffffff'), bold: true, fontSize: 10 },
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP',
            padding: { top: 6, bottom: 6, left: 6, right: 6 },
          },
        },
        fields:
          'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy,padding)',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 42 },
        fields: 'pixelSize',
      },
    },
    // data: middle-aligned, clipped by default; long texts wrap; D-46: plain 10 pt text (a
    // bold set by hand is reset - only the ID stays bold, Figma "Google Sheet")
    {
      repeatCell: {
        range: data,
        cell: {
          userEnteredFormat: {
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'CLIP',
            textFormat: { bold: false, fontSize: 10 },
          },
        },
        fields:
          'userEnteredFormat(verticalAlignment,wrapStrategy,textFormat.bold,textFormat.fontSize)',
      },
    },
    ...WRAPPED_KEYS.map((k) => ({
      repeatCell: {
        range: column(col(k)),
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
        fields: 'userEnteredFormat.wrapStrategy',
      },
    })),
    // the ID stands out
    {
      repeatCell: {
        range: column(col('id')),
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: 'userEnteredFormat.textFormat.bold',
      },
    },
    // editable columns: the status on the left (Figma), tinted note column
    {
      repeatCell: {
        range: column(STATUS_COLUMN_INDEX),
        cell: { userEnteredFormat: { horizontalAlignment: 'LEFT' } },
        fields: 'userEnteredFormat.horizontalAlignment',
      },
    },
    {
      repeatCell: {
        range: column(col('managerNote')),
        cell: { userEnteredFormat: { backgroundColor: hex('#fffbea') } },
        fields: 'userEnteredFormat.backgroundColor',
      },
    },
    // header cells of the editable columns: amber, with a note
    ...EDITABLE_KEYS.map((k) => ({
      repeatCell: {
        range: { ...column(col(k), 0), endRowIndex: 1 },
        cell: {
          note: "Shu ustunni menejer to'ldiradi / o'zgartiradi.",
          userEnteredFormat: {
            backgroundColor: hex('#ffad1f'),
            textFormat: { foregroundColor: hex(HEADER_BG), bold: true },
          },
        },
        fields: 'note,userEnteredFormat(backgroundColor,textFormat)',
      },
    })),
    // widths, hidden technical columns
    ...COLUMNS.map((c, i) => {
      const width = COLUMN_WIDTHS[c.key];
      const hidden = HIDDEN_KEYS.includes(c.key);
      return {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
          properties: { hiddenByUser: hidden, ...(width ? { pixelSize: width } : {}) },
          fields: width ? 'hiddenByUser,pixelSize' : 'hiddenByUser',
        },
      };
    }),
    // light zebra rows (the conditional colours below win over it)
    {
      addBanding: {
        bandedRange: {
          range: data,
          rowProperties: {
            firstBandColor: hex('#ffffff'),
            secondBandColor: hex('#f6f7f9'),
          },
        },
      },
    },
    // conditional colours, added at index 0: the last added is evaluated first
    chip(data, `=$${statusLetter}2="Bekor qilindi"`, ['#fafafa', '#9aa0a6'], false),
    ...Object.entries(TELEGRAM_COLORS).map(([state, colors]) =>
      chip(
        column(TELEGRAM_COLUMN_INDEX),
        `=$${columnLetter(TELEGRAM_COLUMN_INDEX)}2="${state}"`,
        colors,
      ),
    ),
    ...Object.entries(STATUS_COLORS).map(([status, colors]) =>
      chip(
        column(STATUS_COLUMN_INDEX),
        `=$${statusLetter}2="${status.replace(/"/g, '""')}"`,
        colors,
      ),
    ),
    // filter buttons on the header
    { setBasicFilter: { filter: { range: { ...all, startRowIndex: 0 } } } },
    // every column except the editable ones warns before an edit
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId },
          description: PROTECTION_DESCRIPTION,
          warningOnly: true,
          unprotectedRanges: EDITABLE_KEYS.map((k) => column(col(k))),
        },
      },
    },
    {
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: FORMAT_METADATA_KEY,
          metadataValue: SHEET_FORMAT_VERSION,
          location: { sheetId },
          visibility: 'DOCUMENT',
        },
      },
    },
  ];
}

/* ---------- D-46: the program's other tabs (Narxlar, Katalog, Xodimlar) ---------- */

/**
 * The same look as "Arizalar" (Figma "Google Sheet / Ko'rinish qoidalari"): dark frozen header,
 * zebra rows, widths, hidden columns; and a warning before a hand edit (these tabs are written by
 * the manager page - a hand edit is overwritten by the next "Saqlash"). Applied once per tab
 * (developer metadata TAB_FORMAT_KEY = TAB_FORMAT_VERSION); bump the version to re-format.
 */
export const TAB_FORMAT_VERSION = '1';
export const TAB_FORMAT_KEY = 'dafna.tabFormat';
export const TAB_PROTECTION = "dafna: dastur yozadi (o'zgartirish /manager sahifasida)";

export interface TabLook {
  /** column widths in pixels, from column A */
  widths?: number[];
  /** columns hidden from people (e.g. the password hashes) */
  hidden?: number[];
}

export function tabFormatRequests(
  sheetId: number,
  columnCount: number,
  existing: Pick<ExistingFormat, 'bandedRangeIds' | 'protectedRangeIds' | 'metadataIds'>,
  look: TabLook = {},
): object[] {
  const all = { sheetId, startColumnIndex: 0, endColumnIndex: columnCount };
  return [
    ...existing.bandedRangeIds.map((bandedRangeId) => ({ deleteBanding: { bandedRangeId } })),
    ...existing.protectedRangeIds.map((protectedRangeId) => ({
      deleteProtectedRange: { protectedRangeId },
    })),
    ...existing.metadataIds.map((metadataId) => ({
      deleteDeveloperMetadata: { dataFilter: { developerMetadataLookup: { metadataId } } },
    })),
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    {
      repeatCell: {
        range: { ...all, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: hex(HEADER_BG),
            textFormat: { foregroundColor: hex('#ffffff'), bold: true, fontSize: 10 },
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP',
            padding: { top: 6, bottom: 6, left: 6, right: 6 },
          },
        },
        fields:
          'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy,padding)',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 36 },
        fields: 'pixelSize',
      },
    },
    {
      repeatCell: {
        range: { ...all, startRowIndex: 1 },
        cell: { userEnteredFormat: { verticalAlignment: 'MIDDLE', wrapStrategy: 'CLIP' } },
        fields: 'userEnteredFormat(verticalAlignment,wrapStrategy)',
      },
    },
    ...(look.widths ?? []).map((pixelSize, i) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize },
        fields: 'pixelSize',
      },
    })),
    ...(look.hidden ?? []).map((i) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { hiddenByUser: true },
        fields: 'hiddenByUser',
      },
    })),
    {
      addBanding: {
        bandedRange: {
          range: { ...all, startRowIndex: 1 },
          rowProperties: { firstBandColor: hex('#ffffff'), secondBandColor: hex('#f6f7f9') },
        },
      },
    },
    {
      addProtectedRange: {
        protectedRange: { range: { sheetId }, description: TAB_PROTECTION, warningOnly: true },
      },
    },
    {
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: TAB_FORMAT_KEY,
          metadataValue: TAB_FORMAT_VERSION,
          location: { sheetId },
          visibility: 'DOCUMENT',
        },
      },
    },
  ];
}
