# ADR-024 — Staff sign-in instead of shared PINs (D-38)

Status: accepted, 2026-11-24 (founder: "customers go straight in; staff mode separately, with a
login and a password"; roles: admin + manager; the admin adds staff on the manager page).

## Context

The configurator becomes a public website. Until now the manager page used one shared PIN
(`MANAGER_PIN`) and the kiosk's staff mode another (`STAFF_PIN`): anyone who learns a PIN is in,
and nobody can tell who changed a price.

## Decision

- **Customers never sign in.** The site stays open; nothing changes for them.
- **Staff sign in with a login and a password** — on `/manager`, and on the kiosk (a long press
  on the logo, as before) for staff mode. Roles: **admin** (everything, plus "Xodimlar") and
  **manager** (prices, 1C catalogue, materials, hardware).
- **Accounts** live in the Google Sheet tab **"Xodimlar"** (login, name, role, scrypt password
  hash, active, changed). The admin adds people, changes roles, blocks them (never deletes) and
  sets new passwords on the manager page. Passwords never leave the server and are stored only
  as salted scrypt hashes.
- **The built-in `admin`** signs in with the Vercel env var **`ADMIN_PASSWORD`**, so the admin can
  never be locked out by the sheet. Changing it ends the admin's open sessions.
- **Session:** an HMAC-signed cookie (`dafna_staff`, HttpOnly, Secure, SameSite=Lax, 12 h). The key
  is derived from the service-account key (no extra env var). The cookie carries a fingerprint of
  the password hash: a new password or a blocked account ends every open session at once.
- Sign-in attempts are rate limited per IP. Leaving staff mode on the kiosk signs out.
- `/api/staff-pin`, `STAFF_PIN` and `MANAGER_PIN` are retired; `/api/manager`, `/api/erp` and the
  price breakdown of `/api/quote` need a signed-in staff member.

## Consequences

- One new env var in Vercel: `ADMIN_PASSWORD` (a long password, set by the founder; never in the
  repo or chat). `MANAGER_PIN` / `STAFF_PIN` can be removed from Vercel.
- Who changed what can be recorded next (the session names the person).
- Still open: password reset by e-mail / SMS (today the admin sets a new one), two-factor sign-in.
