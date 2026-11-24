/**
 * Vercel Function entry: GET / POST /api/auth (D-38: staff sign-in and the staff list; env
 * ADMIN_PASSWORD). Bundled by scripts/build-api.mjs into api/auth.js.
 */
import { authFromEnv } from '../config';
import { handleAuth } from '../staffAuth';

function handle(request: Request): Promise<Response> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_SHEET_ID) {
    return Promise.resolve(
      new Response(JSON.stringify({ error: { code: 'server_misconfigured' } }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }
  return handleAuth(request, authFromEnv(process.env));
}

export const GET = handle;
export const POST = handle;
