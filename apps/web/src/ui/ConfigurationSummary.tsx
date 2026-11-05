import { SAME_AS_CORPUS, getMaterial, type DoorType } from '@dafna/engine';
import { optionLabel, useI18n, type Translate } from '../i18n/I18n';
import type { Mode } from '../mode';
import { CATALOG, type Configurator } from '../state/useConfigurator';
import { formatSize, unitSystemFor } from '../viewer/dimensions';

export interface SummaryRow {
  key: string;
  label: string;
  value: string;
  /** wizard step that edits this row */
  step: string;
}

function materialName(t: Translate, id: unknown): string {
  const m = getMaterial(CATALOG, String(id));
  return m ? t(m.decorName) : String(id);
}

/** Door types of all sections, e.g. "Ikki tabaqali × 2" or "Chap ilmoq, O'ng ilmoq". */
function doorsValue(t: Translate, types: DoorType[]): string {
  const doored = types.filter((d) => d !== 'none');
  if (doored.length === 0) return t('option.doors.none');
  const counts = new Map<DoorType, number>();
  for (const d of doored) counts.set(d, (counts.get(d) ?? 0) + 1);
  return [...counts]
    .map(([d, n]) => {
      const label = optionLabel(t, 'doorSection', d);
      return n > 1 ? `${label} × ${n}` : label;
    })
    .join(', ');
}

/** Summary rows from the ENGINE result (what will be built) and the chosen materials. */
export function summaryRows(config: Configurator, mode: Mode, t: Translate): SummaryRow[] {
  const r = config.view.result;
  const dims = r.dimensions;
  const units = unitSystemFor();
  const unit = t(units === 'cm' ? 'unit.cm' : 'unit.mm');
  const size = dims
    ? formatSize(dims.widthMm, dims.heightMm, dims.depthMm, units, unit)
    : formatSize(config.view.widthMm, config.view.heightMm, config.view.depthMm, units, unit);
  const corpus = config.params.corpusMaterial;
  const doorMat = config.params.doorMaterial;
  const hasDoors = r.sections.some((s) => s.doorType !== 'none');
  const rows: SummaryRow[] = [
    { key: 'size', label: t('summary.size'), value: size, step: 'size' },
    {
      key: 'corpus',
      label: t('param.corpusMaterial'),
      value: materialName(t, corpus),
      step: 'color',
    },
  ];
  if (hasDoors) {
    rows.push({
      key: 'doorColor',
      label: t('param.doorMaterial'),
      value: materialName(t, doorMat === SAME_AS_CORPUS ? corpus : doorMat),
      step: 'color',
    });
  }
  rows.push(
    {
      key: 'sections',
      label: t('summary.sectionsRow'),
      value: t('summary.sectionsValue', {
        count: r.sections.length,
        list: r.sections.map((s) => optionLabel(t, 'interior', s.preset)).join(', '),
      }),
      step: 'interior',
    },
    {
      key: 'doors',
      label: t('param.doors'),
      value: doorsValue(
        t,
        r.sections.map((s) => s.doorType),
      ),
      step: 'doors',
    },
  );
  return rows;
}

/**
 * Stable state of the presentation: a compact summary card on the right side (never over the
 * wardrobe centre). Each row links back to its step with the selection intact; the primary
 * (green, --success) button confirms, the secondary returns to the configurator.
 */
export function ConfigurationSummary({
  config,
  mode,
  onEditStep,
  onConfirm,
  onEdit,
}: {
  config: Configurator;
  mode: Mode;
  onEditStep: (step: string) => void;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const rows = summaryRows(config, mode, t);
  return (
    <section className="present-summary" aria-label={t('summary.title')} data-testid="summary-card">
      <h3>{t('summary.title')}</h3>
      <dl>
        {rows.map((r) => (
          <div key={r.key} className="summary-row" data-row={r.key}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
            <button
              type="button"
              className="summary-change"
              aria-label={`${r.label}: ${t('summary.change')}`}
              onClick={() => onEditStep(r.step)}
            >
              {t('summary.change')}
            </button>
          </div>
        ))}
      </dl>
      <div className="summary-actions">
        <button type="button" className="btn btn-success btn-wide" onClick={onConfirm}>
          {t('present.confirm')}
        </button>
        <button type="button" className="btn btn-secondary btn-wide" onClick={onEdit}>
          {t('present.edit')}
        </button>
      </div>
    </section>
  );
}
