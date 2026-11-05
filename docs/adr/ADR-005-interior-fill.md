# ADR-005: Interior fill per section

- Status: accepted (D-1b)
- Date: 2026-11-05

## Context

Customers choose what goes inside each section: shelves, a hanging rail, internal drawers.
Dafna has not sent production values yet, so every number is an assumption. The interior must
plug into the existing mechanisms: customer blocking (`blockingIssue`), auto-reset with a toast
(`repairCustomerParams` + `ResetToast`), order drafts, and later drawings.

## Decision

- **Presets per section**: `empty | shelves | rail | rail_shelf | drawers_shelves | rail_drawers`,
  plus `auto`. Stored as scalar template params `interior1..interior4` (`appliesToSection`), like
  `doorSection1..4`. The brief asked for one `interior` array; flat params reuse the whole
  validation / customer-blocking / reset / toast chain unchanged. The order draft carries the
  interior as a per-section array (`interior[]`, `sections[].shelves/rails/drawers`).
- **`auto` = template default rule**: single door → `shelves`, double door → `rail_shelf`, no door
  → `shelves`; if that preset would produce a warning (e.g. rail in a 495 mm carcass) → `shelves`.
  So `auto` never warns and is always a safe reset target.
- **Layout rules** (engine `interior.ts`, all values unconfirmed constants in template v2):
  - drawers: 2 × 170 mm fronts with 3 mm gaps at the bottom; a fixed shelf directly above;
    box width = inner width − 2 × 13 (slide clearance); front = box width (simplified internal
    front); box height = front − 40; box depth = longest 50 mm slide (250..550) that fits.
  - rail presets: top shelf 400 mm below the top inner face; rail axis 60 mm below the
    shelf/top; rail Ø 25, length = section inner width, centred in depth.
  - free space without a rail: removable shelves, compartments = round(height / 334), equal
    openings, bottom faces rounded to 0.5 mm; shelf depth = carcass inner depth − 4.
- **Warnings** (thresholds unconfirmed): `RAIL_DEPTH_SHORT` (inner depth < 530),
  `RAIL_HEIGHT_SHORT` (clear hanging height < 900), `DRAWER_SECTION_TOO_WIDE` (front > 900).
  They are in the web app's `CUSTOMER_BLOCKING_WARNINGS`: customers cannot pick such presets (the
  card shows the reason); a size change that makes a chosen preset blocking resets it to `auto`
  with a toast. Staff can pick them and sees the warning.
- **Production fields** on every panel (`edges`, `grainDirection`, `operations`) are data only,
  for a future Bazis / GibLab export. Default edge rule: visible front edges banded 0.8 mm ABS
  placeholder; no drilling generated.

## Example (default 1360 × 1900 × 516, 3 sections, single doors → auto = shelves)

Inner box y 116..1884 (1768 mm) → 5 compartments → 4 shelves with bottom faces at
457 / 813.5 / 1170.5 / 1527 mm, each 432 × 491 × 16.

## Consequences

- With the default depth (516 → carcass 495) customers cannot choose rail presets; they need
  depth ≥ 551 mm. This is intended by the thresholds and should be confirmed by Dafna.
- When Dafna confirms values, only template constants change; the generator stays.
