import { useI18n } from '../i18n/I18n';

/**
 * D-27: "Eshik turi" as two picture cards, so a customer sees the difference without the words
 * nakladnoy / vkladnoy. Each picture is a close-up of the top front corner, as in the 3D view.
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

/**
 * A close-up of the wardrobe's top front corner (as in the 3D view, from front right above);
 * decorative. Overlay: the door stands in front and hides the carcass edges. Inset: the door
 * sits inside, flush, with the top and side edges showing round it.
 */
export function DoorMountIcon({ mount }: { mount: string }) {
  const line = {
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinejoin: 'round' as const,
  };
  if (mount === 'inset')
    return (
      <svg viewBox="24 14 84 84" className="mount-icon" aria-hidden="true">
        {/* top and side of the carcass */}
        <path d="M8 42h64l30-22H38z" className="mount-carcass" {...line} />
        <path d="M72 42l30-22v100H72z" className="mount-side" {...line} />
        {/* the carcass front edges, the opening behind the door */}
        <path d="M8 42h64v78H8z" className="mount-carcass" {...line} />
        <path d="M8 51h55v69H8z" className="mount-gap" {...line} />
        {/* the door inside the opening, flush with the edges */}
        <path d="M8 54h52v66H8z" className="mount-door" {...line} />
      </svg>
    );
  return (
    <svg viewBox="30 6 84 84" className="mount-icon" aria-hidden="true">
      {/* top and side of the carcass, behind the door */}
      <path d="M14 34h64l30-22H44z" className="mount-carcass" {...line} />
      <path d="M78 34l30-22v108H78z" className="mount-side" {...line} />
      {/* the door in front: it covers the carcass edges; its own edges show */}
      <path d="M8 40h66l6-5H14z" className="mount-door" {...line} />
      <path d="M74 40l6-5v85h-6z" className="mount-door-edge" {...line} />
      <path d="M8 40h66v80H8z" className="mount-door" {...line} />
    </svg>
  );
}
