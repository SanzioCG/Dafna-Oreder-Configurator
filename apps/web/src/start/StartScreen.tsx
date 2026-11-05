import { useI18n } from '../i18n/I18n';
import { READY_MODELS, modelParams, type ReadyModel } from '../state/presets';
import { Button } from '../ui/Button';
import { ArrowRightIcon } from '../ui/icons';
import { formatLength, unitSystemFor } from '../viewer/dimensions';
import { ModelThumbnail } from './ModelThumbnail';

/**
 * Step 0 — "Shkafingizni tanlang": four ready-made models (bento cards with a front-view
 * thumbnail, name, width and "Tanlash") and "Noldan boshlash". Selecting loads the model's
 * engine params and continues to step 1.
 */
export function StartScreen({
  onPick,
  onScratch,
}: {
  onPick: (model: ReadyModel) => void;
  onScratch: () => void;
}) {
  const { t } = useI18n();
  const units = unitSystemFor();
  const unit = t(units === 'cm' ? 'unit.cm' : 'unit.mm');
  return (
    <div className="start" data-testid="start-screen">
      <div className="step-intro">
        <h1>{t('start.title')}</h1>
        <p className="muted">{t('start.hint')}</p>
      </div>
      <div className="model-grid">
        {READY_MODELS.map((m) => {
          const params = modelParams(m);
          const name = t(m.nameKey);
          return (
            <section
              key={m.id}
              className="card model-card"
              style={{ '--card-fill': m.fill } as React.CSSProperties}
              data-model={m.id}
            >
              <ModelThumbnail params={params} label={name} />
              <div className="model-meta">
                <h2>{name}</h2>
                <span className="model-width">
                  {formatLength(Number(params.width), units, unit)}
                </span>
              </div>
              <Button
                variant="secondary"
                wide
                onClick={() => onPick(m)}
                aria-label={`${name}: ${t('start.choose')}`}
              >
                {t('start.choose')}
              </Button>
            </section>
          );
        })}
      </div>
      <Button variant="text" iconAfter={<ArrowRightIcon />} onClick={onScratch}>
        {t('start.scratch')}
      </Button>
    </div>
  );
}
