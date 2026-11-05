import { generate, getParamDef, type InteriorPreset, type Params } from '@dafna/engine';
import { useMemo, useState } from 'react';
import { optionLabel, useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import { TEMPLATE, type Configurator } from '../state/useConfigurator';
import { blockingIssue } from './optionAvailability';
import { PresetIllustration } from './PresetIllustration';
import { Segmented } from './Segmented';

interface InteriorStepProps {
  mode: Mode;
  config: Configurator;
  /** 0-based selected section (shared with the 3D view) */
  selected: number;
  onSelect: (index: number) => void;
}

/**
 * "Ichki to'ldirish" step: section tabs, illustrated preset cards for the selected section
 * (selection contract: selected = solid brand blue; disabled = 40% + reason via blockingIssue),
 * "apply to all sections", and staff details. Presets are the template params interior1..4.
 */
export function InteriorStep({ mode, config, selected, onSelect }: InteriorStepProps) {
  const { t } = useI18n();
  const sections = config.view.result.sections;
  const count = sections.length;
  const sel = Math.max(0, Math.min(selected, count - 1));
  const def = getParamDef(TEMPLATE, `interior${sel + 1}`);
  const value = def ? (config.params[def.key] ?? def.default) : 'auto';
  const [skipped, setSkipped] = useState<{ sections: number[]; code: string } | null>(null);

  // what 'auto' resolves to for this section (template default rule), shown on the auto card
  const autoPreset = useMemo<InteriorPreset>(() => {
    if (!def) return 'shelves';
    if (value === 'auto') return sections[sel]?.preset ?? 'shelves';
    const r = generate(TEMPLATE, { ...config.params, [def.key]: 'auto' });
    return r.sections[sel]?.preset ?? 'shelves';
  }, [def, value, sections, sel, config.params]);

  if (!def || count === 0) return null;

  const reasonText = (code: string) => {
    const key = `reason.${code}`;
    return t(key) === key ? t('reason.default') : t(key);
  };

  const applyToAll = () => {
    const patch: Params = {};
    const skippedSections: number[] = [];
    let skippedCode = '';
    for (let i = 0; i < count; i++) {
      if (i === sel) continue;
      const d = getParamDef(TEMPLATE, `interior${i + 1}`);
      if (!d) continue;
      const code = blockingIssue(d, value, config.params, mode);
      if (code) {
        skippedSections.push(i + 1);
        skippedCode = skippedCode || code;
      } else {
        patch[d.key] = value;
      }
    }
    config.setParams(patch);
    setSkipped(
      skippedSections.length > 0 ? { sections: skippedSections, code: skippedCode } : null,
    );
  };
  const allSame = sections.every((_, i) => (config.params[`interior${i + 1}`] ?? 'auto') === value);
  const section = sections[sel];

  return (
    <>
      <section className="card card-neutral" data-card="interior-sections">
        <span className="param-label">{t('interior.sections')}</span>
        <Segmented
          options={sections.map((_, i) => i)}
          value={sel}
          onChange={(i) => {
            setSkipped(null);
            onSelect(i);
          }}
          label={(i) => t('interior.section', { n: i + 1 })}
          ariaLabel={t('interior.sections')}
        />
      </section>

      <section className="card card-pastel" data-card="interior">
        <span className="param-label">{t(def.labelKey, { n: sel + 1 })}</span>
        <div className="preset-grid" role="radiogroup" aria-label={t(def.labelKey, { n: sel + 1 })}>
          {(def.options ?? []).map((o) => {
            const isSelected = o === value;
            const code = isSelected ? null : blockingIssue(def, o, config.params, mode);
            const label = optionLabel(t, 'interior', o);
            return (
              <button
                key={String(o)}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={code !== null}
                data-preset={String(o)}
                className={isSelected ? 'preset-card active' : 'preset-card'}
                onClick={() => {
                  setSkipped(null);
                  config.setParam(def.key, o);
                }}
              >
                <PresetIllustration
                  preset={o === 'auto' ? autoPreset : (o as InteriorPreset)}
                  auto={o === 'auto'}
                />
                <span className="preset-label">{label}</span>
                {o === 'auto' && (
                  <small className="preset-sub">{optionLabel(t, 'interior', autoPreset)}</small>
                )}
                {code && <small className="segment-reason">{reasonText(code)}</small>}
              </button>
            );
          })}
        </div>
        {count > 1 && (
          <button
            type="button"
            className="btn btn-secondary btn-wide"
            disabled={allSame}
            onClick={applyToAll}
          >
            {t('interior.applyAll')}
          </button>
        )}
        {skipped && (
          <p className="param-note" role="note">
            {t('interior.skipped', {
              sections: skipped.sections.join(', '),
              reason: reasonText(skipped.code),
            })}
          </p>
        )}
      </section>

      {mode === 'staff' && section && (
        <section className="card card-neutral" data-testid="interior-details">
          <span className="param-label">{t('interior.details', { n: sel + 1 })}</span>
          <p className="param-note">
            {section.preset} ({section.presetSource}) · {section.innerWidthMm} ×{' '}
            {section.innerHeightMm} × {section.innerDepthMm} mm
          </p>
          <p className="param-note">
            {t('interior.details.shelves', {
              count: section.shelves.length,
              positions: section.shelves.map((s) => `${s.yMm}`).join(', ') || '—',
            })}
          </p>
          {section.rails.map((r) => (
            <p key={r.id} className="param-note">
              {t('interior.details.rail', {
                y: r.axisYMm,
                h: section.clearHangingHeightMm ?? '—',
              })}
            </p>
          ))}
          {section.drawers.map((d) => (
            <p key={d.id} className="param-note">
              {t('interior.details.drawer', {
                y: d.frontYMm,
                fw: d.frontWidthMm,
                fh: d.frontHeightMm,
                bw: d.boxWidthMm,
                bh: d.boxHeightMm,
                bd: d.boxDepthMm,
              })}
            </p>
          ))}
        </section>
      )}
    </>
  );
}
