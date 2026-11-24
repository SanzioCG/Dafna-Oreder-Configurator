import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rateLimit';
import {
  CachedStaff,
  MemoryStaffStore,
  SESSION_COOKIE,
  SESSION_MS,
  handleAuth,
  hashPassword,
  rowsToStaff,
  sessionUser,
  staffToRows,
  verifyPassword,
  type AuthDeps,
} from './staffAuth';

/** D-38: staff sign-in (customers need no account) */
function setup(adminPassword: string | undefined = 'very-secret-admin') {
  let t = Date.parse('2026-11-24T10:00:00Z');
  const store = new MemoryStaffStore();
  const deps: AuthDeps = {
    secret: 'test-secret',
    adminPassword,
    staff: new CachedStaff(store, 0),
    limiter: new RateLimiter(100, 60_000),
    now: () => t,
    secure: true,
    stamp: () => '2026-11-24 15:00',
  };
  return { deps, store, tick: (ms: number) => (t += ms) };
}

const post = (body: unknown, cookie?: string) =>
  new Request('https://x/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const get = (cookie?: string) =>
  new Request('https://x/api/auth', { headers: cookie ? { cookie } : {} });

/** signs in, returns the session cookie ("name=value") or null */
async function signIn(deps: AuthDeps, login: string, password: string) {
  const r = await handleAuth(post({ action: 'login', login, password }), deps);
  const c = r.headers.get('set-cookie');
  return r.status === 200 && c ? c.split(';')[0]! : null;
}

describe('D-38 staff sign-in', () => {
  it('passwords are stored as scrypt hashes only', () => {
    const h = hashPassword('correct horse');
    expect(h.startsWith('s1$')).toBe(true);
    expect(h).not.toContain('correct horse');
    expect(verifyPassword('correct horse', h)).toBe(true);
    expect(verifyPassword('wrong horse', h)).toBe(false);
    expect(hashPassword('correct horse')).not.toBe(h); // salted
  });

  it('the built-in admin signs in with ADMIN_PASSWORD; an HttpOnly Secure cookie, 12 hours', async () => {
    const { deps } = setup();
    const r = await handleAuth(
      post({ action: 'login', login: 'Admin', password: 'very-secret-admin' }),
      deps,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ user: { login: 'admin', name: 'Admin', role: 'admin' } });
    const c = r.headers.get('set-cookie')!;
    expect(c).toContain(`${SESSION_COOKIE}=`);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain(`Max-Age=${SESSION_MS / 1000}`);
    const me = await handleAuth(get(c.split(';')[0]), deps);
    expect(((await me.json()) as { user: { role: string } }).user.role).toBe('admin');
  });

  it('wrong password / unknown login / no ADMIN_PASSWORD -> 401; no cookie -> customer', async () => {
    const { deps } = setup();
    expect(await signIn(deps, 'admin', 'nope')).toBeNull();
    expect(await signIn(deps, 'ghost', 'very-secret-admin')).toBeNull();
    expect(await signIn(setup(undefined).deps, 'admin', '')).toBeNull();
    expect((await handleAuth(get(), deps)).status).toBe(401);
    expect(await sessionUser(get(), deps)).toBeNull();
  });

  it('a forged or expired cookie is refused; a changed ADMIN_PASSWORD ends the session', async () => {
    const { deps, tick } = setup();
    const c = (await signIn(deps, 'admin', 'very-secret-admin'))!;
    const [name, value] = c.split('=');
    const [body] = value!.split('.');
    expect(await sessionUser(get(`${name}=${body}.AAAA`), deps)).toBeNull();
    expect(await sessionUser(get(c), { ...deps, secret: 'other' })).toBeNull();
    expect(await sessionUser(get(c), { ...deps, adminPassword: 'rotated-password' })).toBeNull();
    tick(SESSION_MS + 1);
    expect(await sessionUser(get(c), deps)).toBeNull();
  });

  it('the admin adds a manager; the manager signs in, cannot manage staff; blocking ends it', async () => {
    const { deps, store } = setup();
    const admin = (await signIn(deps, 'admin', 'very-secret-admin'))!;
    const add = await handleAuth(
      post(
        {
          action: 'addStaff',
          login: 'aziz',
          name: 'Aziz',
          role: 'manager',
          password: 'aziz-pass-1',
        },
        admin,
      ),
      deps,
    );
    expect(add.status).toBe(200);
    expect(await add.json()).toEqual({
      staff: [
        {
          login: 'aziz',
          name: 'Aziz',
          role: 'manager',
          active: true,
          updatedAt: '2026-11-24 15:00',
        },
      ],
    });
    // the sheet row holds a hash, never the password
    expect(JSON.stringify(staffToRows(store.saved))).not.toContain('aziz-pass-1');
    const aziz = (await signIn(deps, 'aziz', 'aziz-pass-1'))!;
    expect(await sessionUser(get(aziz), deps)).toEqual({
      login: 'aziz',
      name: 'Aziz',
      role: 'manager',
    });
    expect((await handleAuth(post({ action: 'staff' }, aziz), deps)).status).toBe(403);
    // blocked: the open session ends, a new sign-in fails
    await handleAuth(post({ action: 'updateStaff', login: 'aziz', active: false }, admin), deps);
    expect(await sessionUser(get(aziz), deps)).toBeNull();
    expect(await signIn(deps, 'aziz', 'aziz-pass-1')).toBeNull();
  });

  it('a new password ends the old sessions; bad input is refused', async () => {
    const { deps } = setup();
    const admin = (await signIn(deps, 'admin', 'very-secret-admin'))!;
    const add = (b: Record<string, unknown>) =>
      handleAuth(post({ action: 'addStaff', role: 'manager', name: 'X', ...b }, admin), deps);
    expect((await add({ login: 'admin', password: 'long-enough' })).status).toBe(400);
    expect((await add({ login: 'a b', password: 'long-enough' })).status).toBe(400);
    expect((await add({ login: 'oki', password: 'short' })).status).toBe(400);
    expect((await add({ login: 'oki', password: 'long-enough', role: 'boss' })).status).toBe(400);
    expect((await add({ login: 'oki', password: 'long-enough' })).status).toBe(200);
    expect((await add({ login: 'oki', password: 'long-enough' })).status).toBe(409);
    const ok = (await signIn(deps, 'oki', 'long-enough'))!;
    await handleAuth(
      post({ action: 'updateStaff', login: 'oki', password: 'brand-new-pass' }, admin),
      deps,
    );
    expect(await sessionUser(get(ok), deps)).toBeNull();
    expect(await signIn(deps, 'oki', 'brand-new-pass')).not.toBeNull();
  });

  it('sign-in attempts are rate limited; logout clears the cookie', async () => {
    const { deps } = setup();
    const limited = { ...deps, limiter: new RateLimiter(2, 60_000) };
    await signIn(limited, 'admin', 'x');
    await signIn(limited, 'admin', 'x');
    const r = await handleAuth(post({ action: 'login', login: 'admin', password: 'x' }), limited);
    expect(r.status).toBe(429);
    const out = await handleAuth(post({ action: 'logout' }), deps);
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('the "Xodimlar" tab round-trips; broken rows are skipped', () => {
    const list = [
      {
        login: 'aziz',
        name: 'Aziz',
        role: 'manager' as const,
        hash: 's1$a$b',
        active: false,
        updatedAt: '2026-11-24 15:00',
      },
    ];
    const rows = staffToRows(list);
    expect(rowsToStaff(rows)).toEqual(list);
    expect(
      rowsToStaff([rows[0]!, ['BAD LOGIN', 'x', 'manager', 'h'], ['z1', 'x', 'boss', 'h']]),
    ).toEqual([]);
  });
});
