/**
 * Vercel Function entry: POST /api/staff-pin (D-13, the consultant PIN; env STAFF_PIN).
 * Bundled by scripts/build-api.mjs into api/staff-pin.js.
 */
import { RateLimiter } from '../rateLimit';
import { handleStaffPin } from '../staffPin';

/** 5 attempts per IP per 10 minutes (per warm instance) */
const limiter = new RateLimiter(5, 10 * 60 * 1000);

export async function POST(request: Request): Promise<Response> {
  return handleStaffPin(request, { pin: process.env.STAFF_PIN, limiter });
}
