import type { Params } from '@dafna/engine';
import { MAX_ORDER_ITEMS, MAX_QUANTITY, type SubmitItem } from '../lead/api';
import type { Quote } from '../state/priceSource';

/**
 * D-25: the customer's cart. One customer may order several products (a wardrobe, two
 * pedestals, a desk) with one contact form: each finished product is put in the cart and the
 * whole cart is sent as one order. Kept in memory only: a session reset empties it.
 */
export interface CartItem {
  uid: string;
  /** templateId: 'wardrobe' | 'pedestal' | 'desk' */
  product: string;
  params: Params;
  /** 1..MAX_QUANTITY */
  quantity: number;
  /** render taken when the product was put in the cart (PNG data URL) */
  renderPng?: string;
  /** price of one piece when it was put in the cart (null = not known yet) */
  price: Pick<Quote, 'total' | 'demo' | 'currency'> | null;
}

export { MAX_ORDER_ITEMS, MAX_QUANTITY };

let seq = 0;
export const newCartUid = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

export const clampQuantity = (n: number) => Math.max(1, Math.min(MAX_QUANTITY, Math.round(n)));

/** Renders are a bonus: the request stays well under the API body limit (3 MB). */
export const RENDER_BUDGET_CHARS = 2_400_000;

/**
 * The order to send: the cart, plus the product on screen when the customer confirms it from
 * the presentation. Renders are kept while they fit the budget (first products first).
 */
export function orderItems(
  cart: CartItem[],
  current: { product: string; params: Params; renderPng?: string } | null,
): SubmitItem[] {
  const all = [
    ...cart.map((c) => ({
      product: c.product,
      params: c.params,
      quantity: c.quantity,
      renderPng: c.renderPng,
    })),
    ...(current ? [{ ...current, quantity: 1 }] : []),
  ];
  let budget = RENDER_BUDGET_CHARS;
  return all.map(({ renderPng, ...rest }) => {
    if (renderPng && renderPng.length <= budget) {
      budget -= renderPng.length;
      return { ...rest, renderPng };
    }
    return rest;
  });
}

/** Total of the cart (pieces × price); null if any price is unknown. */
export function cartTotal(cart: CartItem[]): number | null {
  let sum = 0;
  for (const c of cart) {
    if (!c.price) return null;
    sum += c.price.total * c.quantity;
  }
  return sum;
}
