import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleAssembly } from './assemblyLink';
import { FakeNotifier, MemoryLeadStore } from './memory';
import { CachedCatalog, MemoryCatalogStore, handleCatalog } from './catalog';
import { erpFromEnv, handleErp } from './erp1c';
import {
  CachedPrices,
  MemoryPriceStore,
  handleManager,
  handleQuote,
  tashkentMinute,
} from './prices';
import { RateLimiter } from './rateLimit';
import { CachedStaff, MemoryStaffStore, handleAuth, workingUser, type AuthDeps } from './staffAuth';
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
 * D-38 `vite dev`: staff sign-in on an in-memory staff list; the built-in "admin" signs in with
 * DEV_ADMIN_PASSWORD (default "admin"; dev only - production reads ADMIN_PASSWORD).
 */
const devAuth: AuthDeps = {
  secret: 'dev-staff-session',
  adminPassword: process.env.DEV_ADMIN_PASSWORD ?? 'admin',
  staff: new CachedStaff(new MemoryStaffStore(), 0),
  limiter: new RateLimiter(100, 60_000),
  now: Date.now,
  // the dev server is plain http
  secure: false,
  stamp: () => tashkentMinute(new Date()),
  // D-39: no e-mail service in dev - the reset link is printed to the dev server's console
  mailer: async (mail) => {
    console.warn('[dev api] mail to', mail.to, mail.text);
    return true;
  },
};
const devAuthOf = (req: Request) => workingUser(req, devAuth);

export function createDevAuthHandler() {
  return adapt((r) => handleAuth(r, devAuth), '/api/auth');
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

/**
 * D-19 `vite dev`: /api/quote and /api/manager on one in-memory price store (the DEMO list until
 * the manager saves). D-38: the manager page needs a dev staff sign-in (devAuth). Dev staff mode
 * needs no sign-in, so the quote always carries the breakdown.
 */
const devPrices = (() => {
  const store = new MemoryPriceStore();
  return { store, prices: new CachedPrices(store, 0) };
})();
/** D-20: the catalog extension, in memory (dev) */
const devCatalog = (() => {
  const store = new MemoryCatalogStore();
  return { catalogStore: store, catalog: new CachedCatalog(store, 0) };
})();

export function createDevCatalogHandler() {
  return adapt((r) => handleCatalog(r, devCatalog.catalog), '/api/catalog');
}

function adapt(handler: (request: Request) => Promise<Response>, path: string) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const request = new Request(`http://localhost${path}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method === 'POST' || req.method === 'PUT' ? Buffer.concat(chunks) : undefined,
      });
      void handler(request).then(async (response) => {
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await response.text());
      });
    });
  };
}

export function createDevQuoteHandler() {
  return adapt(
    (r) =>
      handleQuote(r, {
        prices: devPrices.prices,
        breakdownWithoutPin: true,
        catalog: devCatalog.catalog,
      }),
    '/api/quote',
  );
}

/** D-30 `vite dev`: /api/erp for a signed-in dev staff member; 1C only when EMAN_1C_TOKEN is set */
export function createDevErpHandler() {
  const limiter = new RateLimiter(100, 60_000);
  return adapt(
    (r) =>
      handleErp(r, {
        erp: erpFromEnv(process.env),
        auth: devAuthOf,
        limiter,
        // D-34: no photo store in dev: pictures as data URLs
        dataUrls: true,
      }),
    '/api/erp',
  );
}

export function createDevManagerHandler() {
  const limiter = new RateLimiter(100, 60_000);
  return adapt(
    (r) =>
      handleManager(r, {
        ...devPrices,
        ...devCatalog,
        auth: devAuthOf,
        // D-21: decor photos as data URLs (dev only, never stored in a sheet)
        allowDataUrls: true,
        putTexture: async (_name, body, type) =>
          `data:${type};base64,${Buffer.from(body).toString('base64')}`,
        limiter,
        now: () => new Date(),
      }),
    '/api/manager',
  );
}
