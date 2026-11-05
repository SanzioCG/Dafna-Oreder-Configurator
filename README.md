# Dafna Configurator

Self-service furniture configurator for Dafna (EMAN) showroom touchscreen kiosks.
Product context, batch plan and glossary: [docs/PROJECT.md](docs/PROJECT.md).

## Requirements

- Node.js >= 20 (developed on 24.20.0)
- pnpm 12 (pinned via `packageManager`). Enable with `corepack enable`; if Program Files is not
  writable: `corepack enable --install-directory "$env:APPDATA\npm" pnpm` and make sure
  `%APPDATA%\npm` is on `PATH`.

## Install

```powershell
pnpm install
```

## Run

```powershell
pnpm dev
```

Vite serves on http://localhost:5173

- Customer mode (default): http://localhost:5173/ or http://localhost:5173/?mode=customer
- Staff mode: http://localhost:5173/?mode=staff — all parameters, all issues, unconfirmed
  markers, order-draft JSON download.

## Test / quality gate

```powershell
pnpm test        # vitest (engine + web)
pnpm lint        # eslint + prettier --check
pnpm typecheck   # tsc --noEmit in every package
pnpm build       # engine tsc build + web vite build
pnpm format      # prettier --write

# Full gate (lint + typecheck + test + build), non-zero exit on any failure:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1 -Quiet
```

## Layout

| Path              | What                                                           |
| ----------------- | -------------------------------------------------------------- |
| `packages/engine` | Pure TypeScript product engine (templates, generate, validate) |
| `apps/web`        | React + Vite + Three.js kiosk UI                               |
| `docs/`           | Product context, glossary, ADRs                                |
| `scripts/`        | `check.ps1` quality gate                                       |
