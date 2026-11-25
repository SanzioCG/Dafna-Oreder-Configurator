import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18n';
import { CloseIcon } from './icons';
import { MechPhoto, type MechKind } from './MechPhoto';

export interface HardwareChoice {
  /** param option value (brand key) */
  value: string;
  /** brand name, never translated (group heading) */
  brand: string;
  /** model line under the brand */
  model: string;
  hint: string;
  softClose: boolean;
}

/**
 * D-23: the large hardware menu. A full-size sheet over the kiosk with every model of the
 * mechanism grouped by brand (brand chips filter the list), each with a big picture, its model,
 * a one-line hint and a soft-close mark. Picking a model selects it and closes the sheet.
 * Closes with the X button, the backdrop or Escape; nothing changes until a model is picked.
 * D-49: on a phone it is a bottom sheet (a handle, rounded top, one model per row).
 */
export function HardwarePicker({
  kind,
  title,
  choices,
  value,
  onPick,
  onClose,
}: {
  kind: MechKind | undefined;
  title: string;
  choices: HardwareChoice[];
  value: string;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [brand, setBrand] = useState<string | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // brands in first-seen order, each with its models
  const groups = useMemo(() => {
    const out = new Map<string, HardwareChoice[]>();
    for (const c of choices) out.set(c.brand, [...(out.get(c.brand) ?? []), c]);
    return [...out.entries()];
  }, [choices]);
  const shown = brand ? groups.filter(([b]) => b === brand) : groups;

  return (
    <div
      className="modal-backdrop hw-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="hw-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hw-sheet-title"
        data-testid="hw-sheet"
      >
        <header className="hw-sheet-head">
          <h2 id="hw-sheet-title">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            className="btn btn-secondary hw-sheet-close"
            aria-label={t('hw.close')}
            onClick={onClose}
          >
            <CloseIcon />
            {/* D-49: on a phone the sheet closes with a "Yopish" pill (Figma "5b Mexanizm tanlash") */}
            <span className="hw-close-label" aria-hidden="true">
              {t('hw.close')}
            </span>
          </button>
        </header>
        {groups.length > 1 && (
          <div className="hw-brands" role="group" aria-label={t('hw.brands')}>
            {[null, ...groups.map(([b]) => b)].map((b) => (
              <button
                key={b ?? '*'}
                type="button"
                className={b === brand ? 'hw-chip active' : 'hw-chip'}
                aria-pressed={b === brand}
                onClick={() => setBrand(b)}
              >
                {b ?? t('hw.all')}
                <span className="hw-chip-count">
                  {b ? groups.find(([g]) => g === b)![1].length : choices.length}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="hw-sheet-body" role="radiogroup" aria-label={title}>
          {shown.map(([b, models]) => (
            <section key={b} className="hw-brand">
              <h3 className="hw-brand-name">{b}</h3>
              <div className="hw-grid">
                {models.map((c) => {
                  const selected = c.value === value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${c.brand} ${c.model}`}
                      data-option={c.value}
                      className={selected ? 'hw-model active' : 'hw-model'}
                      onClick={() => onPick(c.value)}
                    >
                      {kind && <MechPhoto kind={kind} brand={c.value} alt={c.model} />}
                      <span className="hw-model-name">{c.model}</span>
                      <span className="hw-model-hint">{c.hint}</span>
                      <span className="hw-model-tags">
                        {c.softClose && <span className="tag">{t('hw.softCloseTag')}</span>}
                        {selected && <span className="tag tag-on">{t('hw.selected')}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
