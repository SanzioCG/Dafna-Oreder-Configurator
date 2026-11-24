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
  workingUser,
  type AuthDeps,
  type Mailer,
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
          email: '',
          mustChange: true,
        },
      ],
    });
    // the sheet row holds a hash, never the password
    expect(JSON.stringify(staffToRows(store.saved))).not.toContain('aziz-pass-1');
    const aziz = (await signIn(deps, 'aziz', 'aziz-pass-1'))!;
    // D-39: the admin's password is temporary
    expect(await sessionUser(get(aziz), deps)).toEqual({
      login: 'aziz',
      name: 'Aziz',
      role: 'manager',
      mustChange: true,
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
        email: 'aziz@dafna.uz',
        mustChange: true,
      },
    ];
    const rows = staffToRows(list);
    expect(rowsToStaff(rows)).toEqual(list);
    expect(
      rowsToStaff([rows[0]!, ['BAD LOGIN', 'x', 'manager', 'h'], ['z1', 'x', 'boss', 'h']]),
    ).toEqual([]);
  });
});

describe('D-39 own passwords: temporary ones, changing, e-mail reset', () => {
  /** an admin session and a manager "aziz" added with a temporary password and an e-mail */
  async function withAziz(mailer?: Mailer) {
    const ctx = setup();
    const deps = { ...ctx.deps, mailer, siteUrl: 'https://dafna.uz/' };
    const admin = (await signIn(deps, 'admin', 'very-secret-admin'))!;
    await handleAuth(
      post(
        {
          action: 'addStaff',
          login: 'aziz',
          name: 'Aziz',
          role: 'manager',
          password: 'temp-pass-1',
          email: 'Aziz@Dafna.uz',
        },
        admin,
      ),
      deps,
    );
    return { ...ctx, deps, admin };
  }
  const change = (deps: AuthDeps, cookie: string, old: string, password: string) =>
    handleAuth(post({ action: 'changePassword', old, password }, cookie), deps);

  it("a temporary password signs in, but only to set one's own; then everything works", async () => {
    const { deps } = await withAziz();
    const temp = (await signIn(deps, 'aziz', 'temp-pass-1'))!;
    expect(await workingUser(get(temp), deps)).toBeNull();
    expect((await change(deps, temp, 'wrong-old-1', 'my-own-pass')).status).toBe(401);
    expect((await change(deps, temp, 'temp-pass-1', 'short')).status).toBe(400);
    expect((await change(deps, temp, 'temp-pass-1', 'temp-pass-1')).status).toBe(400);
    const r = await change(deps, temp, 'temp-pass-1', 'my-own-pass');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ user: { login: 'aziz', name: 'Aziz', role: 'manager' } });
    // stays signed in with the new cookie; the old one is dead
    const fresh = r.headers.get('set-cookie')!.split(';')[0]!;
    expect((await workingUser(get(fresh), deps))?.login).toBe('aziz');
    expect(await sessionUser(get(temp), deps)).toBeNull();
    expect(await signIn(deps, 'aziz', 'temp-pass-1')).toBeNull();
  });

  it("a new password from the admin is temporary again; the admin's own lives in Vercel", async () => {
    const { deps, admin } = await withAziz();
    await handleAuth(
      post({ action: 'updateStaff', login: 'aziz', password: 'another-temp' }, admin),
      deps,
    );
    const c = (await signIn(deps, 'aziz', 'another-temp'))!;
    expect((await sessionUser(get(c), deps))?.mustChange).toBe(true);
    expect((await change(deps, admin, 'very-secret-admin', 'whatever-1')).status).toBe(400);
  });

  it('"Parolni unutdim": a one-time link by e-mail, 30 minutes, dies with the new password', async () => {
    const sent: { to: string; text: string }[] = [];
    const mailer: Mailer = async (m) => {
      sent.push(m);
      return true;
    };
    const { deps, tick } = await withAziz(mailer);
    const forgot = (email: string) => handleAuth(post({ action: 'forgot', email }), deps);
    // the same answer for an unknown e-mail (nobody learns who is on the list)
    expect((await forgot('nobody@dafna.uz')).status).toBe(200);
    expect(sent).toEqual([]);
    expect((await forgot(' AZIZ@dafna.uz ')).status).toBe(200);
    expect(sent.map((m) => m.to)).toEqual(['aziz@dafna.uz']);
    const link = /https:\/\/dafna\.uz\/manager\?reset=(\S+)/.exec(sent[0]!.text)!;
    const token = decodeURIComponent(link[1]!);
    const reset = (password: string, t = token) =>
      handleAuth(post({ action: 'reset', token: t, password }), deps);
    // a reset link is never a session
    expect(await sessionUser(get(`dafna_staff=${token}`), deps)).toBeNull();
    expect((await reset('short')).status).toBe(400);
    expect((await reset('reset-pass-1', token.slice(0, -2) + 'xx')).status).toBe(400);
    expect((await reset('reset-pass-1')).status).toBe(200);
    expect((await reset('reset-pass-2')).status).toBe(400); // used up
    const c = (await signIn(deps, 'aziz', 'reset-pass-1'))!;
    expect((await workingUser(get(c), deps))?.login).toBe('aziz'); // not temporary
    // an old link expires after 30 minutes
    await forgot('aziz@dafna.uz');
    const late = decodeURIComponent(/reset=(\S+)/.exec(sent[1]!.text)![1]!);
    tick(30 * 60_000 + 1);
    expect((await reset('reset-pass-3', late)).status).toBe(400);
  });

  it('no mail service -> "ask the admin"; e-mails are checked and unique', async () => {
    const { deps, admin } = await withAziz();
    const r = await handleAuth(post({ action: 'forgot', email: 'aziz@dafna.uz' }), deps);
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe(
      'mail_not_configured',
    );
    const add = (email: string) =>
      handleAuth(
        post(
          {
            action: 'addStaff',
            login: 'bek',
            name: 'Bek',
            role: 'manager',
            password: 'temp-pass-2',
            email,
          },
          admin,
        ),
        deps,
      );
    expect((await add('not-an-email')).status).toBe(400);
    expect((await add('aziz@dafna.uz')).status).toBe(409);
    expect((await add('')).status).toBe(200); // the e-mail is optional
  });
});
