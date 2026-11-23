import { useI18n } from '../i18n/I18n';

/**
 * D-27: "Eshik turi" as two picture cards, so a customer sees the difference without the words
 * nakladnoy / vkladnoy. Each picture: the wardrobe from the front (doors blue, carcass edges
 * white) and, under it, the same wardrobe seen from above (where the doors sit).
 */
export function DoorMountPicker({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mount-grid" role="radiogroup" aria-label={t('param.doorMount')}>
      {options.map((o) => {
        const selected = o === value;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={selected}
            data-mount={o}
            className={selected ? 'mount-card active' : 'mount-card'}
            onClick={() => onChange(o)}
          >
            <DoorMountIcon mount={o} />
            <span className="mount-card-name">{t(`c.opt.doorMount.${o}`)}</span>
            <span className="mount-card-hint">{t(`c.hint.doorMount.${o}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Front view (top) and plan view (bottom) of a two-door wardrobe; decorative. */
export function DoorMountIcon({ mount }: { mount: string }) {
  const inset = mount === 'inset';
  const line = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 120 120" className="mount-icon" aria-hidden="true">
      {/* front view: carcass */}
      <rect x="22" y="6" width="76" height="78" rx="1.5" className="mount-carcass" {...line} />
      {inset ? (
        <>
          {/* doors inside the carcass: its edges stay visible all round */}
          <rect x="29" y="13" width="30" height="64" className="mount-door" {...line} />
          <rect x="61" y="13" width="30" height="64" className="mount-door" {...line} />
        </>
      ) : (
        <>
          {/* doors over the carcass: they hide its edges */}
          <rect x="22" y="6" width="37" height="78" className="mount-door" {...line} />
          <rect x="61" y="6" width="37" height="78" className="mount-door" {...line} />
        </>
      )}
      {/* plan view: sides and the door line */}
      <rect x="22" y="96" width="6" height="18" className="mount-carcass" {...line} />
      <rect x="92" y="96" width="6" height="18" className="mount-carcass" {...line} />
      {inset ? (
        <rect x="29" y="96" width="62" height="4" className="mount-door" {...line} />
      ) : (
        <rect x="22" y="91" width="76" height="4" className="mount-door" {...line} />
      )}
    </svg>
  );
}
