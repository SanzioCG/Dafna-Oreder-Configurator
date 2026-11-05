# ADR-011: Submission pipeline, lead lifecycle and reproducibility

- Status: accepted (D-5)
- Date: 2026-11-06

## Context

The kiosk now sends what the customer confirmed. A confirmation is an **application (lead)**,
not a production order: a sales manager calls the customer first. Only confirmed applications
will later go to the constructor / production and to Bazis / GibLab export (hardware will be
added to the configurator later). So every application must be reproducible exactly, months or
years later, by engine versions that do not exist yet.

The app is deployed on Vercel (static Vite build + Vercel Functions), auto-deployed from `main`.

## Decisions

### Lead lifecycle

`Yangi` → `Qo'ng'iroq qilindi` → `Tasdiqlandi` → `Ishlab chiqarishga berildi`, or
`Bekor qilindi`. The manager changes the status by hand in the Google Sheet (strict dropdown on
the "Holat" column). There is no status UI in the app yet. Only `Tasdiqlandi` leads feed future
production / export batches.

### Pipeline (`POST /api/submit`)

1. Cheap checks: method, per-IP rate limit, body size (3 MB), JSON, honeypot, request shape,
   per-kiosk rate limit.
2. Contact validation (shared with the kiosk: `src/lead/contact.ts`): name required, Latin /
   Cyrillic / Uzbek apostrophes; phone = 9 digits after the fixed +998; consent required.
3. **Engine re-validation**: the kiosk is never trusted. Errors, customer-blocking warnings and
   unknown params are rejected (`invalid_configuration`).
4. Idempotency: the kiosk generates one random key per application attempt and reuses it on
   "Qayta urinish". Same key → the stored ID, never a second row.
5. ID `DFN-YYMMDD-XXXX`: Asia/Tashkent date + 4 characters from an unambiguous alphabet
   (no 0/O/1/I), derived from the random key (never sequential; re-derived on a collision).
6. **Persist first** (the sheet row is the source of truth), then notify Telegram (render PNG as
   a photo, text fallback). A Telegram failure never fails the request: the row is marked
   `failed` and retried later (at most 5 attempts in total).
7. Response `{ id, status: "submitted" }` or a typed error; the kiosk times out after 15 s.

Storage and notification sit behind `LeadStore` and `Notifier` (`apps/web/server/types.ts`).
Today: Google Sheets (REST API, service-account JWT, no SDK) and the Telegram Bot API. A CRM
or a server hosted in Uzbekistan replaces them without touching the submit logic.

### Sheet layout

The columns are fixed, in this order; new columns are only ever appended at the end:

- ID, Sana (Asia/Tashkent), Holat, Ism, Familiya, Telefon, O'lcham W×H×D mm
- Korpus, Eshik, Qismlar + ichki, Eshiklar, Filial/Kiosk, Til
- Telegram holati, Menejer izohi
- params JSON, schemaVersion, templateVersion, engineVersion (VERCEL_GIT_COMMIT_SHA)
- idempotencyKey, Telegram urinishlar — technical columns, hidden

Only the compact params JSON is stored (the Sheets cell limit is 50 000 characters). The full
order draft is regenerated from params + templateVersion.

### Retry schedule

`/api/retry-telegram` re-sends failed (or stuck > 2 min pending) notifications. It is protected
by the `CRON_SECRET` bearer.

- **Vercel Hobby allows daily crons only**: a 10-minute schedule failed the deployment. The
  Vercel cron runs daily at 09:00 Tashkent.
- A 10-minute retry needs Vercel Pro or an external scheduler (for example a GitHub Actions
  schedule) that calls the same URL with the bearer.

### Reproducibility guarantee (engine)

`regenerateApplication(params, templateVersion)` is the single entry point for future
production / Bazis / GibLab export.

- **Pure and deterministic.** `generatedAt` is an input.
- **Archives.** `TEMPLATE_ARCHIVE` (0.1.0 … current) and `CATALOG_ARCHIVE` hold every released
  version.
- **Generator registry.** Generators are registered by id.
- **Freeze rule.** A generator that has produced a submitted application is never changed. A
  construction change gets a new generator id and template version; the old generator stays
  registered unchanged.
- **Fixtures enforce the rule.** `packages/engine/test/fixtures/applications/*.json` hold
  params + the stored draft, and the regenerated draft must deep-equal it. Never regenerate
  these files to make a test pass. Add a fixture for every new template version.
- **Pre-D-5 templates.** Templates 0.1.0–0.4.0 predate applications, and their generators were
  retired in earlier batches. They load and their drafts migrate (`migrateOrderDraft`), but
  regeneration returns `TEMPLATE_NOT_REGENERABLE`.

### Deployment

- The functions are bundled with esbuild into self-contained `apps/web/api/*.js` and committed.
  Vercel runs plain JS and never compiles workspace TypeScript. `server/bundle.test.ts` fails
  when a bundle is stale.
- Secrets live only in Vercel env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
  `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID`, `CRON_SECRET`. They are never in the client,
  the repo, logs or reports. Logs carry error codes only, no contact data.
- `TELEGRAM_FORCE_FAIL=1` simulates a Telegram outage outside production only.
- `vite dev` serves `/api/submit` with the real handler on an in-memory store
  (`server/devApi.ts`).

## Risks

- **Data localization.** Uzbekistan's personal-data law may require citizens' personal data to
  be stored on servers in Uzbekistan; Google Sheets and Telegram are abroad. Legal review is
  pending. The `LeadStore` / `Notifier` interfaces keep the move to a local server cheap.
- **Consent text.** The consent text is a placeholder until Dafna's lawyer provides it (TODO in
  `ContactScreen`).
- **Rate limits.** Rate limits are in memory per serverless instance: they stop bursts, not a
  distributed attack.
- **Concurrent retries.** Two truly concurrent requests with the same key could both miss the
  idempotency lookup. They produce the same ID, so a duplicate is visible. The kiosk locks the
  form while submitting, which makes this rare.
- **Public repository.** The repository is public. No secret is in it, and the bundle test
  checks the bundles for key-shaped strings.
