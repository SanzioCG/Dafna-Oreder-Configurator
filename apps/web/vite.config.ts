import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
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
