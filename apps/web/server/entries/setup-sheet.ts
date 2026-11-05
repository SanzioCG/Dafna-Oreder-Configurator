/**
 * One-off sheet setup (header row, "Holat" dropdown, hidden technical columns):
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
  .ensureSchema()
  .then((r) =>
    console.log(`sheet ready (tab created: ${r.created}, header written: ${r.headerWritten})`),
  )
  .catch((e: Error) => {
    console.error(`sheet setup failed: ${e.message}`);
    process.exit(1);
  });
