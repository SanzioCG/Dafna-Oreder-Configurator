/**
 * D-38: client of /api/auth - staff sign-in (admin, manager) and the staff list. Customers never
 * sign in. The session is an HttpOnly cookie set by the server: the page never sees it, and every
 * same-origin request (/api/manager, /api/erp, /api/quote) carries it by itself.
 */
export const AUTH_URL = '/api/auth';

export type Role = 'admin' | 'manager';
export interface StaffUser {
  login: string;
  name: string;
  role: Role;
}
export interface StaffRow extends StaffUser {
  active: boolean;
  updatedAt: string;
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

export const listStaff = (fetchImpl?: typeof fetch) =>
  call({ method: 'POST', body: { action: 'staff' } }, staffOf, fetchImpl);

export const addStaff = (
  a: { login: string; name: string; role: Role; password: string },
  fetchImpl?: typeof fetch,
) => call({ method: 'POST', body: { action: 'addStaff', ...a } }, staffOf, fetchImpl);

export const updateStaff = (
  a: { login: string; name?: string; role?: Role; active?: boolean; password?: string },
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
  server_misconfigured: 'Server sozlanmagan (Vercel: GOOGLE_* va ADMIN_PASSWORD)',
  network: "Server bilan aloqa yo'q. Qayta urinib ko'ring",
};
export const authError = (code: string) => AUTH_ERRORS[code] ?? AUTH_ERRORS.network!;
