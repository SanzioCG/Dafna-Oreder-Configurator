/**
 * Vercel Function entry: POST /api/submit. Bundled by scripts/build-api.mjs into api/submit.js
 * (self-contained, engine included) — edit this source, never the bundle.
 */
import { missingEnv, submitDepsFromEnv } from '../config';
import { handleSubmit, type SubmitDeps } from '../submit';

let deps: SubmitDeps | null = null;

const misconfigured = () =>
  new Response(JSON.stringify({ error: { code: 'server_misconfigured' } }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });

export async function POST(request: Request): Promise<Response> {
  const missing = missingEnv(process.env);
  if (missing.length > 0) {
    console.error(JSON.stringify({ event: 'env_missing', missing }));
    return misconfigured();
  }
  // module scope survives between invocations of a warm instance (token cache, rate limits)
  deps ??= submitDepsFromEnv(process.env);
  return handleSubmit(request, deps);
}

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ error: { code: 'method_not_allowed' } }), {
    status: 405,
    headers: { 'content-type': 'application/json', allow: 'POST' },
  });
}
