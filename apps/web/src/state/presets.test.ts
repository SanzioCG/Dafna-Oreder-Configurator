import { generate } from '@dafna/engine';
import { describe, expect, it } from 'vitest';
import { PRESETS_UNCONFIRMED, READY_MODELS, modelParams } from './presets';
import { TEMPLATE, isCustomerBlocking } from './useConfigurator';

describe('ready-made models (start screen)', () => {
  it('four models: 100 / 150 / 200 / 240 sm, marked unconfirmed', () => {
    expect(READY_MODELS.map((m) => [m.id, modelParams(m).width])).toEqual([
      ['compact', 1000],
      ['classic', 1500],
      ['wide', 2000],
      ['large', 2400],
    ]);
    expect(PRESETS_UNCONFIRMED).toBe(true);
  });

  it.each(READY_MODELS.map((m) => [m.id, m] as const))(
    '%s loads valid params with no customer-blocking issue',
    (_id, m) => {
      const r = generate(TEMPLATE, modelParams(m));
      expect(r.issues.filter(isCustomerBlocking)).toEqual([]);
      expect(r.panels.length).toBeGreaterThan(0);
      // default height / depth, recommended (auto) interior
      expect(modelParams(m).height).toBe(1900);
      expect(modelParams(m).interior1).toBe('auto');
    },
  );
});
