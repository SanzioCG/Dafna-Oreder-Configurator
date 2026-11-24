import {
  EMPTY_EXTENSION,
  PRODUCT_TEMPLATES,
  allMaterials,
  applyCatalogExtension,
  type CatalogExtension,
  type MaterialUsage,
} from '@dafna/engine';

const PARAM_USAGE: Record<string, MaterialUsage> = {
  corpusMaterial: 'corpus',
  doorMaterial: 'door',
  topMaterial: 'top',
};

/**
 * Tests only (D-37): the kiosk offers only the boards the manager added. The UI tests of the
 * colour step run against the built-in decors, so each built-in board is "added" for exactly
 * the parameters whose built-in options already hold it (nothing new appears anywhere).
 */
export function offerBuiltInBoards(): void {
  const usage = new Map<string, Set<MaterialUsage>>();
  for (const t of Object.values(PRODUCT_TEMPLATES))
    for (const def of t.parameters) {
      const u = PARAM_USAGE[def.key];
      if (!u) continue;
      for (const o of def.options ?? []) {
        const s = usage.get(String(o)) ?? new Set<MaterialUsage>();
        s.add(u);
        usage.set(String(o), s);
      }
    }
  const materials = allMaterials.materials
    .filter((m) => (m.kind === 'ldsp' || m.kind === 'mdf') && usage.has(m.id))
    .map((m) => ({
      id: m.id,
      kind: m.kind as 'ldsp' | 'mdf',
      name: m.decorName,
      thicknessMm: m.thicknessMm,
      colorHex: m.colorHex,
      group: m.group,
      usage: [...usage.get(m.id)!],
      visible: true,
    }));
  applyCatalogExtension({ ...EMPTY_EXTENSION, materials } as CatalogExtension);
}

export const clearBoards = () => applyCatalogExtension(EMPTY_EXTENSION);
