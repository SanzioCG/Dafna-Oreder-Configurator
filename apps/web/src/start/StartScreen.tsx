import { PRODUCT_TEMPLATES } from '@dafna/engine';
import { useState } from 'react';
import { useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import {
  PRODUCTS,
  READY_MODELS,
  modelParams,
  type ProductId,
  type ReadyModel,
} from '../state/presets';
import { Button } from '../ui/Button';
import { ArrowRightIcon } from '../ui/icons';
import { formatLength, unitSystemFor } from '../viewer/dimensions';
import { ModelThumbnail } from './ModelThumbnail';

/**
 * Step 0: the product (Shkaf / Ofis tumbasi / Stol, D-8), then its ready-made models (bento
 * cards with a front-view thumbnail, name, width and "Tanlash") and "Noldan boshlash".
 * Selecting loads the model's engine params and continues to step 1.
 */
export function StartScreen({
  mode,
  onPick,
  onScratch,
  initialProduct = 'wardrobe',
}: {
  mode: Mode;
  onPick: (model: ReadyModel) => void;
  onScratch: (product: ProductId) => void;
  initialProduct?: ProductId;
}) {
  const { t } = useI18n();
  const [product, setProduct] = useState<ProductId>(initialProduct);
  const units = unitSystemFor(mode);
  const unit = t(units === 'cm' ? 'unit.cm' : 'unit.mm');
  return (
    <div className="start" data-testid="start-screen">
      <div className="step-intro">
        <h1>{t(`start.title.${product}`)}</h1>
        <p className="muted">{t('start.hint')}</p>
      </div>
      <div className="product-tabs" role="radiogroup" aria-label={t('start.product')}>
        {PRODUCTS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={p === product}
            className={p === product ? 'segment chip active' : 'segment chip'}
            data-product={p}
            onClick={() => setProduct(p)}
          >
            {t(`product.${p}`)}
          </button>
        ))}
      </div>
      <div className="model-grid">
        {READY_MODELS.filter((m) => m.product === product).map((m) => {
          const params = modelParams(m);
          const name = t(m.nameKey);
          return (
            <section
              key={m.id}
              className="card model-card"
              style={{ '--card-fill': m.fill } as React.CSSProperties}
              data-model={m.id}
            >
              <ModelThumbnail
                params={params}
                label={name}
                template={PRODUCT_TEMPLATES[m.product]}
              />
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
      <Button variant="text" iconAfter={<ArrowRightIcon />} onClick={() => onScratch(product)}>
        {t('start.scratch')}
      </Button>
    </div>
  );
}
