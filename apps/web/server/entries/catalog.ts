/**
 * Vercel Function entry: GET /api/catalog (D-20: materials and hardware added on the manager
 * page, for the kiosk; no prices). Bundled by scripts/build-api.mjs into api/catalog.js.
 */
import { handleCatalog } from '../catalog';
import { catalogFromEnv } from '../config';

export async function GET(request: Request): Promise<Response> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_SHEET_ID) {
    return new Response(JSON.stringify({ materials: [], hardware: [] }), {
      headers: { 'content-type': 'application/json' },
    });
  }
  try {
    return await handleCatalog(request, catalogFromEnv(process.env).catalog);
  } catch (e) {
    console.error(JSON.stringify({ event: 'catalog_failed', message: (e as Error).message }));
    return new Response(JSON.stringify({ error: { code: 'unavailable' } }), { status: 503 });
  }
}
