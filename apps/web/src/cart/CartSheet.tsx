import { PRODUCT_TEMPLATES } from '@dafna/engine';
import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/I18n';
import { summarizeParams } from '../lead/summary';
import type { Mode } from '../mode';
import { ModelThumbnail } from '../start/ModelThumbnail';
import { Button } from '../ui/Button';
import { CloseIcon } from '../ui/icons';
import { priceVisible } from '../ui/PriceTag';
import { MAX_QUANTITY, cartTotal, type CartItem } from './cart';

/** "3 139 000" (plain spaces) */
const money = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * D-25 "Savat": every product the customer has put in the cart (picture, name, size, decors,
 * price), with the number of pieces, "O'zgartirish" (back into the configurator) and
 * "O'chirish"; the total and "Buyurtma berish" (one contact form for the whole order).
 */
export function CartSheet({
  mode,
  cart,
  onQuantity,
  onRemove,
  onEdit,
  onOrder,
  onClose,
}: {
  mode: Mode;
  cart: CartItem[];
  onQuantity: (uid: string, quantity: number) => void;
  onRemove: (uid: string) => void;
  onEdit: (uid: string) => void;
  onOrder: () => void;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = (p: CartItem['price']) => p !== null && priceVisible(mode, p);
  const total = cartTotal(cart);
  const showTotal = total !== null && cart.every((c) => shown(c.price));
  const pieces = cart.reduce((n, c) => n + c.quantity, 0);

  return (
    <div
      className="modal-backdrop hw-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="hw-sheet cart-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
        data-testid="cart-sheet"
      >
        <header className="hw-sheet-head">
          <h2 id="cart-title">
            {t('cart.title')} <span className="cart-count">{pieces}</span>
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="btn btn-secondary hw-sheet-close"
            aria-label={t('cart.close')}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>
        <ul className="cart-list">
          {cart.map((c) => {
            const template = PRODUCT_TEMPLATES[c.product]!;
            const s = summarizeParams(c.params, lang, template);
            return (
              <li key={c.uid} className="cart-item" data-testid="cart-item">
                {c.renderPng ? (
                  <img className="cart-thumb" src={c.renderPng} alt="" />
                ) : (
                  <span className="cart-thumb">
                    <ModelThumbnail params={c.params} label={s.productName} template={template} />
                  </span>
                )}
                <div className="cart-info">
                  <strong className="cart-name">{t(`product.${c.product}`)}</strong>
                  <span className="cart-line">
                    {s.sizeCm} · {s.colorsLine}
                  </span>
                  {shown(c.price) && (
                    <span className="cart-price">
                      {money(c.price!.total)} {t('price.currency')}
                    </span>
                  )}
                  <div className="cart-actions">
                    <Button variant="secondary" onClick={() => onEdit(c.uid)}>
                      {t('cart.edit')}
                    </Button>
                    <Button variant="text" onClick={() => onRemove(c.uid)}>
                      {t('cart.remove')}
                    </Button>
                  </div>
                </div>
                <div className="cart-qty" role="group" aria-label={t('cart.qty')}>
                  <button
                    type="button"
                    className="stepper-btn"
                    aria-label={t('cart.less')}
                    disabled={c.quantity <= 1}
                    onClick={() => onQuantity(c.uid, c.quantity - 1)}
                  >
                    −
                  </button>
                  <span className="cart-qty-n" data-testid="cart-qty">
                    {c.quantity}
                  </span>
                  <button
                    type="button"
                    className="stepper-btn"
                    aria-label={t('cart.more')}
                    disabled={c.quantity >= MAX_QUANTITY}
                    onClick={() => onQuantity(c.uid, c.quantity + 1)}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <footer className="cart-foot">
          {showTotal && (
            <p className="cart-total" data-testid="cart-total">
              <span>{t('cart.total')}</span>
              <strong>
                {money(total)} {t('price.currency')}
              </strong>
            </p>
          )}
          <Button variant="primary" large wide onClick={onOrder} data-testid="cart-order">
            {t('cart.order')}
          </Button>
        </footer>
      </div>
    </div>
  );
}
