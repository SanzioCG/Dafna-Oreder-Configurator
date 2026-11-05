# ADR-001: Stack and repository structure

- Status: accepted
- Date: 2026-11-05

## Context

The configurator runs on large landscape touchscreens in showrooms. Every slider move must update
the 3D model instantly. Later batches add a backend (orders, PDF, CRM) and possibly an
offline-capable kiosk (PWA) and a website API.

## Decision

- **pnpm workspace monorepo**: `packages/*` (libraries) and `apps/*` (deployables).
- **`packages/engine`** (`@dafna/engine`) is pure TypeScript with **zero** DOM, Three.js or React
  dependencies. Enforced by `lib: ["ES2022"]` (no DOM types) in its tsconfig and by ESLint
  `no-restricted-imports` / `no-restricted-globals` rules.
- **`apps/web`**: React + TypeScript + Vite + Three.js via `@react-three/fiber` and `drei`.
- Tooling: vitest, eslint (flat config, typescript-eslint), prettier, TypeScript strict mode.
  `scripts/check.ps1` runs the full gate (lint + typecheck + test + build).
- TypeScript is pinned to 6.0.x because typescript-eslint 8 does not yet support TypeScript 7.

## Why the engine is a separate pure package

1. **Instant updates on touch** — geometry is generated in-process in the browser, no network
   round trip per change.
2. **Future offline / PWA** — the kiosk can keep configuring if the showroom network drops.
3. **Server reuse** — the backend (D-2a, D-3 PDF) will run the _same_ engine on Node to
   re-validate submitted orders and build drawings, so client and server never disagree.
4. Testability — exact-millimetre unit tests without a browser.

## Consequences

- UI-specific concerns (i18n strings, rendering, number formatting) stay in `apps/web`.
- The engine exposes plain data (panels, sections, issues) that any renderer can consume.
