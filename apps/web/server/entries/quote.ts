/**
 * Vercel Function entry: POST /api/quote (D-19: the price, computed on the server; customers
 * get the final number only). Bundled by scripts/build-api.mjs into api/quote.js.
 */
import { authOfEnv, catalogFromEnv, pricesFromEnv } from '../config';
import { handleQuote, type QuoteDeps } from '../prices';

let deps: QuoteDeps | null = null;

export async function POST(request: Request): Promise<Response> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_SHEET_ID) {
    console.error(JSON.stringify({ event: 'env_missing', missing: ['GOOGLE_*'] }));
    return new Response(JSON.stringify({ error: { code: 'server_misconfigured' } }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
  // module scope survives between invocations of a warm instance (the cached price list)
  deps ??= {
    prices: pricesFromEnv(process.env).prices,
    auth: authOfEnv(process.env),
    catalog: catalogFromEnv(process.env).catalog,
  };
  return handleQuote(request, deps);
}
