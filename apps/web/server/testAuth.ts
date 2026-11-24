import type { AuthOf } from './prices';

/**
 * Tests only (D-38): a stand-in for the session cookie - a request carrying one of `keys` in
 * the x-test-staff header counts as a signed-in manager. The real sign-in is tested in
 * staffAuth.test.ts.
 */
export const headerAuth =
  (...keys: string[]): AuthOf =>
  async (req) => {
    const k = req.headers.get('x-test-staff');
    return k && keys.includes(k) ? { login: 'test', name: 'Test', role: 'manager' } : null;
  };
