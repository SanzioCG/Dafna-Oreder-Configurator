/**
 * D-38: client of /api/auth - staff sign-in (admin, manager, D-54 operator) and the staff list. Customers never
 * sign in. The session is an HttpOnly cookie set by the server: the page never sees it, and every
 * same-origin request (/api/manager, /api/erp, /api/quote) carries it by itself.
 */
export const AUTH_URL = '/api/auth';

/** D-54: admin (everything), manager (every application, the catalogue), operator (own applications) */
export type Role = 'admin' | 'manager' | 'operator';
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Menejer',
  operator: 'Operator',
};
export interface StaffUser {
  login: string;
  name: string;
  role: Role;
  /** D-39: signed in with the admin's temporary password - must set their own first */
  mustChange?: boolean;
}
export interface StaffRow {
  login: string;
  name: string;
  role: Role;
  active: boolean;
  updatedAt: string;
  email: string;
  mustChange: boolean;
}

export type AuthOutcome<T> = { ok: true; value: T } | { ok: false; code: string };

async function call<T>(
  init: { method: 'GET' | 'POST'; body?: unknown },
  pick: (d: Record<string, unknown>) => T | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthOutcome<T>> {
  try {
    const res = await fetchImpl(AUTH_URL, {
      method: init.method,
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const value = data && res.ok ? pick(data) : undefined;
    if (value !== undefined) return { ok: true, value };
    const code = (data?.error as { code?: string } | undefined)?.code;
    return { ok: false, code: code ?? 'network' };
  } catch {
    return { ok: false, code: 'network' };
  }
}

const userOf = (d: Record<string, unknown>) => d.user as StaffUser | undefined;
const staffOf = (d: Record<string, unknown>) => d.staff as StaffRow[] | undefined;

/** the signed-in staff member (401 = nobody) */
export const getMe = (fetchImpl?: typeof fetch) => call({ method: 'GET' }, userOf, fetchImpl);

export const signIn = (login: string, password: string, fetchImpl?: typeof fetch) =>
  call({ method: 'POST', body: { action: 'login', login, password } }, userOf, fetchImpl);

export const signOut = (fetchImpl?: typeof fetch) =>
  call(
    { method: 'POST', body: { action: 'logout' } },
    (d) => d.ok === true || undefined,
    fetchImpl,
  );

/** D-39: one's own new password (stays signed in) */
export const changePassword = (old: string, password: string, fetchImpl?: typeof fetch) =>
  call({ method: 'POST', body: { action: 'changePassword', old, password } }, userOf, fetchImpl);

/** D-39: "Parolni unutdim" - e-mails a one-time link (the same answer for any e-mail) */
export const forgotPassword = (email: string, fetchImpl?: typeof fetch) =>
  call(
    { method: 'POST', body: { action: 'forgot', email } },
    (d) => d.ok === true || undefined,
    fetchImpl,
  );

/** D-39: a new password from the e-mailed link */
export const resetPassword = (token: string, password: string, fetchImpl?: typeof fetch) =>
  call(
    { method: 'POST', body: { action: 'reset', token, password } },
    (d) => d.ok === true || undefined,
    fetchImpl,
  );

export const listStaff = (fetchImpl?: typeof fetch) =>
  call({ method: 'POST', body: { action: 'staff' } }, staffOf, fetchImpl);

export const addStaff = (
  a: { login: string; name: string; role: Role; password: string; email: string },
  fetchImpl?: typeof fetch,
) => call({ method: 'POST', body: { action: 'addStaff', ...a } }, staffOf, fetchImpl);

export const updateStaff = (
  a: {
    login: string;
    name?: string;
    role?: Role;
    active?: boolean;
    password?: string;
    email?: string;
  },
  fetchImpl?: typeof fetch,
) => call({ method: 'POST', body: { action: 'updateStaff', ...a } }, staffOf, fetchImpl);

/** the manager page's texts (Uzbek only) */
export const AUTH_ERRORS: Record<string, string> = {
  wrong_login: "Login yoki parol noto'g'ri",
  rate_limited: "Ko'p urinish. 10 daqiqadan so'ng qayta urinib ko'ring",
  unauthorized: 'Kirish muddati tugadi — qayta kiring',
  forbidden: 'Bu amal faqat admin uchun',
  invalid_login: "Login 3–32 ta lotin harfi, raqam yoki . _ - bo'lsin ('admin' band)",
  login_taken: 'Bu login band',
  invalid_name: 'Ismni yozing',
  invalid_role: "Rol noto'g'ri",
  weak_password: "Parol kamida 8 ta belgidan iborat bo'lsin",
  not_found: 'Xodim topilmadi',
  invalid_email: "Email noto'g'ri",
  email_taken: 'Bu email boshqa xodimda bor',
  wrong_old_password: "Hozirgi parol noto'g'ri",
  same_password: 'Yangi parol eskisidan farq qilsin',
  admin_in_vercel: "Admin paroli Vercel'da (ADMIN_PASSWORD) almashtiriladi",
  invalid_link: 'Havola eskirgan yoki ishlatilgan. «Parolni unutdim» ni qayta bosing',
  mail_not_configured: 'Pochta hali ulanmagan — yangi parolni admin beradi',
  mismatch: 'Ikki parol bir xil emas',
  server_misconfigured: 'Server sozlanmagan (Vercel: GOOGLE_* va ADMIN_PASSWORD)',
  network: "Server bilan aloqa yo'q. Qayta urinib ko'ring",
};
export const authError = (code: string) => AUTH_ERRORS[code] ?? AUTH_ERRORS.network!;
