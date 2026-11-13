import { useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import type { Configurator } from '../state/useConfigurator';
import { blockingIssue } from './optionAvailability';
import { customerReason } from './plainText';

/**
 * Step 3 for products without wardrobe sections (D-8): the template's enum parameters of the
 * 'interior' step as plain-language option rows (title + one-line hint). Office pedestal:
 * drawer layout; desk: legs (LDSP / steel frame / height-adjustable frame). An option that
 * would block (e.g. A4 file drawer on a 400 mm pedestal) is disabled with a human reason.
 */
export function OptionsStep({ mode, config }: { mode: Mode; config: Configurator }) {
  const { t } = useI18n();
  const template = config.template;
  const defs = template.parameters.filter(
    (d) => d.uiStep === 'interior' && d.type === 'enum' && d.customerVisible,
  );
  const product = template.templateId;
  return (
    <section className="card step-card" data-step="interior" data-card="interior">
      <div className="card-head">
        <h2>{t(`step.interior.title.${product}`)}</h2>
        <p className="muted">{t(`step.interior.hint.${product}`)}</p>
      </div>
      {defs.map((def) => {
        const value = config.params[def.key] ?? def.default;
        return (
          <div
            key={def.key}
            className="option-list"
            role="radiogroup"
            aria-label={t(def.labelKey)}
            data-param={def.key}
          >
            {(def.options ?? []).map((o) => {
              const selected = o === value;
              const code = selected ? null : blockingIssue(def, o, config.params, mode, template);
              return (
                <button
                  key={String(o)}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={code !== null}
                  data-option={String(o)}
                  className={selected ? 'option-row active' : 'option-row'}
                  onClick={() => config.setParam(def.key, o)}
                >
                  <span className="option-text">
                    <span className="option-title">{t(`c.opt.${def.key}.${String(o)}`)}</span>
                    <span className="option-hint">{t(`c.hint.${def.key}.${String(o)}`)}</span>
                    {code && <span className="segment-reason">{customerReason(t, code)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}
