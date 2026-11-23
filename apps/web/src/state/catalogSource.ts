import { applyCatalogExtension, type CatalogExtension } from '@dafna/engine';
import { useEffect, useState } from 'react';

/**
 * D-20: materials and hardware the manager added (GET /api/catalog, no prices) become options of
 * the kiosk at start. Until they arrive (or if the server is unreachable) the built-in catalog
 * is offered. Tests run without it.
 */
export const CATALOG_URL = '/api/catalog';

export async function loadCatalog(
  fetchImpl: typeof fetch = fetch,
): Promise<CatalogExtension | null> {
  try {
    const res = await fetchImpl(CATALOG_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const ext = (await res.json()) as Partial<CatalogExtension>;
    if (!Array.isArray(ext.materials) || !Array.isArray(ext.hardware)) return null;
    // D-21: decor photos come with it
    const textures = ext.textures && typeof ext.textures === 'object' ? ext.textures : {};
    return { materials: ext.materials, hardware: ext.hardware, textures };
  } catch {
    return null;
  }
}

/** Loads the extension once; returns a revision that changes when it is applied (re-render). */
export function useCatalogExtension(): number {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    let alive = true;
    void loadCatalog().then((ext) => {
      const empty =
        !ext ||
        (ext.materials.length === 0 &&
          ext.hardware.length === 0 &&
          Object.keys(ext.textures ?? {}).length === 0);
      if (!alive || empty) return;
      applyCatalogExtension(ext);
      setRev((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, []);
  return rev;
}
