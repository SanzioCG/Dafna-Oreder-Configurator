import { afterEach, describe, expect, it } from 'vitest';
import {
  EMPTY_EXTENSION,
  applyCatalogExtension,
  defaultParams,
  generate,
  getParamDef,
  kioskOptions,
  kioskParams,
  deskTemplate,
  regenerateApplication,
  wardrobeTemplate as T,
  type CatalogExtension,
} from '../src/index.js';

/** D-35: the kiosk offers what the manager took from 1C; the demo items stay for old orders */
const board = {
  id: 'x_m1',
  kind: 'ldsp' as const,
  name: 'Эггер Акапулько 16мм ST10',
  thicknessMm: 16,
  colorHex: '#c8a070',
  group: 'wood' as const,
  usage: ['corpus' as const, 'door' as const],
  visible: true,
};
const hinge = {
  id: 'x_h1',
  kind: 'hinge' as const,
  brandKey: 'x_hettich_sensys',
  brand: 'Hettich',
  model: 'Sensys 8645i',
  softClose: true,
  visible: true,
};

afterEach(() => applyCatalogExtension(EMPTY_EXTENSION));

describe('D-35 kiosk options', () => {
  it('D-37 nothing added: no board is offered (no demo decors); brands keep the built-ins', () => {
    applyCatalogExtension(EMPTY_EXTENSION);
    expect(kioskOptions(getParamDef(T, 'corpusMaterial')!)).toEqual([]);
    expect(kioskOptions(getParamDef(T, 'doorMaterial')!)).toEqual(['same_as_corpus']);
    const hinge = getParamDef(T, 'hingeBrand')!;
    expect(kioskOptions(hinge)).toEqual(hinge.options);
    expect(kioskParams(T, defaultParams(T))).toEqual(defaultParams(T));
  });

  it('once boards / hinges are added only they are offered, and the params move to them', () => {
    const ext: CatalogExtension = { materials: [board], hardware: [hinge], textures: {} };
    applyCatalogExtension(ext);
    expect(kioskOptions(getParamDef(T, 'corpusMaterial')!)).toEqual(['x_m1']);
    expect(kioskOptions(getParamDef(T, 'doorMaterial')!)).toEqual(['same_as_corpus', 'x_m1']);
    expect(kioskOptions(getParamDef(T, 'hingeBrand')!)).toEqual(['x_hettich_sensys']);
    const p = kioskParams(T, defaultParams(T));
    expect([p.corpusMaterial, p.hingeBrand]).toEqual(['x_m1', 'x_hettich_sensys']);
    expect(generate(T, p).issues.filter((i) => i.severity === 'error')).toEqual([]);
    // a hidden added entry does not count
    applyCatalogExtension({ ...ext, materials: [{ ...board, visible: false }] });
    expect(kioskOptions(getParamDef(T, 'corpusMaterial')!)).toEqual([]);
  });

  it('D-36: a carcass board also fits the desk top - the desk shows no demo decors', () => {
    applyCatalogExtension({ materials: [board], hardware: [], textures: {} });
    expect(kioskOptions(getParamDef(deskTemplate, 'topMaterial')!)).toEqual(['x_m1']);
    expect(kioskOptions(getParamDef(deskTemplate, 'corpusMaterial')!)).toEqual(['x_m1']);
    const p = kioskParams(deskTemplate, defaultParams(deskTemplate));
    expect([p.topMaterial, p.corpusMaterial]).toEqual(['x_m1', 'x_m1']);
    expect(generate(deskTemplate, p).issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('a stored order with a built-in decor still regenerates', () => {
    applyCatalogExtension({ materials: [board], hardware: [hinge], textures: {} });
    const r = regenerateApplication(defaultParams(T), T.templateVersion);
    expect(r.ok).toBe(true);
  });
});
