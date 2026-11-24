import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SheetTab, type PriceSheetConfig } from './priceSheet';
import type { RateLimiter } from './rateLimit';

/**
 * D-38: staff sign-in. Customers use the site without any account; Dafna's staff (admin,
 * manager) sign in with a login and a password on /manager. Replaces the shared PINs
 * (MANAGER_PIN, STAFF_PIN).
 *
 * - Accounts live in the Google Sheet tab "Xodimlar" (login, name, role, password hash, active);
 *   the admin adds / blocks them on the manager page. Passwords are stored only as scrypt hashes.
 * - The built-in account "admin" signs in with the Vercel env var ADMIN_PASSWORD (it always
 *   works, so the admin can never be locked out by the sheet).
 * - A session is a signed cookie (HMAC, key derived from the service-account key - no extra env
 *   var), HttpOnly, 12 hours. It carries a fingerprint of the password hash: a changed password or
 *   a blocked account ends every open session at once.
 *
 *   GET  /api/auth                                         -> {user} | 401
 *   POST /api/auth {action: 'login', login, password}      -> {user} + cookie
 *   POST /api/auth {action: 'logout'}                      -> cookie cleared
 *   POST /api/auth {action: 'staff'}                       -> {staff} (admin)
 *   POST /api/auth {action: 'addStaff', login, name, role, password}        (admin)
 *   POST /api/auth {action: 'updateStaff', login, name?, role?, active?, password?} (admin)
 */
export type Role = 'admin' | 'manager';
export const ROLES: Role[] = ['admin', 'manager'];

export interface StaffUser {
  login: string;
  name: string;
  role: Role;
}

export interface StaffAccount extends StaffUser {
  /** scrypt hash ("s1$salt$hash"); never leaves the server */
  hash: string;
  active: boolean;
  updatedAt: string;
}

export const ADMIN_LOGIN = 'admin';
export const LOGIN_RE = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD = 8;
export const SESSION_COOKIE = 'dafna_staff';
export const SESSION_MS = 12 * 3600_000;

/* ---------- passwords ---------- */

const SCRYPT = { N: 16384, r: 8, p: 1 };
const b64 = (b: Buffer) => b.toString('base64url');

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, SCRYPT);
  return `s1$${b64(salt)}$${b64(hash)}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [v, salt, hash] = stored.split('$');
  if (v !== 's1' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  const got = scryptSync(password, Buffer.from(salt, 'base64url'), want.length, SCRYPT);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** a short fingerprint of the password hash: a new password ends the old sessions */
const fingerprint = (s: string) => createHash('sha256').update(s).digest('base64url').slice(0, 12);

/* ---------- the session cookie ---------- */

interface Session {
  l: string;
  v: string;
  e: number;
}

export function signSession(s: Session, secret: string): string {
  const body = Buffer.from(JSON.stringify(s)).toString('base64url');
  return `${body}.${b64(createHmac('sha256', secret).update(body).digest())}`;
}

export function readSession(token: string, secret: string, now: number): Session | null {
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session;
    if (typeof s.l !== 'string' || typeof s.v !== 'string' || typeof s.e !== 'number') return null;
    return s.e > now ? s : null;
  } catch {
    return null;
  }
}

function cookieOf(req: Request, name: string): string | null {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** the session key from the service-account key (production) */
export function sessionSecretFrom(privateKey: string): string {
  return createHash('sha256').update(`dafna-staff-session|${privateKey}`).digest('hex');
}

/* ---------- accounts ---------- */

export interface StaffStore {
  load(): Promise<StaffAccount[]>;
  save(list: StaffAccount[]): Promise<void>;
}

export class MemoryStaffStore implements StaffStore {
  saved: StaffAccount[] = [];
  async load() {
    return this.saved;
  }
  async save(list: StaffAccount[]) {
    this.saved = list;
  }
}

export const STAFF_TAB = 'Xodimlar';
const HEADER = ['login', 'ism', 'rol', 'parol (xesh)', 'faol', "o'zgargan"];

export function staffToRows(list: StaffAccount[]): string[][] {
  return [
    HEADER,
    ...list.map((a) => [a.login, a.name, a.role, a.hash, a.active ? 'ha' : "yo'q", a.updatedAt]),
  ];
}

export function rowsToStaff(rows: unknown[][]): StaffAccount[] {
  const out: StaffAccount[] = [];
  for (const r of rows.slice(1)) {
    const [login, name, role, hash, active, updatedAt] = r.map((c) => String(c ?? '').trim());
    if (!login || !LOGIN_RE.test(login) || !hash) continue;
    if (!ROLES.includes(role as Role)) continue;
    out.push({
      login,
      name: name || login,
      role: role as Role,
      hash,
      active: active !== "yo'q",
      updatedAt: updatedAt ?? '',
    });
  }
  return out;
}

export class GoogleSheetsStaffStore implements StaffStore {
  private readonly tab: SheetTab;
  constructor(config: PriceSheetConfig) {
    this.tab = new SheetTab(config, STAFF_TAB);
  }
  async load() {
    return rowsToStaff(await this.tab.read());
  }
  async save(list: StaffAccount[]) {
    await this.tab.write(staffToRows(list));
  }
}

/** the accounts, read at most once per `ttlMs` per warm instance */
export class CachedStaff {
  private cached: { list: StaffAccount[]; at: number } | null = null;
  constructor(
    readonly store: StaffStore,
    private readonly ttlMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {}
  async get(): Promise<StaffAccount[]> {
    const t = this.now();
    if (!this.cached || t - this.cached.at >= this.ttlMs)
      this.cached = { list: await this.store.load(), at: t };
    return this.cached.list;
  }
  async save(list: StaffAccount[]) {
    await this.store.save(list);
    this.cached = { list, at: this.now() };
  }
}

/* ---------- the handler ---------- */

export interface AuthDeps {
  /** HMAC key of the session cookie */
  secret: string;
  /** ADMIN_PASSWORD: the built-in "admin" account (unset = no built-in admin) */
  adminPassword: string | undefined;
  staff: CachedStaff;
  /** sign-in attempts per client IP */
  limiter: RateLimiter;
  now: () => number;
  /** the cookie's Secure flag (off only on the plain-http dev server) */
  secure: boolean;
  /** "2026-11-24 15:05" */
  stamp: () => string;
}

const json = (status: number, body: unknown, cookie?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(cookie ? { 'set-cookie': cookie } : {}),
    },
  });

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip'))?.trim() || 'unknown';
}

const cookie = (value: string, maxAgeSec: number, secure: boolean) =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;

const adminUser: StaffUser = { login: ADMIN_LOGIN, name: 'Admin', role: 'admin' };
const publicOf = (a: StaffAccount): StaffUser => ({ login: a.login, name: a.name, role: a.role });

/** The signed-in staff member of a request, or null (customers). */
export async function sessionUser(req: Request, deps: AuthDeps): Promise<StaffUser | null> {
  const token = cookieOf(req, SESSION_COOKIE);
  if (!token) return null;
  const s = readSession(token, deps.secret, deps.now());
  if (!s) return null;
  if (s.l === ADMIN_LOGIN)
    return deps.adminPassword && s.v === fingerprint(`admin|${deps.adminPassword}`)
      ? adminUser
      : null;
  const a = (await deps.staff.get()).find((x) => x.login === s.l);
  return a && a.active && fingerprint(a.hash) === s.v ? publicOf(a) : null;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function handleAuth(req: Request, deps: AuthDeps): Promise<Response> {
  if (req.method === 'GET') {
    const user = await sessionUser(req, deps);
    return user ? json(200, { user }) : json(401, { error: { code: 'unauthorized' } });
  }
  if (req.method !== 'POST') return json(405, { error: { code: 'method_not_allowed' } });
  let body: Record<string, unknown>;
  try {
    const t = await req.text();
    if (t.length > 4000) return json(413, { error: { code: 'too_large' } });
    body = JSON.parse(t) as Record<string, unknown>;
  } catch {
    return json(400, { error: { code: 'invalid_request' } });
  }

  if (body.action === 'logout') return json(200, { ok: true }, cookie('', 0, deps.secure));

  if (body.action === 'login') {
    if (!deps.limiter.take(clientIp(req))) return json(429, { error: { code: 'rate_limited' } });
    const login = text(body.login, 40).toLowerCase();
    const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
    let user: StaffUser | null = null;
    let v = '';
    if (login === ADMIN_LOGIN) {
      if (
        deps.adminPassword &&
        password.length > 0 &&
        timingSafeEqual(
          createHash('sha256').update(password).digest(),
          createHash('sha256').update(deps.adminPassword).digest(),
        )
      ) {
        user = adminUser;
        v = fingerprint(`admin|${deps.adminPassword}`);
      }
    } else {
      const a = (await deps.staff.get()).find((x) => x.login === login);
      if (a && a.active && verifyPassword(password, a.hash)) {
        user = publicOf(a);
        v = fingerprint(a.hash);
      }
    }
    if (!user) return json(401, { error: { code: 'wrong_login' } });
    const token = signSession({ l: user.login, v, e: deps.now() + SESSION_MS }, deps.secret);
    return json(200, { user }, cookie(token, SESSION_MS / 1000, deps.secure));
  }

  // staff management: the admin only
  const me = await sessionUser(req, deps);
  if (!me) return json(401, { error: { code: 'unauthorized' } });
  if (me.role !== 'admin') return json(403, { error: { code: 'forbidden' } });
  const list = await deps.staff.get();
  const listOut = (l: StaffAccount[]) =>
    l.map((a) => ({ ...publicOf(a), active: a.active, updatedAt: a.updatedAt }));

  if (body.action === 'staff') return json(200, { staff: listOut(list) });

  if (body.action === 'addStaff') {
    const login = text(body.login, 40).toLowerCase();
    const name = text(body.name, 60);
    const role = body.role as Role;
    const password = typeof body.password === 'string' ? body.password : '';
    if (!LOGIN_RE.test(login) || login === ADMIN_LOGIN)
      return json(400, { error: { code: 'invalid_login' } });
    if (list.some((a) => a.login === login)) return json(409, { error: { code: 'login_taken' } });
    if (!name) return json(400, { error: { code: 'invalid_name' } });
    if (!ROLES.includes(role)) return json(400, { error: { code: 'invalid_role' } });
    if (password.length < MIN_PASSWORD || password.length > 200)
      return json(400, { error: { code: 'weak_password' } });
    const next = [
      ...list,
      { login, name, role, hash: hashPassword(password), active: true, updatedAt: deps.stamp() },
    ];
    await deps.staff.save(next);
    return json(200, { staff: listOut(next) });
  }

  if (body.action === 'updateStaff') {
    const login = text(body.login, 40).toLowerCase();
    const i = list.findIndex((a) => a.login === login);
    if (i < 0) return json(404, { error: { code: 'not_found' } });
    const a = { ...list[i]! };
    if (body.name !== undefined) {
      const name = text(body.name, 60);
      if (!name) return json(400, { error: { code: 'invalid_name' } });
      a.name = name;
    }
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role as Role)) return json(400, { error: { code: 'invalid_role' } });
      a.role = body.role as Role;
    }
    if (body.active !== undefined) a.active = body.active === true;
    if (body.password !== undefined) {
      const p = typeof body.password === 'string' ? body.password : '';
      if (p.length < MIN_PASSWORD || p.length > 200)
        return json(400, { error: { code: 'weak_password' } });
      a.hash = hashPassword(p);
    }
    a.updatedAt = deps.stamp();
    const next = list.map((x, k) => (k === i ? a : x));
    await deps.staff.save(next);
    return json(200, { staff: listOut(next) });
  }

  return json(400, { error: { code: 'invalid_request' } });
}
