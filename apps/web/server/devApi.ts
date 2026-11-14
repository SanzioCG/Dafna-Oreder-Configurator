import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleAssembly } from './assemblyLink';
import { FakeNotifier, MemoryLeadStore } from './memory';
import { RateLimiter } from './rateLimit';
import { handleStaffPin } from './staffPin';
import { handleSubmit, type SubmitDeps } from './submit';

/**
 * `vite dev` only (loaded by vite.config.ts through server.ssrLoadModule): POST /api/submit with
 * the real handler on an in-memory store and a console "notifier", so the whole kiosk flow works
 * locally without Google / Telegram. DEV_TELEGRAM_FAIL=1 simulates a Telegram outage.
 */
/** dev only: a fixed key (production derives it from the service-account key) */
const DEV_LINK_SECRET = 'dev-assembly-link';
let devStore: MemoryLeadStore | null = null;

/** `vite dev`: GET /api/assembly on the same in-memory store as the dev submit handler. */
export function createDevAssemblyHandler() {
  return (req: IncomingMessage, res: ServerResponse) => {
    const request = new Request(
      `http://localhost${(req as { originalUrl?: string }).originalUrl ?? req.url ?? ''}`,
    );
    void handleAssembly(request, {
      store: devStore ?? new MemoryLeadStore(),
      secret: DEV_LINK_SECRET,
    }).then(async (response) => {
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await response.arrayBuffer()));
    });
  };
}

/**
 * `vite dev`: POST /api/staff-pin against DEV_STAFF_PIN (default 0000; dev only — production
 * reads the Vercel env var STAFF_PIN).
 */
export function createDevStaffPinHandler() {
  const limiter = new RateLimiter(100, 60_000);
  const pin = process.env.DEV_STAFF_PIN ?? '0000';
  return (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const request = new Request('http://localhost/api/staff-pin', {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
      });
      void handleStaffPin(request, { pin, limiter }).then(async (response) => {
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await response.text());
      });
    });
  };
}

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
    linkSecret: DEV_LINK_SECRET,
    log: (event, detail) => console.warn('[dev api]', event, detail ?? ''),
  };
  devStore = store;
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
