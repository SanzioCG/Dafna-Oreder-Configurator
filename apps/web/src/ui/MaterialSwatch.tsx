import { getMaterial, SAME_AS_CORPUS, type ParamValue } from '@dafna/engine';
import { useI18n } from '../i18n/I18n';
import type { Mode } from '../mode';
import { CATALOG } from '../state/useConfigurator';
import { CheckIcon } from './icons';
import { Toggle } from './Toggle';

interface MaterialSwatchProps {
  /** material ids, possibly including 'same_as_corpus' */
  options: readonly ParamValue[];
  value: ParamValue;
  /** current corpus material: shown as the effective decor while "same as corpus" is on */
  corpusValue: ParamValue;
  mode: Mode;
  label: string;
  onChange: (value: ParamValue) => void;
}

/**
 * Large colour swatches for a material parameter. If the options contain 'same_as_corpus',
 * a toggle sits above the swatches. While it is on, the door decor follows the corpus and the
 * door swatches are hidden (UX audit); turning it off shows them with the corpus decor selected.
 * Staff-only catalog entries (customerVisible=false) are hidden in customer mode.
 */
export function MaterialSwatch({
  options,
  value,
  corpusValue,
  mode,
  label,
  onChange,
}: MaterialSwatchProps) {
  const { t } = useI18n();
  const hasSame = options.includes(SAME_AS_CORPUS);
  const same = hasSame && value === SAME_AS_CORPUS;
  const effective = same ? corpusValue : value;
  const materials = options
    .filter((o) => o !== SAME_AS_CORPUS)
    .map((o) => getMaterial(CATALOG, o))
    .filter((m) => m !== undefined)
    .filter((m) => mode === 'staff' || m.customerVisible || m.id === effective);

  return (
    <div className="swatch-picker">
      {hasSame && (
        <Toggle checked={same} onChange={(on) => onChange(on ? SAME_AS_CORPUS : corpusValue)}>
          {t('color.sameAsCorpus')}
        </Toggle>
      )}
      {/* same as corpus: the door follows the corpus decor; door swatches are hidden */}
      {!same && (
        <div className="swatches" role="radiogroup" aria-label={label}>
          {materials.map((m) => {
            // selection contract: while "same as corpus" is on, the toggle carries the state and
            // no door swatch is shown as selected (opacity is reserved for "disabled")
            const selected = !same && m.id === effective;
            const name = t(m.decorName);
            const extra = mode === 'staff' ? ` ${m.thicknessMm} ${t('unit.mm')}` : '';
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${name}${extra}`}
                data-material={m.id}
                className={selected ? 'swatch selected' : 'swatch'}
                onClick={() => onChange(m.id)}
              >
                <span className="swatch-chip" style={{ background: m.colorHex }}>
                  {selected && (
                    <span className="swatch-check">
                      <CheckIcon />
                    </span>
                  )}
                </span>
                <span className="swatch-name">
                  {name}
                  {extra && <small>{extra}</small>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
