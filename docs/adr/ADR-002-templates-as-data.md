# ADR-002: Product templates as data + generator code

- Status: accepted
- Date: 2026-11-05

## Context

Dafna will have several product categories (shkaf, tumba, stol) and will keep adjusting ranges,
defaults and construction values as production confirms them. Many values are currently
assumptions and must stay visible as such.

## Decision

A product is described by a **versioned JSON template** (e.g.
`packages/engine/templates/wardrobe.v0.json`) plus a **generator function** in code.

The template holds:

- parameter definitions (`key`, `type`, `default`, `min`/`max`/`step`, `options`, `unit`,
  `labelKey`, `uiStep`, `customerVisible`, `unconfirmed`, `note`);
- named construction constants (e.g. max shelf span, back panel thickness) with the same
  `unconfirmed` / `note` metadata;
- construction rules in prose, each flagged `unconfirmed` when it is an assumption.

The generator (code) turns resolved parameters into panels and sections. It reads every number
from the template or the parameters — e.g. no hard-coded panel thickness.

## Why

- Ranges, defaults and confirmations change without touching geometry code.
- The UI is generated from parameter definitions (`uiStep` + `customerVisible`), so adding a
  parameter does not need new UI code.
- `templateVersion` is stored in each order draft, so an order can always be re-generated with the
  exact template it was configured with.
- Assumptions are machine-readable: staff mode and docs list every `unconfirmed` value.

## Consequences

- Construction logic that cannot be expressed as data stays in the generator, versioned together
  with the template (`generator` field).
- Breaking template changes get a new file (`wardrobe.v1.json`); old ones stay in the repo as a
  record. Update (D-1a): only the current generator is kept in code, so old order drafts are
  **migrated** to the current schema/template (`migrateOrderDraft`, ADR-004) instead of being
  generated with the old template.
