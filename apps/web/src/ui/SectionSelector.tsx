import { useI18n } from '../i18n/I18n';
import { SelectionGrid } from './SelectionGrid';

/**
 * SectionSelector: "1-bo'lim, 2-bo'lim …" (the same selection is also made by tapping a section
 * in the 3D view). Selecting a section frames it with the smart camera.
 */
export function SectionSelector({
  count,
  selected,
  onSelect,
}: {
  count: number;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const { t } = useI18n();
  return (
    <SelectionGrid
      options={Array.from({ length: count }, (_, i) => i)}
      value={selected}
      onChange={onSelect}
      label={(i) => t('interior.section', { n: i + 1 })}
      ariaLabel={t('interior.sections')}
    />
  );
}
