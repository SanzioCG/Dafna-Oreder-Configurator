import { catalogForTemplate, computeBom, computePrice, type PriceResult } from '@dafna/engine';
import { useMemo } from 'react';
import { useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import type { Configurator } from '../state/useConfigurator';

/**
 * D-9: customers see the price only once Dafna's real price list replaces the DEMO one
 * (never a demo number in front of a customer). Staff always see it, marked "sinov narxi".
 */
export function priceVisible(mode: Mode, price: PriceResult): boolean {
  return mode === 'staff' || !price.demo;
}

export function usePrice(config: Configurator): PriceResult {
  const { template, params, result } = config;
  return useMemo(
    () => computePrice(computeBom(template, params, result), catalogForTemplate(template)),
    [template, params, result],
  );
}

/** "3 139 000": thousands separated by a plain space (locale separators are non-breaking) */
const money = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function PriceTag({ mode, config }: { mode: Mode; config: Configurator }) {
  const { t } = useI18n();
  const price = usePrice(config);
  if (!priceVisible(mode, price) || config.hasErrors) return null;
  return (
    <p className="price-tag" data-testid="price">
      <span>{t('price.total')}:</span>
      <strong>
        {money(price.total)} {t('price.currency')}
      </strong>
      {price.demo && <span className="price-demo">{t('price.demo')}</span>}
    </p>
  );
}

/** Staff: the calculation behind the price (BOM lines and the sums). */
export function PriceBreakdown({ config }: { config: Configurator }) {
  const { t } = useI18n();
  const price = usePrice(config);
  return (
    <details className="price-breakdown" data-testid="price-breakdown">
      <summary>
        {t('price.breakdown')} ({price.priceListVersion})
      </summary>
      <table>
        <tbody>
          {price.lines.map((l) => (
            <tr key={`${l.kind}-${l.ref}`}>
              <td>{l.ref}</td>
              <td>
                {l.qty} {l.unit}
              </td>
              <td>{money(l.cost)}</td>
            </tr>
          ))}
          <tr>
            <td>{t('price.labor')}</td>
            <td />
            <td>{money(price.labor)}</td>
          </tr>
          <tr>
            <td>{t('price.markup')}</td>
            <td />
            <td>{money(price.markup)}</td>
          </tr>
          <tr>
            <td>
              <strong>{t('price.total')}</strong>
            </td>
            <td />
            <td>
              <strong>{money(price.total)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      {price.missing.length > 0 && (
        <p className="segment-reason">
          {t('price.missing')}: {price.missing.join(', ')}
        </p>
      )}
    </details>
  );
}
