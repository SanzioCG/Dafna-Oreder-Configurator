/**
 * Vercel Function entry: GET / PUT /api/manager (D-19: the manager's price list; D-38: staff
 * signed in). Bundled by scripts/build-api.mjs into api/manager.js.
 */
import { blobPutter, blobTokenFrom } from '../blob';
import { authOfEnv, catalogFromEnv, pricesFromEnv } from '../config';
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
    // 30 requests per IP per 10 minutes
    deps = {
      store,
      prices,
      auth: authOfEnv(process.env),
      limiter: new RateLimiter(30, 10 * 60 * 1000),
      now: () => new Date(),
      catalogStore: catalogFromEnv(process.env).store,
      catalog: catalogFromEnv(process.env).catalog,
      putTexture: blobPutter(blobTokenFrom(process.env)),
    };
  }
  return handleManager(request, deps);
}

export const GET = handle;
export const PUT = handle;
export const POST = handle;
