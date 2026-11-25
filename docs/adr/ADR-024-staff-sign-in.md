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

## Update D-39 (2026-11-24): own passwords, temporary ones, e-mail reset

Founder: "I am the admin; I give the managers a login and a password, and take their e-mails."

- A password the admin gives (a new account, "Yangi parol") is **temporary**: the first sign-in
  shows only "set your own password"; the price / catalogue endpoints refuse the session until
  then. The admin never knows a manager's real password.
- **Parolni o'zgartirish**: staff change their own password (current + new twice); other
  sessions end, this one continues.
- **Parolni unutdim**: the staff member types the e-mail from "Xodimlar"; the server e-mails a
  one-time link (`/manager?reset=…`, 30 minutes; it dies with the first new password because it
  carries the password fingerprint). The answer is the same for unknown e-mails. A reset link is
  never accepted as a session.
- E-mail goes through **Resend** (free tier: 3000 / month, 100 / day): env `RESEND_API_KEY`,
  `MAIL_FROM` (e.g. `Dafna <noreply@your-domain>`), optional `SITE_URL` (the link's address).
  Without them "Parolni unutdim" says "ask the admin". Sending needs the domain verified in
  Resend (DNS records), so it is switched on after the domain is bought.
- The built-in `admin` changes the password only in Vercel (`ADMIN_PASSWORD`).
- "Xodimlar" tab columns: login, ism, rol, parol (xesh), faol, o'zgargan, email, vaqtinchalik parol.

## Update D-54 (2026-11-25): operators, and who has each application

Founder: "I am the admin, then the manager; the manager gives the applications to operators."

- Three roles: **admin** (everything, plus "Xodimlar"), **manager** (every application; gives
  each one to someone; the catalogue, 1C and prices as before) and **operator** (only the
  applications given to them: status and note). A new person is an operator unless the admin
  chooses otherwise (the least access).
- Each application has a **"Mas'ul"** — the login of the operator (or manager) who has it: a new
  column **AB** of "Arizalar" (appended; the grid is widened and the header written by the
  existing schema check; sheet format version 6). The admin / a manager sets it in the row of
  "Buyurtmalar" or in its drawer; only active managers and operators can be chosen; '' = nobody.
  "Menejer" (AA) keeps recording who last changed the row.
- The server enforces it: `GET /api/orders` gives an operator only the rows whose "Mas'ul" is
  their login (no sheet link, no staff list); an operator may change the status / note of those
  rows only (`not_yours`) and never "Mas'ul" (`forbidden`). `/api/manager` and `/api/erp` refuse
  an operator (403) and `/api/quote` gives an operator no cost breakdown.
- The page shows an operator only "Bosh sahifa" and "Buyurtmalar"; the price list is not loaded.
- Accounts are still added by the admin only.
