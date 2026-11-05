import type { ReactNode } from 'react';
import { useI18n } from '../i18n/I18n';
import { ChevronIcon } from './icons';

/**
 * "Xodim sozlamalari" (staff only, D-4): a collapsible card in every step with the template's
 * engineering parameters of that step (section count, door preset per section, hinge
 * overrides, back panel, plinth height / recess, board thickness …), the issues list and the
 * order draft JSON. Collapsed by default; the open state is kept while switching steps.
 */
export function StaffSettings({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section className="card staff-card" data-testid="staff-settings">
      <button
        type="button"
        className="btn btn-text disclosure staff-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        <ChevronIcon className={open ? 'icon chevron open' : 'icon chevron'} />
        {t('staff.settings')}
      </button>
      {open && <div className="staff-body">{children}</div>}
    </section>
  );
}
