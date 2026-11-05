import type { IncomingMessage, ServerResponse } from 'node:http';
import { FakeNotifier, MemoryLeadStore } from './memory';
import { RateLimiter } from './rateLimit';
import { handleSubmit, type SubmitDeps } from './submit';

/**
 * `vite dev` only (loaded by vite.config.ts through server.ssrLoadModule): POST /api/submit with
 * the real handler on an in-memory store and a console "notifier", so the whole kiosk flow works
 * locally without Google / Telegram. DEV_TELEGRAM_FAIL=1 simulates a Telegram outage.
 */
export function createDevSubmitHandler() {
  const store = new MemoryLeadStore();
  const notifier = new FakeNotifier();
  notifier.failing = process.env.DEV_TELEGRAM_FAIL === '1';
  const deps: SubmitDeps = {
    store,
    notifier,
    now: () => new Date(),
    ipLimiter: new RateLimiter(100, 60_000),
    kioskLimiter: new RateLimiter(100, 60_000),
    engineVersion: 'dev',
    log: (event, detail) => console.warn('[dev api]', event, detail ?? ''),
  };
  return (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const request = new Request('http://localhost/api/submit', {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
      });
      void handleSubmit(request, deps).then(async (response) => {
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await response.text());
        const last = store.rows.at(-1);
        if (last)
          console.warn(
            '[dev api] lead',
            last.id,
            `telegram=${last.telegram}`,
            `rows=${store.rows.length}`,
          );
      });
    });
  };
}
