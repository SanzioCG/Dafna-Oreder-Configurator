/**
 * Vercel Function entry: GET / POST /api/orders (D-47: the applications of the Google Sheet for
 * the manager page's "Buyurtmalar"). Bundled by scripts/build-api.mjs into api/orders.js.
 */
import { authOfEnv, linkSecretFromEnv, peopleOfEnv, storeFromEnv } from '../config';
import { handleOrders, type OrdersDeps } from '../orders';

let deps: OrdersDeps | null = null;

function handle(request: Request): Promise<Response> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_SHEET_ID) {
    return Promise.resolve(
      new Response(JSON.stringify({ error: { code: 'server_misconfigured' } }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }
  deps ??= {
    store: storeFromEnv(process.env),
    auth: authOfEnv(process.env),
    linkSecret: linkSecretFromEnv(process.env),
    people: peopleOfEnv(process.env),
    sheetUrl: `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`,
  };
  return handleOrders(request, deps);
}

export const GET = handle;
export const POST = handle;
