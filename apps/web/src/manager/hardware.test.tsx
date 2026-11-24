import { cleanup, render, screen, within } from '@testing-library/react';
import { priceListDemo } from '@dafna/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { HardwareSection } from './HardwareSection';

afterEach(cleanup);

/** D-28: Dafna's stock report (Furniture.docx) on the manager page, sorted by brand */
describe('D-28 manager hardware list', () => {
  it('groups the items by brand (A-Z, no brand last) with the 1C name, cost and use', () => {
    render(
      <HardwareSection
        list={priceListDemo}
        edit={() => {}}
        draft={{ materials: [], hardware: [] }}
        setDraft={() => {}}
      />,
    );
    const groups = [...document.querySelectorAll('[data-testid^="mgr-hw-brand-"]')].map((g) =>
      g.getAttribute('data-testid')!.replace('mgr-hw-brand-', ''),
    );
    expect(groups.indexOf('Mesan')).toBeLessThan(groups.indexOf('Samet'));
    // D-29: the slides are Camet
    expect(groups.indexOf('Camet')).toBeLessThan(groups.indexOf('Mesan'));
    expect(
      screen
        .getByTestId('mgr-hw-brand-Camet')
        .querySelector('[data-testid="mgr-hw-row-slide_samet_smart"]'),
    ).toBeTruthy();
    expect(groups.at(-1)).toBe('Brendsiz');
    const samet = screen.getByTestId('mgr-hw-brand-Samet');
    const hinge = within(samet).getByTestId('mgr-hw-row-hinge_samet_master_18');
    expect(hinge.textContent).toContain('Samet Master 18 mm');
    expect(hinge.textContent).toContain('MASTER SOFT CLOSE HINGE 18MM');
    expect(hinge.textContent).toContain('$0.943');
    expect(hinge.textContent).toContain('Sotuvda');
    expect(within(samet).getByTestId('mgr-hw-row-conn_samet_samfix_cam').textContent).toContain(
      'Ishlab chiqarish uchun',
    );
    expect(screen.getByTestId('mgr-hw-row-hinge_strax').textContent).toContain('Eski');
  });
});
