// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs build script without type declarations
import { API_ENTRIES, bundleEntry } from '../scripts/build-api.mjs';

const root = join(__dirname, '..');

describe('committed Vercel Function bundles (api/*.js)', () => {
  for (const name of API_ENTRIES as string[]) {
    it(`api/${name}.js is up to date with server/ (run: pnpm --filter @dafna/web build:api)`, async () => {
      const committed = readFileSync(join(root, 'api', `${name}.js`), 'utf8').replace(
        /\r\n/g,
        '\n',
      );
      expect(committed === (await bundleEntry(name))).toBe(true);
    }, 30_000);
  }

  it('no secret values or env defaults are baked into the bundles', () => {
    for (const name of API_ENTRIES as string[]) {
      const text = readFileSync(join(root, 'api', `${name}.js`), 'utf8');
      expect(text).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
      expect(text).not.toMatch(/\b\d{8,10}:[A-Za-z0-9_-]{35}\b/); // Telegram bot token shape
      expect(text).toContain('process.env');
    }
  });
});
