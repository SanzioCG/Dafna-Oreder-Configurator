import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import { useQuote, type Quote } from '../state/priceSource';
import type { Configurator } from '../state/useConfigurator';

/**
 * D-9: staff always see the price; a real (non-demo) price is shown to everyone.
 * D-18 (founder, 2026-11-17): the DEMO price is shown to customers too, marked "sinov narxi",
 * so Dafna's management can review the pricing on the live site. A deployment hides it again
 * with the build-time env `VITE_HIDE_DEMO_PRICE=1` (e.g. a kiosk in a shop before Dafna's real
 * price list is in).
 * D-19: the price comes from the server (useQuote); a customer only receives the final number.
 */
export function priceVisible(
  mode: Mode,
  price: Pick<Quote, 'demo'>,
  showDemo: boolean = import.meta.env.VITE_HIDE_DEMO_PRICE !== '1',
): boolean {
  return mode === 'staff' || !price.demo || showDemo;
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

export function usePrice(config: Configurator): Quote | null {
  const { template, params, result } = config;
  return useQuote({ template, params, result });
}

/** "3 139 000": thousands separated by a plain space (locale separators are non-breaking) */
const money = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function PriceTag({ mode, config }: { mode: Mode; config: Configurator }) {
  const { t } = useI18n();
  const price = usePrice(config);
  const total = price?.total ?? 0;
  const shown = useCountUp(total);
  // a short highlight while the number runs: up (more expensive) / down
  const [dir, setDir] = useState<'up' | 'down' | null>(null);
  const last = useRef(total);
  useEffect(() => {
    if (!price || total === last.current) return;
    const prev = last.current;
    last.current = total;
    if (prev === 0) return; // the first answer: no up / down highlight
    setDir(total > prev ? 'up' : 'down');
    const id = setTimeout(() => setDir(null), 900);
    return () => clearTimeout(id);
  }, [price, total]);
  if (!price || !priceVisible(mode, price) || config.hasErrors) return null;
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
  const price = usePrice(config)?.breakdown;
  if (!price) return null;
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
            <td>{t('price.assembly')}</td>
            <td />
            <td>{money(price.assembly)}</td>
          </tr>
          {price.services.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td />
              <td>{money(s.cost)}</td>
            </tr>
          ))}
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
