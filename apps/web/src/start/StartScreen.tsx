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
import { ArrowLeftIcon, ArrowRightIcon } from '../ui/icons';
import { formatLength, unitSystemFor } from '../viewer/dimensions';
import { ModelThumbnail } from './ModelThumbnail';
import { ProductIcon } from './ProductIcon';

/** D-24: card colour of each product on the first start screen */
const PRODUCT_FILL: Record<ProductId, string> = {
  wardrobe: 'var(--step-size)',
  pedestal: 'var(--step-color)',
  desk: 'var(--step-interior)',
};

/**
 * Step 0, in two screens (D-24, simpler for everyone):
 * 1. "Nima buyurtma qilmoqchisiz?" - three large product cards with a drawing (Shkaf / Ofis
 *    tumbasi / Stol, D-8);
 * 2. the chosen product's ready-made models (bento cards with a front-view thumbnail, name,
 *    width and "Tanlash") and "Noldan boshlash"; "Mahsulotlar" goes back to screen 1.
 * Selecting a model loads its engine params and continues to step 1.
 */
export function StartScreen({
  mode,
  onPick,
  onScratch,
}: {
  mode: Mode;
  onPick: (model: ReadyModel) => void;
  onScratch: (product: ProductId) => void;
}) {
  const { t } = useI18n();
  const [product, setProduct] = useState<ProductId | null>(null);
  const units = unitSystemFor(mode);
  const unit = t(units === 'cm' ? 'unit.cm' : 'unit.mm');

  if (product === null)
    return (
      <div className="start" data-testid="start-screen">
        <div className="step-intro">
          <h1>{t('start.whatTitle')}</h1>
          <p className="muted">{t('start.whatHint')}</p>
        </div>
        <div className="product-grid" aria-label={t('start.product')}>
          {PRODUCTS.map((p) => {
            const count = READY_MODELS.filter((m) => m.product === p).length;
            return (
              <button
                key={p}
                type="button"
                className="card product-card"
                style={{ '--card-fill': PRODUCT_FILL[p] } as React.CSSProperties}
                data-product={p}
                aria-label={`${t(`product.${p}`)}: ${t('start.choose')}`}
                onClick={() => setProduct(p)}
              >
                <ProductIcon product={p} />
                <span className="product-card-name">{t(`product.${p}`)}</span>
                <span className="product-card-hint">
                  {t(`start.productHint.${p}`)}
                  <br />
                  <strong>{t('start.models', { count })}</strong>
                </span>
                <span className="btn btn-secondary btn-wide product-card-choose" aria-hidden="true">
                  {t('start.choose')}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="start" data-testid="start-screen">
      <Button
        variant="text"
        icon={<ArrowLeftIcon />}
        onClick={() => setProduct(null)}
        data-testid="start-back"
      >
        {t('start.products')}
      </Button>
      <div className="step-intro">
        <h1>{t(`start.title.${product}`)}</h1>
        <p className="muted">{t('start.hint')}</p>
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
