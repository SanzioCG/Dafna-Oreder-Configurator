import { cleanup, render, screen } from '@testing-library/react';
import { priceListDemo } from '@dafna/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { HardwareSection } from './HardwareSection';

afterEach(cleanup);

/** D-35: the hardware list holds what the manager took from 1C and the automatic parts */
describe('D-35 manager hardware list', () => {
  it('no demo brands or stock-report items; the parts products add by themselves stay', () => {
    render(
      <HardwareSection
        list={priceListDemo}
        edit={() => {}}
        draft={{ materials: [], hardware: [] }}
        setDraft={() => {}}
      />,
    );
    for (const id of [
      'hinge_strax',
      'hinge_hettich_sensys',
      'hinge_samet_master_18',
      'slide_samet_smart',
      'conn_samet_samfix_cam',
    ])
      expect(screen.queryByTestId(`mgr-hw-row-${id}`)).toBeNull();
    for (const id of ['castor_standard', 'lift_frame_2leg', 'rail_oval_25', 'rail_holder'])
      expect(screen.getByTestId(`mgr-hw-row-${id}`)).toBeTruthy();
  });
});
