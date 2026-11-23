import { useI18n } from '../i18n/I18n';

/**
 * D-27: "Eshik turi" as two picture cards, so a customer sees the difference without the words
 * nakladnoy / vkladnoy. Each picture shows the door and the side panel from above.
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
            <span className="mount-card-caption">{t('c.mount.topView')}</span>
            <span className="mount-card-name">{t(`c.opt.doorMount.${o}`)}</span>
            <span className="mount-card-hint">{t(`c.hint.doorMount.${o}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The door and the side panel seen from above (a plan detail of the right front corner);
 * decorative. Overlay: the door lies in front of the side panel's edge and hides it. Inset: the
 * door sits between the side panels, its face flush with their front edges.
 */
export function DoorMountIcon({ mount }: { mount: string }) {
  const { t } = useI18n();
  const inset = mount === 'inset';
  const line = {
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 100 72" className="mount-icon" aria-hidden="true">
      <text x="57" y="16" textAnchor="end" className="mount-label" fontSize="10">
        {t('c.mount.side')}
      </text>
      <text x="4" y="36" className="mount-label" fontSize="10">
        {t('c.mount.door')}
      </text>
      {inset ? (
        <>
          <rect x="62" y="3" width="14" height="55" className="mount-side" {...line} />
          <rect x="4" y="44" width="55" height="14" className="mount-door" {...line} />
        </>
      ) : (
        <>
          <rect x="62" y="3" width="14" height="41" className="mount-side" {...line} />
          <rect x="4" y="44" width="72" height="14" className="mount-door" {...line} />
        </>
      )}
      {/* the customer's side */}
      <path d="M40 71v-9m-4 4l4-4 4 4" fill="none" {...line} strokeWidth={2} />
    </svg>
  );
}
