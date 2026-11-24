/**
 * Vercel Function entry: POST /api/erp (D-30: Dafna's 1C for the manager page; env
 * EMAN_1C_TOKEN, MANAGER_PIN). Bundled by scripts/build-api.mjs into api/erp.js.
 */
import { erpFromEnv, handleErp } from '../erp1c';
import { RateLimiter } from '../rateLimit';

/** 60 requests per IP per 10 minutes (wrong PINs included) */
const limiter = new RateLimiter(60, 10 * 60 * 1000);

export async function POST(request: Request): Promise<Response> {
  return handleErp(request, {
    erp: erpFromEnv(process.env),
    managerPin: process.env.MANAGER_PIN,
    limiter,
  });
}
