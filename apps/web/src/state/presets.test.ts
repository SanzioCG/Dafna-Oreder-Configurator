import { PRODUCT_TEMPLATES, generate, getParamDef } from '@dafna/engine';
import { describe, expect, it } from 'vitest';
import { PRESETS_UNCONFIRMED, PRODUCTS, READY_MODELS, modelParams } from './presets';
import { isCustomerBlocking } from './useConfigurator';

describe('ready-made models (start screen)', () => {
  it('wardrobe: four models 100 / 150 / 200 / 240 sm; pedestal two (D-22: no A4 file drawer); desk two', () => {
    expect(
      READY_MODELS.filter((m) => m.product === 'wardrobe').map((m) => [m.id, modelParams(m).width]),
    ).toEqual([
      ['compact', 1000],
      ['classic', 1500],
      ['wide', 2000],
      ['large', 2400],
    ]);
    expect(PRODUCTS.map((p) => READY_MODELS.filter((m) => m.product === p).length)).toEqual([
      4, 2, 2,
    ]);
    expect(PRESETS_UNCONFIRMED).toBe(true);
  });

  it.each(READY_MODELS.map((m) => [m.id, m] as const))(
    '%s: valid params of its product, standard sizes, no customer-blocking issue',
    (_id, m) => {
      const template = PRODUCT_TEMPLATES[m.product]!;
      const params = modelParams(m);
      const r = generate(template, params);
      expect(r.issues.filter(isCustomerBlocking)).toEqual([]);
      expect(r.issues).toEqual([]);
      expect(r.panels.length).toBeGreaterThan(0);
      for (const key of ['width', 'height', 'depth']) {
        const values = getParamDef(template, key)?.customerValues;
        if (values) expect(values, `${m.id} ${key}`).toContain(params[key]);
      }
    },
  );
});
