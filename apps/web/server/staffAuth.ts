import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SheetTab, type PriceSheetConfig } from './priceSheet';
import type { RateLimiter } from './rateLimit';

/**
 * D-38: staff sign-in. Customers use the site without any account; Dafna's staff (admin,
 * manager) sign in with a login and a password on /manager. Replaces the shared PINs
 * (MANAGER_PIN, STAFF_PIN).
 *
 * - Accounts live in the Google Sheet tab "Xodimlar" (login, name, role, password hash, active,
 *   e-mail); the admin adds / blocks them on the manager page. Passwords are stored only as
 *   scrypt hashes.
 * - The built-in account "admin" signs in with the Vercel env var ADMIN_PASSWORD (it always
 *   works, so the admin can never be locked out by the sheet).
 * - A session is a signed cookie (HMAC, key derived from the service-account key - no extra env
 *   var), HttpOnly, 12 hours. It carries a fingerprint of the password hash: a changed password or
 *   a blocked account ends every open session at once.
 * - D-39: a password the admin gives (a new account, "Yangi parol") is TEMPORARY: the person must
 *   set their own before anything else. Staff change their own password; a forgotten one is reset
 *   by an e-mailed one-time link (30 minutes; it dies with the first new password).
 *
 *   GET  /api/auth                                         -> {user} | 401
 *   POST /api/auth {action: 'login', login, password}      -> {user} + cookie
 *   POST /api/auth {action: 'logout'}                      -> cookie cleared
 *   POST /api/auth {action: 'changePassword', old, password}           (signed in)
 *   POST /api/auth {action: 'forgot', email}               -> {ok} (always, if mail is set up)
 *   POST /api/auth {action: 'reset', token, password}      -> {ok}
 *   POST /api/auth {action: 'staff'}                       -> {staff} (admin)
 *   POST /api/auth {action: 'addStaff', login, name, role, password, email?}        (admin)
 *   POST /api/auth {action: 'updateStaff', login, name?, role?, active?, password?, email?} (admin)
 */
export type Role = 'admin' | 'manager';
export const ROLES: Role[] = ['admin', 'manager'];

export interface StaffUser {
  login: string;
  name: string;
  role: Role;
  /** D-39: signed in with a temporary password - must set their own first */
  mustChange?: boolean;
}

export interface StaffAccount {
  login: string;
  name: string;
  role: Role;
  /** scrypt hash ("s1$salt$hash"); never leaves the server */
  hash: string;
  active: boolean;
  updatedAt: string;
  /** D-39: for "Parolni unutdim" ('' = none) */
  email: string;
  /** D-39: the password was given by the admin */
  mustChange: boolean;
}

export const ADMIN_LOGIN = 'admin';
export const LOGIN_RE = /^[a-z0-9._-]{3,32}$/;
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
export const MIN_PASSWORD = 8;
export const SESSION_COOKIE = 'dafna_staff';
export const SESSION_MS = 12 * 3600_000;
export const RESET_MS = 30 * 60_000;

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

/** a short fingerprint of the password hash: a new password ends the old sessions and links */
const fingerprint = (s: string) => createHash('sha256').update(s).digest('base64url').slice(0, 12);

const okPassword = (p: unknown): p is string =>
  typeof p === 'string' && p.length >= MIN_PASSWORD && p.length <= 200;

/* ---------- signed tokens: the session cookie and the reset link ---------- */

interface Token {
  l: string;
  v: string;
  e: number;
  /** 'reset' = an e-mailed reset link (never a session) */
  p?: 'reset';
}

export function signSession(s: Token, secret: string): string {
  const body = Buffer.from(JSON.stringify(s)).toString('base64url');
  return `${body}.${b64(createHmac('sha256', secret).update(body).digest())}`;
}

export function readSession(
  token: string,
  secret: string,
  now: number,
  purpose?: 'reset',
): Token | null {
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as Token;
    if (typeof s.l !== 'string' || typeof s.v !== 'string' || typeof s.e !== 'number') return null;
    if (s.p !== purpose) return null;
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
const HEADER = [
  'login',
  'ism',
  'rol',
  'parol (xesh)',
  'faol',
  "o'zgargan",
  'email',
  'vaqtinchalik parol',
];

export function staffToRows(list: StaffAccount[]): string[][] {
  return [
    HEADER,
    ...list.map((a) => [
      a.login,
      a.name,
      a.role,
      a.hash,
      a.active ? 'ha' : "yo'q",
      a.updatedAt,
      a.email,
      a.mustChange ? 'ha' : "yo'q",
    ]),
  ];
}

export function rowsToStaff(rows: unknown[][]): StaffAccount[] {
  const out: StaffAccount[] = [];
  for (const r of rows.slice(1)) {
    const [login, name, role, hash, active, updatedAt, email, mustChange] = r.map((c) =>
      String(c ?? '').trim(),
    );
    if (!login || !LOGIN_RE.test(login) || !hash) continue;
    if (!ROLES.includes(role as Role)) continue;
    out.push({
      login,
      name: name || login,
      role: role as Role,
      hash,
      active: active !== "yo'q",
      updatedAt: updatedAt ?? '',
      email: email && EMAIL_RE.test(email) ? email.toLowerCase() : '',
      mustChange: mustChange === 'ha',
    });
  }
  return out;
}

export class GoogleSheetsStaffStore implements StaffStore {
  private readonly tab: SheetTab;
  constructor(config: PriceSheetConfig) {
    // D-46: the password hashes (column D) are hidden from people
    this.tab = new SheetTab(config, STAFF_TAB, {
      widths: [120, 180, 90, 120, 70, 140, 220, 140],
      hidden: [3],
    });
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

/* ---------- e-mail (D-39) ---------- */

export type Mailer = (mail: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) => Promise<boolean>;

/** Resend (resend.com): RESEND_API_KEY + MAIL_FROM ("Dafna <noreply@your-domain>") */
export function resendMailer(
  apiKey: string,
  from: string,
  fetchImpl: typeof fetch = fetch,
): Mailer {
  return async (mail) => {
    try {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, ...mail }),
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function resetMail(name: string, link: string) {
  const text =
    `Assalomu alaykum, ${name}!\n\n` +
    `Dafna boshqaruv paneli uchun parolni tiklash so'raldi. Yangi parol qo'yish uchun havolani ` +
    `oching (30 daqiqa amal qiladi, bir marta ishlaydi):\n\n${link}\n\n` +
    `Agar buni siz so'ramagan bo'lsangiz, xatga e'tibor bermang - parolingiz o'zgarmaydi.`;
  const html =
    `<p>Assalomu alaykum, ${escapeHtml(name)}!</p>` +
    `<p>Dafna boshqaruv paneli uchun parolni tiklash so'raldi. Yangi parol qo'yish uchun ` +
    `tugmani bosing (30 daqiqa amal qiladi, bir marta ishlaydi):</p>` +
    `<p><a href="${escapeHtml(link)}">Yangi parol qo'yish</a></p>` +
    `<p>Agar buni siz so'ramagan bo'lsangiz, xatga e'tibor bermang — parolingiz o'zgarmaydi.</p>`;
  return { subject: 'Dafna — parolni tiklash', text, html };
}

/* ---------- the handler ---------- */

export interface AuthDeps {
  /** HMAC key of the session cookie */
  secret: string;
  /** ADMIN_PASSWORD: the built-in "admin" account (unset = no built-in admin) */
  adminPassword: string | undefined;
  staff: CachedStaff;
  /** sign-in / reset attempts per client IP */
  limiter: RateLimiter;
  now: () => number;
  /** the cookie's Secure flag (off only on the plain-http dev server) */
  secure: boolean;
  /** "2026-11-24 15:05" */
  stamp: () => string;
  /** D-39: sends the reset e-mail; undefined = mail not set up ("ask the admin") */
  mailer?: Mailer;
  /** D-39: the site's address for the reset link (SITE_URL; default: the request's own) */
  siteUrl?: string;
  /** D-39: errors worth a look (never a secret) */
  log?: (event: string, detail?: Record<string, unknown>) => void;
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
const publicOf = (a: StaffAccount): StaffUser => ({
  login: a.login,
  name: a.name,
  role: a.role,
  ...(a.mustChange ? { mustChange: true } : {}),
});

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

/**
 * D-39: the staff member the price / catalogue endpoints accept: signed in AND past the
 * temporary password (until then only "set your own password" works).
 */
export async function workingUser(req: Request, deps: AuthDeps): Promise<StaffUser | null> {
  const u = await sessionUser(req, deps);
  return u && !u.mustChange ? u : null;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const emailOf = (v: unknown): string | null => {
  const e = text(v, 254).toLowerCase();
  if (e === '') return '';
  return EMAIL_RE.test(e) ? e : null;
};

/** a session cookie for an account (the fingerprint of its current password) */
const sessionFor = (deps: AuthDeps, login: string, v: string) =>
  cookie(
    signSession({ l: login, v, e: deps.now() + SESSION_MS }, deps.secret),
    SESSION_MS / 1000,
    deps.secure,
  );

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
    if (login === ADMIN_LOGIN) {
      const ok =
        deps.adminPassword &&
        password.length > 0 &&
        timingSafeEqual(
          createHash('sha256').update(password).digest(),
          createHash('sha256').update(deps.adminPassword).digest(),
        );
      if (!ok) return json(401, { error: { code: 'wrong_login' } });
      return json(
        200,
        { user: adminUser },
        sessionFor(deps, ADMIN_LOGIN, fingerprint(`admin|${deps.adminPassword}`)),
      );
    }
    const a = (await deps.staff.get()).find((x) => x.login === login);
    if (!a || !a.active || !verifyPassword(password, a.hash))
      return json(401, { error: { code: 'wrong_login' } });
    return json(200, { user: publicOf(a) }, sessionFor(deps, a.login, fingerprint(a.hash)));
  }

  // D-39: "Parolni unutdim" - the same answer whether the e-mail is known or not
  if (body.action === 'forgot') {
    if (!deps.mailer) return json(503, { error: { code: 'mail_not_configured' } });
    if (!deps.limiter.take(clientIp(req))) return json(429, { error: { code: 'rate_limited' } });
    const email = emailOf(body.email);
    if (!email) return json(400, { error: { code: 'invalid_email' } });
    const a = (await deps.staff.get()).find((x) => x.active && x.email === email);
    if (a) {
      const token = signSession(
        { l: a.login, v: fingerprint(a.hash), e: deps.now() + RESET_MS, p: 'reset' },
        deps.secret,
      );
      const site = (deps.siteUrl || new URL(req.url).origin).replace(/\/+$/, '');
      const link = `${site}/manager?reset=${encodeURIComponent(token)}`;
      const sent = await deps.mailer({ to: a.email, ...resetMail(a.name, link) });
      if (!sent) deps.log?.('reset_mail_failed', { login: a.login });
    }
    return json(200, { ok: true });
  }

  // D-39: a new password from the e-mailed link (the link dies with it: the fingerprint changes)
  if (body.action === 'reset') {
    if (!deps.limiter.take(clientIp(req))) return json(429, { error: { code: 'rate_limited' } });
    const s = readSession(text(body.token, 1000), deps.secret, deps.now(), 'reset');
    const list = await deps.staff.get();
    const i = s ? list.findIndex((x) => x.login === s.l) : -1;
    const a = list[i];
    if (!s || !a || !a.active || fingerprint(a.hash) !== s.v)
      return json(400, { error: { code: 'invalid_link' } });
    if (!okPassword(body.password)) return json(400, { error: { code: 'weak_password' } });
    const next = {
      ...a,
      hash: hashPassword(body.password),
      mustChange: false,
      updatedAt: deps.stamp(),
    };
    await deps.staff.save(list.map((x, k) => (k === i ? next : x)));
    return json(200, { ok: true });
  }

  const me = await sessionUser(req, deps);
  if (!me) return json(401, { error: { code: 'unauthorized' } });

  // D-39: one's own password (also the way out of a temporary one); stays signed in
  if (body.action === 'changePassword') {
    if (me.login === ADMIN_LOGIN) return json(400, { error: { code: 'admin_in_vercel' } });
    const list = await deps.staff.get();
    const i = list.findIndex((x) => x.login === me.login);
    const a = list[i]!;
    if (!verifyPassword(typeof body.old === 'string' ? body.old.slice(0, 200) : '', a.hash))
      return json(401, { error: { code: 'wrong_old_password' } });
    if (!okPassword(body.password)) return json(400, { error: { code: 'weak_password' } });
    if (verifyPassword(body.password, a.hash))
      return json(400, { error: { code: 'same_password' } });
    const next = {
      ...a,
      hash: hashPassword(body.password),
      mustChange: false,
      updatedAt: deps.stamp(),
    };
    await deps.staff.save(list.map((x, k) => (k === i ? next : x)));
    return json(
      200,
      { user: publicOf(next) },
      sessionFor(deps, next.login, fingerprint(next.hash)),
    );
  }

  // staff management: the admin only
  if (me.role !== 'admin' || me.mustChange) return json(403, { error: { code: 'forbidden' } });
  const list = await deps.staff.get();
  const listOut = (l: StaffAccount[]) =>
    l.map((a) => ({
      login: a.login,
      name: a.name,
      role: a.role,
      active: a.active,
      updatedAt: a.updatedAt,
      email: a.email,
      mustChange: a.mustChange,
    }));

  if (body.action === 'staff') return json(200, { staff: listOut(list) });

  if (body.action === 'addStaff') {
    const login = text(body.login, 40).toLowerCase();
    const name = text(body.name, 60);
    const role = body.role as Role;
    const email = emailOf(body.email);
    if (!LOGIN_RE.test(login) || login === ADMIN_LOGIN)
      return json(400, { error: { code: 'invalid_login' } });
    if (list.some((a) => a.login === login)) return json(409, { error: { code: 'login_taken' } });
    if (!name) return json(400, { error: { code: 'invalid_name' } });
    if (!ROLES.includes(role)) return json(400, { error: { code: 'invalid_role' } });
    if (email === null) return json(400, { error: { code: 'invalid_email' } });
    if (email && list.some((a) => a.email === email))
      return json(409, { error: { code: 'email_taken' } });
    if (!okPassword(body.password)) return json(400, { error: { code: 'weak_password' } });
    const next = [
      ...list,
      {
        login,
        name,
        role,
        hash: hashPassword(body.password),
        active: true,
        updatedAt: deps.stamp(),
        email,
        // D-39: the admin's password is temporary
        mustChange: true,
      },
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
    if (body.email !== undefined) {
      const email = emailOf(body.email);
      if (email === null) return json(400, { error: { code: 'invalid_email' } });
      if (email && list.some((x) => x.login !== login && x.email === email))
        return json(409, { error: { code: 'email_taken' } });
      a.email = email;
    }
    if (body.active !== undefined) a.active = body.active === true;
    if (body.password !== undefined) {
      if (!okPassword(body.password)) return json(400, { error: { code: 'weak_password' } });
      a.hash = hashPassword(body.password);
      // D-39: the admin's password is temporary
      a.mustChange = true;
    }
    a.updatedAt = deps.stamp();
    const next = list.map((x, k) => (k === i ? a : x));
    await deps.staff.save(next);
    return json(200, { staff: listOut(next) });
  }

  return json(400, { error: { code: 'invalid_request' } });
}
