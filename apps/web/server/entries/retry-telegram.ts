/**
 * Vercel Cron entry: GET /api/retry-telegram (every 10 min, vercel.json). Bundled by
 * scripts/build-api.mjs into api/retry-telegram.js — edit this source, never the bundle.
 */
import { missingEnv, notifierFromEnv, storeFromEnv } from '../config';
import { retryNotifications } from '../retry';

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('unauthorized', { status: 401 });
  }
  if (missingEnv(process.env).length > 0) return new Response('misconfigured', { status: 503 });
  try {
    const report = await retryNotifications(
      storeFromEnv(process.env),
      notifierFromEnv(process.env),
    );
    return Response.json(report);
  } catch (e) {
    console.error(JSON.stringify({ event: 'retry_failed', message: (e as Error).message }));
    return new Response('retry failed', { status: 500 });
  }
}
