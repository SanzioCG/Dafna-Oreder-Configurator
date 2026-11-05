import { generate, getParamDef, type InteriorPreset, type Params } from '@dafna/engine';
import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import { TEMPLATE, type Configurator } from '../state/useConfigurator';
import { Button } from './Button';
import { PresetIcon } from './icons';
import { blockingIssue } from './optionAvailability';
import { customerReason } from './plainText';
import { SelectionGrid } from './SelectionGrid';
import { StatusMessage } from './StatusMessage';
import { Toggle } from './Toggle';

/** Display order of the interior options (plain-language list, brief D-4). */
export const INTERIOR_ORDER = [
  'auto',
  'rail',
  'shelves',
  'rail_shelf',
  'drawers_shelves',
  'rail_drawers',
  'empty',
] as const;

interface InteriorStepProps {
  mode: Mode;
  config: Configurator;
  /** 0-based selected section (shared with the 3D view) */
  selected: number;
  onSelect: (index: number) => void;
}

/**
 * Step 3 "Ichki" (lavender card): "Eshikli shkaf" toggle (doors auto / none), part pills
 * ("1", "2", "3" — also tap in 3D, the smart camera frames the part), then the interior options
 * in plain language (icon badge + title + one-line hint). "Tavsiya etilgan" = the template's
 * auto rule (shows what it resolves to). Disabled options show a human reason, never a code.
 * Engine parameters stay interior1..4 / doors.
 */
export function InteriorStep({ mode, config, selected, onSelect }: InteriorStepProps) {
  const { t } = useI18n();
  const staff = mode === 'staff';
  const sections = config.view.result.sections;
  const count = sections.length;
  const sel = Math.max(0, Math.min(selected, count - 1));
  const def = getParamDef(TEMPLATE, `interior${sel + 1}`);
  const value = def ? (config.params[def.key] ?? def.default) : 'auto';
  const [skipped, setSkipped] = useState<{ sections: number[]; code: string } | null>(null);

  // what 'auto' resolves to for this section (template default rule)
  const autoPreset = useMemo<InteriorPreset>(() => {
    if (!def) return 'shelves';
    if (value === 'auto') return sections[sel]?.preset ?? 'shelves';
    const r = generate(TEMPLATE, { ...config.params, [def.key]: 'auto' });
    return r.sections[sel]?.preset ?? 'shelves';
  }, [def, value, sections, sel, config.params]);

  if (!def || count === 0) return null;

  const reasonText = (code: string) =>
    staff
      ? t(`reason.${code}`) === `reason.${code}`
        ? t('reason.default')
        : t(`reason.${code}`)
      : customerReason(t, code);

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
  const options = INTERIOR_ORDER.filter((o) => (def.options ?? []).includes(o));
  const doorsOn = config.params.doors !== 'none';

  return (
    <>
      <section className="card step-card" data-step="interior" data-card="interior">
        <div className="card-head">
          <h2>{t('step.interior.title')}</h2>
          <p className="muted">{t('step.interior.hint')}</p>
        </div>

        <Toggle
          checked={doorsOn}
          onChange={(on) => config.setParam('doors', on ? 'auto' : 'none')}
          testId="toggle-doors"
        >
          {t('c.withDoors')}
        </Toggle>

        <div className="param">
          <span className="param-label">{t('c.part')}</span>
          <SelectionGrid
            options={sections.map((_, i) => i)}
            value={sel}
            onChange={(i) => {
              setSkipped(null);
              onSelect(i);
            }}
            label={(i) => String(i + 1)}
            ariaLabel={t('c.part')}
          />
        </div>

        <div className="option-list" role="radiogroup" aria-label={t('c.partFill', { n: sel + 1 })}>
          {options.map((o) => {
            const isSelected = o === value;
            const code = isSelected ? null : blockingIssue(def, o, config.params, mode);
            const preset = o === 'auto' ? autoPreset : (o as InteriorPreset);
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={code !== null}
                data-preset={o}
                className={isSelected ? 'option-row active' : 'option-row'}
                onClick={() => {
                  setSkipped(null);
                  config.setParam(def.key, o);
                }}
              >
                <span className="icon-badge option-badge">
                  <PresetIcon preset={preset} />
                </span>
                <span className="option-text">
                  <span className="option-title">
                    {t(`c.opt.${o}`)}
                    {o === 'auto' && <span className="tag">{t('c.recommended')}</span>}
                  </span>
                  <span className="option-hint">
                    {o === 'auto'
                      ? t('c.now', { name: t(`c.opt.${autoPreset}`) })
                      : t(`c.hint.${o}`)}
                  </span>
                  {code && <span className="segment-reason">{reasonText(code)}</span>}
                </span>
              </button>
            );
          })}
        </div>

        {count > 1 && (
          <Button variant="secondary" wide disabled={allSame} onClick={applyToAll}>
            {t('c.applyAll')}
          </Button>
        )}
        {skipped && (
          <StatusMessage role="note">
            {t('c.skipped', {
              sections: skipped.sections.join(', '),
              reason: reasonText(skipped.code),
            })}
          </StatusMessage>
        )}
      </section>

      {staff && section && (
        <section className="card" data-testid="interior-details">
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
