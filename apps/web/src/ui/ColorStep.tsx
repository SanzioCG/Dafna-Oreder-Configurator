import { SAME_AS_CORPUS, getParamDef } from '@dafna/engine';
import { useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import { TEMPLATE, type Configurator } from '../state/useConfigurator';
import { MaterialSwatch } from './MaterialSwatch';
import { Toggle } from './Toggle';

/**
 * Step 2 "Rang" (yellow card): corpus decor swatches; toggle "Eshiklar boshqa rangda" (OFF by
 * default = doors follow the corpus decor, door swatches hidden; ON = door swatches shown with
 * the current door decor selected). Catalog ids are preserved; staff-only decors (18 mm) and
 * thicknesses are hidden from customers by MaterialSwatch.
 */
export function ColorStep({ mode, config }: { mode: Mode; config: Configurator }) {
  const { t } = useI18n();
  const corpusDef = getParamDef(TEMPLATE, 'corpusMaterial');
  const doorDef = getParamDef(TEMPLATE, 'doorMaterial');
  if (!corpusDef || !doorDef) return null;
  const corpus = config.params.corpusMaterial ?? corpusDef.default;
  const door = config.params.doorMaterial ?? doorDef.default;
  const different = door !== SAME_AS_CORPUS;
  const hasDoors = config.params.doors !== 'none';
  const doorOptions = (doorDef.options ?? []).filter((o) => o !== SAME_AS_CORPUS);

  return (
    <section className="card step-card" data-step="color" data-card="color">
      <div className="card-head">
        <h2>{t('step.color.title')}</h2>
        <p className="muted">{t('step.color.hint')}</p>
      </div>
      <div className="param" data-param="corpusMaterial">
        <span className="param-label">{t('param.corpusMaterial')}</span>
        <MaterialSwatch
          options={corpusDef.options ?? []}
          value={corpus}
          corpusValue={corpus}
          mode={mode}
          label={t('param.corpusMaterial')}
          onChange={(v) => config.setParam('corpusMaterial', v)}
        />
      </div>
      {hasDoors && (
        <div className="param" data-param="doorMaterial">
          <Toggle
            checked={different}
            onChange={(on) => config.setParam('doorMaterial', on ? corpus : SAME_AS_CORPUS)}
            testId="toggle-door-color"
          >
            {t('c.doorsOther')}
          </Toggle>
          {different && (
            <MaterialSwatch
              options={doorOptions}
              value={door}
              corpusValue={corpus}
              mode={mode}
              label={t('param.doorMaterial')}
              onChange={(v) => config.setParam('doorMaterial', v)}
            />
          )}
        </div>
      )}
    </section>
  );
}
