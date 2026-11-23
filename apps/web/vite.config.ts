import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * `vite dev` only: POST /api/submit served by server/devApi.ts (in-memory store). Loaded through
 * Vite's SSR loader so the config itself never imports server or engine TypeScript (plain Node
 * cannot load the workspace engine sources). Production uses the Vercel Function (api/).
 */
function devSubmitApi(): Plugin {
  return {
    name: 'dafna-dev-submit-api',
    apply: 'serve',
    configureServer(server) {
      let handler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;
      server.middlewares.use('/api/submit', (req, res, next) => {
        const run = async () => {
          if (!handler) {
            const mod = await server.ssrLoadModule('/server/devApi.ts');
            handler = (mod as typeof import('./server/devApi')).createDevSubmitHandler();
          }
          handler(req, res);
        };
        run().catch(next);
      });
      // D-13: the consultant PIN (DEV_STAFF_PIN, default 0000)
      let staffPin: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;
      server.middlewares.use('/api/staff-pin', (req, res, next) => {
        const run = async () => {
          if (!staffPin) {
            const mod = await server.ssrLoadModule('/server/devApi.ts');
            staffPin = (mod as typeof import('./server/devApi')).createDevStaffPinHandler();
          }
          staffPin(req, res);
        };
        run().catch(next);
      });
      // D-19: the server-side price and the manager's price list (in-memory store)
      for (const [path, factory] of [
        ['/api/quote', 'createDevQuoteHandler'],
        ['/api/manager', 'createDevManagerHandler'],
      ] as const) {
        let h: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;
        server.middlewares.use(path, (req, res, next) => {
          const run = async () => {
            if (!h) {
              const mod = (await server.ssrLoadModule(
                '/server/devApi.ts',
              )) as typeof import('./server/devApi');
              h = mod[factory]();
            }
            h(req, res);
          };
          run().catch(next);
        });
      }
      // D-12: the assembly instructions PDF (same in-memory store as /api/submit)
      let assembly: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;
      server.middlewares.use('/api/assembly', (req, res, next) => {
        const run = async () => {
          if (!assembly) {
            const mod = await server.ssrLoadModule('/server/devApi.ts');
            assembly = (mod as typeof import('./server/devApi')).createDevAssemblyHandler();
          }
          assembly(req, res);
        };
        run().catch(next);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devSubmitApi()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    // three.js + drei are large; a single chunk is fine for a kiosk served from the LAN.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'jsdom',
    // CSS is not processed in tests, except the files read as ?raw by the design-system tests
    // (contrast.test / lines.test: token files; outline.test: styles.css)
    css: { include: [/theme[/\\](tokens|themes)\.css/, /src[/\\]styles\.css/] },
  },
});
