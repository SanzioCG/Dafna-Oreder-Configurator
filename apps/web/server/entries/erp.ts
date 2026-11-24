/**
 * Vercel Function entry: POST /api/erp (D-30: Dafna's 1C for the manager page; env
 * EMAN_1C_TOKEN; D-38: staff signed in). Bundled by scripts/build-api.mjs into api/erp.js.
 */
import { blobPutter, blobTokenFrom } from '../blob';
import { authOfEnv } from '../config';
import { erpFromEnv, handleErp } from '../erp1c';
import { RateLimiter } from '../rateLimit';

/** 60 requests per IP per 10 minutes */
const limiter = new RateLimiter(60, 10 * 60 * 1000);

export async function POST(request: Request): Promise<Response> {
  return handleErp(request, {
    erp: erpFromEnv(process.env),
    auth: authOfEnv(process.env),
    limiter,
    // D-34: a picture taken from eman.uz goes into the decor photo store
    putPicture: blobPutter(blobTokenFrom(process.env)),
  });
}
