/**
 * Vercel Function entry: GET /api/assembly?id=…&t=… (D-12, the customer's assembly instructions
 * PDF behind the QR code). Bundled by scripts/build-api.mjs into api/assembly.js.
 */
import { handleAssembly } from '../assemblyLink';
import { applyCatalogFromEnv, linkSecretFromEnv, missingEnv, storeFromEnv } from '../config';

export async function GET(request: Request): Promise<Response> {
  if (missingEnv(process.env).length > 0) return new Response('misconfigured', { status: 503 });
  await applyCatalogFromEnv(process.env);
  return handleAssembly(request, {
    store: storeFromEnv(process.env),
    secret: linkSecretFromEnv(process.env),
    log: (event, detail) => console.error(JSON.stringify({ event, ...detail })),
  });
}
