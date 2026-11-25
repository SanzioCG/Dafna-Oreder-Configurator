import {
  EMPTY_EXTENSION,
  PRODUCT_TEMPLATES,
  applyCatalogExtension,
  priceListDemo,
  type CatalogExtension,
} from '@dafna/engine';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProfitSection, customerParams, offeredBoards } from './ProfitSection';

afterEach(() => {
  cleanup();
  applyCatalogExtension(EMPTY_EXTENSION);
});

const board = (id: string, kind: 'ldsp' | 'mdf', name: string) => ({
  id,
  kind,
  name,
  thicknessMm: 16,
  colorHex: '#8a8a88',
  group: 'plain' as const,
  usage: ['corpus' as const, 'door' as const],
  visible: true,
});
const catalog: CatalogExtension = {
  materials: [
    board('x_m1', 'mdf', 'Ультрадекор Железный камень 16мм'),
    board('x_m2', 'ldsp', 'Эггер Кашемир 16мм'),
  ],
  hardware: [],
  textures: {},
};

/** D-52: the LESTER comparison prices the boards customers really get */
describe('D-52 the comparison board', () => {
  it('the manager boards from 1C, never a demo decor; a chosen one where the product takes it', () => {
    applyCatalogExtension(catalog);
    expect(offeredBoards().sort()).toEqual(['x_m1', 'x_m2']);
    const desk = PRODUCT_TEMPLATES.desk!;
    const wardrobe = PRODUCT_TEMPLATES.wardrobe!;
    // the kiosk default: a manager board, not ldsp_white_16
    expect(customerParams(wardrobe, {}, '').corpusMaterial).not.toBe('ldsp_white_16');
    // MDF on the wardrobe; the desk takes LDSP only, so it keeps its own
    expect(customerParams(wardrobe, {}, 'x_m1').corpusMaterial).toBe('x_m1');
    expect(customerParams(desk, {}, 'x_m1').topMaterial).toBe('x_m2');
    expect(customerParams(desk, {}, 'x_m2').topMaterial).toBe('x_m2');
  });

  it('the table shows the board of each row and warns about a board without its own price', () => {
    applyCatalogExtension(catalog);
    const list = {
      ...priceListDemo,
      boardSheets: { x_m2: { price: 640_000, lengthMm: 2800, widthMm: 2070 } },
    };
    render(<ProfitSection list={list} edit={() => {}} />);
    fireEvent.change(screen.getByTestId('mgr-lester-board'), { target: { value: 'x_m1' } });
    const ofis = screen.getByTestId('mgr-lester-board-ofis').textContent!;
    expect(ofis).toContain('Железный камень');
    // the thickness once: the 1C name already says "16мм"
    expect(ofis).not.toContain('16мм 16');
    expect(ofis).toContain('narxi kiritilmagan');
    const stol = screen.getByTestId('mgr-lester-board-stol').textContent!;
    expect(stol).toContain('Кашемир');
    expect(stol).toContain('mos emas');
    expect(stol).not.toContain('narxi kiritilmagan');
  });
});
