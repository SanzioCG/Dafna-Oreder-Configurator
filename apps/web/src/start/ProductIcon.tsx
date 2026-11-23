import type { ProductId } from '../state/presets';

/**
 * D-24: a simple line drawing of each product for the first start screen (wardrobe with two
 * doors, office pedestal with three drawers on castors, desk with a top on two legs).
 * Ink lines on the product's coloured card; decorative (the card carries the name).
 */
export function ProductIcon({ product }: { product: ProductId }) {
  const common = {
    viewBox: '0 0 120 120',
    className: 'product-icon',
    'aria-hidden': true,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (product === 'pedestal')
    return (
      <svg {...common}>
        <rect x="30" y="24" width="60" height="70" rx="3" fill="var(--paper)" />
        <path d="M30 47h60M30 70h60" />
        <path d="M52 36h16M52 59h16M52 82h16" />
        <circle cx="38" cy="102" r="5" />
        <circle cx="82" cy="102" r="5" />
      </svg>
    );
  if (product === 'desk')
    return (
      <svg {...common}>
        <rect x="10" y="42" width="100" height="10" rx="2" fill="var(--paper)" />
        <path d="M18 52v50M102 52v50" strokeWidth={6} />
        <path d="M24 60h72" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="26" y="10" width="68" height="96" rx="3" fill="var(--paper)" />
      <path d="M60 10v96M26 98h68" />
      <path d="M54 52v12M66 52v12" />
    </svg>
  );
}
