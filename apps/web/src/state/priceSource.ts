import {
  catalogForTemplate,
  computeBom,
  computePrice,
  type GenerateResult,
  type Params,
  type PriceResult,
  type Template,
} from '@dafna/engine';
import { useEffect, useMemo, useState } from 'react';

/**
 * D-19: the price comes from the server (POST /api/quote): the price list (costs, profit %) never
 * reaches the kiosk. A customer gets the final number only; staff (consultant PIN) also get the
 * breakdown. Tests compute locally with the DEMO list (no server in jsdom).
 */
export const QUOTE_URL = '/api/quote';

export interface Quote {
  total: number;
  currency: string;
  demo: boolean;
  priceListVersion: string;
  /** staff only */
  breakdown?: PriceResult;
}

export interface QuoteInput {
  template: Template;
  params: Params;
  result: GenerateResult;
}

/** local DEMO price (tests) */
export function localQuote({ template, params, result }: QuoteInput): Quote {
  const breakdown = computePrice(
    computeBom(template, params, result),
    catalogForTemplate(template),
    undefined,
    template.productType,
  );
  return {
    total: breakdown.total,
    currency: breakdown.currency,
    demo: breakdown.demo,
    priceListVersion: breakdown.priceListVersion,
    breakdown,
  };
}

export async function fetchQuote(
  { template, params }: QuoteInput,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<Quote | null> {
  try {
    // D-38: a signed-in staff member's session cookie travels by itself (breakdown)
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const res = await fetchImpl(QUOTE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        templateId: template.templateId,
        templateVersion: template.templateVersion,
        params,
      }),
      signal,
    });
    if (!res.ok) return null;
    const q = (await res.json()) as Partial<Quote>;
    return typeof q.total === 'number' ? (q as Quote) : null;
  } catch {
    return null;
  }
}

const LOCAL = import.meta.env.MODE === 'test';
/** wait this long after the last change before asking the server */
export const QUOTE_DEBOUNCE_MS = 250;

/** The current price: null while the first answer is on its way or the server is unreachable. */
export function useQuote(input: QuoteInput): Quote | null {
  const { template, params, result } = input;
  const local = useMemo(
    () => (LOCAL ? localQuote({ template, params, result }) : null),
    [template, params, result],
  );
  const [remote, setRemote] = useState<Quote | null>(null);
  useEffect(() => {
    if (LOCAL) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      void fetchQuote({ template, params, result }, ctrl.signal).then((q) => {
        if (!ctrl.signal.aborted) setRemote(q);
      });
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [template, params, result]);
  return LOCAL ? local : remote;
}
