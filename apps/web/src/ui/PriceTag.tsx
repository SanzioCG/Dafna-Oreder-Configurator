import { catalogForTemplate, computeBom, computePrice, type PriceResult } from '@dafna/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import type { Configurator } from '../state/useConfigurator';

/**
 * D-9: in production customers see the price only once Dafna's real price list replaces the
 * DEMO one (never a demo number in front of a real customer). Staff always see it, marked
 * "sinov narxi"; a dev build (local testing) shows the demo price on customer screens too.
 */
export function priceVisible(
  mode: Mode,
  price: PriceResult,
  dev: boolean = import.meta.env.DEV,
): boolean {
  return mode === 'staff' || !price.demo || dev;
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** The shown number runs to the new price (ease-out, ~0.6 s); reduced motion: jumps. */
export function useCountUp(target: number, ms = 600): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target || reducedMotion() || typeof requestAnimationFrame === 'undefined') {
      from.current = target;
      setShown(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const v = start + (target - start) * (1 - (1 - k) ** 3);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
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
  const shown = useCountUp(price.total);
  // a short highlight while the number runs: up (more expensive) / down
  const [dir, setDir] = useState<'up' | 'down' | null>(null);
  const last = useRef(price.total);
  useEffect(() => {
    if (price.total === last.current) return;
    setDir(price.total > last.current ? 'up' : 'down');
    last.current = price.total;
    const id = setTimeout(() => setDir(null), 900);
    return () => clearTimeout(id);
  }, [price.total]);
  if (!priceVisible(mode, price) || config.hasErrors) return null;
  return (
    <p
      className={dir ? `price-tag price-${dir}` : 'price-tag'}
      data-testid="price"
      data-total={price.total}
    >
      <span>{t('price.total')}:</span>
      <strong>
        {money(shown)} {t('price.currency')}
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
