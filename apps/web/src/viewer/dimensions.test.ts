import { defaultParams, generate, wardrobeTemplate as T } from '@dafna/engine';
import { describe, expect, it } from 'vitest';
import {
  buildDimensions,
  dimensionVisibility,
  formatLength,
  formatSize,
  labelSize,
  resolveLabelOverlaps,
  unitSystemFor,
  type LabelBox,
} from './dimensions';

describe('formatting', () => {
  it('V2: mm in both modes; cm formatter kept (decimal comma)', () => {
    expect(unitSystemFor()).toBe('mm');
    expect(formatLength(1360, 'cm', 'sm')).toBe('136 sm');
    expect(formatLength(656, 'cm', 'sm')).toBe('65,6 sm');
    expect(formatLength(645, 'cm', 'см')).toBe('64,5 см');
    expect(formatLength(1360, 'mm', 'mm')).toBe('1360 mm');
    expect(formatLength(337.5, 'mm', 'mm')).toBe('337,5 mm');
    expect(formatSize(1360, 1900, 600, 'cm', 'sm')).toBe('136 × 190 × 60 sm');
  });
});

describe('visibility per step', () => {
  const v = (step: string, doorsOpen: boolean, presentation = false, hasDoors = true) =>
    dimensionVisibility({ step, presentation, hasDoors, doorsOpen });
  it('primary always; secondary only on interior/doors with sections visible, never presenting', () => {
    expect(v('size', true)).toEqual({ primary: true, secondary: false });
    expect(v('color', true)).toEqual({ primary: true, secondary: false });
    expect(v('interior', true)).toEqual({ primary: true, secondary: true });
    expect(v('doors', true)).toEqual({ primary: true, secondary: true });
    expect(v('doors', false)).toEqual({ primary: true, secondary: false });
    expect(v('doors', false, false, false)).toEqual({ primary: true, secondary: true });
    expect(v('interior', true, true)).toEqual({ primary: true, secondary: false });
  });
});

describe('buildDimensions uses engine output', () => {
  const r = generate(T, defaultParams(T));
  const dims = r.dimensions;
  if (!dims) throw new Error('no dimensions');
  const fmt = (mm: number) => formatLength(mm, 'cm', 'sm');

  it('primary = engine width/height/depth; secondary = section inner widths', () => {
    const all = buildDimensions(dims, r.sections, fmt, { primary: true, secondary: true });
    expect(all.map((d) => [d.key, d.kind, d.label])).toEqual([
      ['section-0', 'secondary', fmt(r.sections[0]?.innerWidthMm ?? 0)],
      ['section-1', 'secondary', fmt(r.sections[1]?.innerWidthMm ?? 0)],
      ['width', 'primary', '136 sm'],
      ['height', 'primary', '190 sm'],
      ['depth', 'primary', '60 sm'],
    ]);
    const primaryOnly = buildDimensions(dims, r.sections, fmt, { primary: true, secondary: false });
    expect(primaryOnly.map((d) => d.key)).toEqual(['width', 'height', 'depth']);
  });
});

describe('label collision avoidance', () => {
  const box = (key: string, kind: 'primary' | 'secondary', x: number, y: number): LabelBox => ({
    key,
    kind,
    x,
    y,
    w: 80,
    h: 24,
    visible: true,
  });

  it('non-overlapping labels stay in place', () => {
    const p = resolveLabelOverlaps([
      box('width', 'primary', 100, 50),
      box('s0', 'secondary', 300, 50),
    ]);
    expect(p.get('s0')).toEqual({ dx: 0, dy: 0, visible: true });
  });

  it('a secondary overlapping a primary is offset (up first); primary never moves', () => {
    const p = resolveLabelOverlaps([
      box('width', 'primary', 100, 50),
      box('s0', 'secondary', 120, 50),
    ]);
    expect(p.get('width')).toEqual({ dx: 0, dy: 0, visible: true });
    expect(p.get('s0')).toEqual({ dx: 0, dy: -28, visible: true });
  });

  it('a secondary with no free slot is hidden', () => {
    const p = resolveLabelOverlaps([
      box('width', 'primary', 100, 50),
      box('a', 'primary', 100, 22),
      box('b', 'primary', 100, 78),
      box('s0', 'secondary', 100, 50),
    ]);
    expect(p.get('s0')?.visible).toBe(false);
  });

  it('two overlapping secondaries: the second one moves', () => {
    const p = resolveLabelOverlaps([
      box('s0', 'secondary', 100, 50),
      box('s1', 'secondary', 150, 50),
    ]);
    expect(p.get('s0')?.dy).toBe(0);
    expect(p.get('s1')?.dy).toBe(-28);
  });

  it('label size grows with the font', () => {
    expect(labelSize('136 sm', 32).w).toBeGreaterThan(1.9 * labelSize('136 sm', 16).w);
  });
});
