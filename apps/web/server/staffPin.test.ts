// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rateLimit';
import { handleStaffPin } from './staffPin';

const post = (pin: unknown, ip = '1.1.1.1') =>
  new Request('http://x/api/staff-pin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ pin }),
  });

describe('D-13 consultant PIN (server side)', () => {
  it('right PIN 200, wrong PIN 401, malformed PIN 401', async () => {
    const deps = { pin: '2468', limiter: new RateLimiter(100, 60_000) };
    expect((await handleStaffPin(post('2468'), deps)).status).toBe(200);
    expect((await handleStaffPin(post('2469'), deps)).status).toBe(401);
    expect((await handleStaffPin(post('24'), deps)).status).toBe(401);
    expect((await handleStaffPin(post(2468), deps)).status).toBe(401);
  });

  it('no STAFF_PIN configured: 503, never "any PIN works"', async () => {
    const limiter = new RateLimiter(100, 60_000);
    const res = await handleStaffPin(post('0000'), { pin: undefined, limiter });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('not_configured');
    expect((await handleStaffPin(post('abc'), { pin: 'abc', limiter })).status).toBe(503);
  });

  it('attempts are limited per IP', async () => {
    const deps = { pin: '2468', limiter: new RateLimiter(5, 60_000) };
    for (let i = 0; i < 5; i++) expect((await handleStaffPin(post('1111'), deps)).status).toBe(401);
    expect((await handleStaffPin(post('2468'), deps)).status).toBe(429);
    expect((await handleStaffPin(post('2468', '2.2.2.2'), deps)).status).toBe(200);
  });
});
