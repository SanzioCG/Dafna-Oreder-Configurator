import { defaultParams, generate, wardrobeTemplate as T, type Params } from '@dafna/engine';
import { describe, expect, it } from 'vitest';
import { DOOR_OPEN_DEG, DOOR_OPEN_SHARED_DEG, openAngles } from './doorSwing';

const angles = (over: Params) => [
  ...openAngles(generate(T, { ...defaultParams(T), ...over }).panels).values(),
];

describe('door swing angles', () => {
  it('default 1360 (2 doubles): the two leaves on the middle partition open to 85°', () => {
    expect(angles({})).toEqual([
      DOOR_OPEN_DEG,
      DOOR_OPEN_SHARED_DEG,
      DOOR_OPEN_SHARED_DEG,
      DOOR_OPEN_DEG,
    ]);
  });

  it('3 singles L,L,R: no partition is shared, all open to 100°', () => {
    expect(
      angles({
        width: 1600,
        sections: 3,
        doorSection1: 'single_left',
        doorSection2: 'single_left',
        doorSection3: 'single_right',
      }),
    ).toEqual([100, 100, 100]);
  });

  it('single right + single left share partition 1: both 85°', () => {
    expect(
      angles({
        width: 1206,
        sections: 2,
        doorSection1: 'single_right',
        doorSection2: 'single_left',
      }),
    ).toEqual([85, 85]);
  });
});
