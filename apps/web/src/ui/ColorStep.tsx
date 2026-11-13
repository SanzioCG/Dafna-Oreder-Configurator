import { SAME_AS_CORPUS, getParamDef } from '@dafna/engine';
import { useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import type { Configurator } from '../state/useConfigurator';
import { MaterialSwatch } from './MaterialSwatch';
import { Toggle } from './Toggle';

/**
 * Step 2 "Rang" (yellow card), any product (D-8): the template's swatch parameters of this step
 * in template order.
 * - doorMaterial (wardrobe doors / pedestal fronts): toggle "… boshqa rangda" (OFF = follows
 *   the corpus, swatches hidden; ON = swatches with the current decor selected);
 * - desk: work top always; LDSP leg decor only with LDSP legs; frame colour only with a metal
 *   frame.
 * Catalog ids are preserved; staff-only decors and thicknesses are hidden from customers by
 * MaterialSwatch.
 */
export function ColorStep({ mode, config }: { mode: Mode; config: Configurator }) {
  const { t } = useI18n();
  const template = config.template;
  const defs = template.parameters.filter(
    (d) => d.uiStep === 'color' && d.control === 'swatch' && d.customerVisible,
  );
  const corpus = config.params.corpusMaterial ?? getParamDef(template, 'corpusMaterial')?.default;
  const legs = config.params.legs;

  const visible = (key: string) => {
    if (key === 'doorMaterial' && template.templateId === 'wardrobe') {
      return config.params.doors !== 'none';
    }
    if (template.templateId === 'desk') {
      if (key === 'corpusMaterial') return legs === 'ldsp';
      if (key === 'frameColor') return legs !== 'ldsp';
    }
    return true;
  };

  return (
    <section className="card step-card" data-step="color" data-card="color">
      <div className="card-head">
        <h2>{t(`step.color.title.${template.templateId}`)}</h2>
        <p className="muted">{t(`step.color.hint.${template.templateId}`)}</p>
      </div>
      {defs
        .filter((d) => visible(d.key))
        .map((def) => {
          const value = config.params[def.key] ?? def.default;
          if (def.key === 'doorMaterial') {
            const different = value !== SAME_AS_CORPUS;
            const options = (def.options ?? []).filter((o) => o !== SAME_AS_CORPUS);
            return (
              <div className="param" data-param="doorMaterial" key={def.key}>
                <Toggle
                  checked={different}
                  onChange={(on) =>
                    config.setParam('doorMaterial', on ? (corpus ?? '') : SAME_AS_CORPUS)
                  }
                  testId="toggle-door-color"
                >
                  {t(template.templateId === 'pedestal' ? 'c.frontsOther' : 'c.doorsOther')}
                </Toggle>
                {different && (
                  <MaterialSwatch
                    options={options}
                    value={value}
                    corpusValue={corpus ?? ''}
                    mode={mode}
                    label={t(def.labelKey)}
                    onChange={(v) => config.setParam('doorMaterial', v)}
                  />
                )}
              </div>
            );
          }
          return (
            <div className="param" data-param={def.key} key={def.key}>
              <span className="param-label">{t(def.labelKey)}</span>
              <MaterialSwatch
                options={def.options ?? []}
                value={value}
                corpusValue={value}
                mode={mode}
                label={t(def.labelKey)}
                onChange={(v) => config.setParam(def.key, v)}
              />
            </div>
          );
        })}
    </section>
  );
}
