import { describe, expect, it } from 'vitest';
import { COLUMNS, STATUS_COLUMN_INDEX } from './columns';
import {
  HIDDEN_KEYS,
  PROTECTION_DESCRIPTION,
  SHEET_FORMAT_VERSION,
  STATUS_COLORS,
  formatRequests,
} from './sheetFormat';
import { LEAD_STATUSES } from './types';

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const none = {
  bandedRangeIds: [],
  protectedRangeIds: [],
  conditionalFormatCount: 0,
  metadataIds: [],
};

describe('D-11b sheet look', () => {
  it('every status has its own chip colour', () => {
    expect(Object.keys(STATUS_COLORS).sort()).toEqual([...LEAD_STATUSES].sort());
    const reqs = formatRequests(7, none) as R[];
    const rules = reqs.filter((r) => r.addConditionalFormatRule);
    for (const s of LEAD_STATUSES) {
      const escaped = s.replace(/"/g, '""');
      expect(
        rules.some((r) =>
          r.addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue.includes(
            `"${escaped}"`,
          ),
        ),
      ).toBe(true);
    }
  });

  it('technical columns hidden, the manager columns stay editable without a warning', () => {
    const reqs = formatRequests(7, none) as R[];
    const dims = reqs.filter((r) => r.updateDimensionProperties?.range.dimension === 'COLUMNS');
    expect(dims).toHaveLength(COLUMNS.length);
    const hidden = dims
      .filter((r) => r.updateDimensionProperties.properties.hiddenByUser)
      .map((r) => COLUMNS[r.updateDimensionProperties.range.startIndex]!.key);
    expect(hidden.sort()).toEqual([...HIDDEN_KEYS].sort());
    const prot = reqs.find((r) => r.addProtectedRange)!.addProtectedRange.protectedRange;
    expect(prot.warningOnly).toBe(true);
    expect(prot.description).toBe(PROTECTION_DESCRIPTION);
    expect(prot.unprotectedRanges.map((u: R) => u.startColumnIndex)).toContain(STATUS_COLUMN_INDEX);
    const meta = reqs.find((r) => r.createDeveloperMetadata)!.createDeveloperMetadata;
    expect(meta.developerMetadata.metadataValue).toBe(SHEET_FORMAT_VERSION);
  });

  it('re-formatting removes the previous banding, protection, rules and version first', () => {
    const reqs = formatRequests(7, {
      bandedRangeIds: [11],
      protectedRangeIds: [22],
      conditionalFormatCount: 3,
      metadataIds: [33],
    }) as R[];
    expect(reqs[0]).toEqual({ deleteBanding: { bandedRangeId: 11 } });
    expect(reqs[1]).toEqual({ deleteProtectedRange: { protectedRangeId: 22 } });
    expect(reqs.filter((r) => r.deleteConditionalFormatRule)).toHaveLength(3);
    expect(reqs.some((r) => r.deleteDeveloperMetadata)).toBe(true);
    // all deletions come before anything is added
    const firstAdd = reqs.findIndex((r) => !Object.keys(r)[0]!.startsWith('delete'));
    expect(reqs.slice(firstAdd).some((r) => Object.keys(r)[0]!.startsWith('delete'))).toBe(false);
  });
});
