/**
 * Vercel Function entry: GET / PUT /api/manager (D-19: the manager's price list; env
 * MANAGER_PIN). Bundled by scripts/build-api.mjs into api/manager.js.
 */
import { blobPutter } from '../blob';
import { catalogFromEnv, pricesFromEnv } from '../config';
import { handleManager, type ManagerDeps } from '../prices';
import { RateLimiter } from '../rateLimit';

let deps: ManagerDeps | null = null;

function handle(request: Request): Promise<Response> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_SHEET_ID) {
    return Promise.resolve(
      new Response(JSON.stringify({ error: { code: 'server_misconfigured' } }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }
  if (!deps) {
    const { store, prices } = pricesFromEnv(process.env);
    // 30 requests per IP per 10 minutes (wrong PINs included)
    deps = {
      store,
      prices,
      managerPin: process.env.MANAGER_PIN,
      limiter: new RateLimiter(30, 10 * 60 * 1000),
      now: () => new Date(),
      catalogStore: catalogFromEnv(process.env).store,
      catalog: catalogFromEnv(process.env).catalog,
      putTexture: blobPutter(process.env.BLOB_READ_WRITE_TOKEN),
    };
  }
  return handleManager(request, deps);
}

export const GET = handle;
export const PUT = handle;
export const POST = handle;
