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
