/**
 * One-off sheet setup (header row, "Holat" dropdown, the look of sheetFormat.ts):
 *   GOOGLE_SERVICE_ACCOUNT_JSON=… GOOGLE_SHEET_ID=… pnpm --filter @dafna/web setup:sheet
 * Safe to run again. The API also runs the same setup before its first append.
 */
import { missingEnv, storeFromEnv } from '../config';

const missing = missingEnv(process.env).filter((k) => k.startsWith('GOOGLE_'));
if (missing.length > 0) {
  console.error(`sheet setup: set ${missing.join(', ')} first`);
  process.exit(1);
}
storeFromEnv(process.env)
  .ensureSchema({ strict: true })
  .then((r) =>
    console.log(
      `sheet ready (tab created: ${r.created}, header written: ${r.headerWritten}, formatted: ${r.formatted})`,
    ),
  )
  .catch((e: Error) => {
    console.error(`sheet setup failed: ${e.message}`);
    process.exit(1);
  });
