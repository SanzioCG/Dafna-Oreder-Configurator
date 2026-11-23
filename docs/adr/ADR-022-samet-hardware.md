# ADR-022: Real hardware from Dafna's stock report — Samet replaces the demo brands (D-28)

- Status: accepted (D-28, 2026-11-23)
- Builds on: ADR-011 (reproducible applications), D-9 (hardware brands), D-20 (manager page)

## Context

Dafna sent its hardware stock report (`Furniture.docx`, six screenshots of a 1C report). It
covers three groups:

- **Samet:** hinges, mounting plates, drawer slides and their locks, a sliding-door mechanism,
  and connectors.
- **Mesan:** dowels.
- **Screws:** no brand given.

Each line has two numbers. The founder confirmed what they mean: the first is the cost of one
unit in USD, the second the stock count.

The founder asked for the list to be added to the manager page and to the configurator,
sorted by brand. Samet replaces the demo brands Strax and Hettich in the kiosk.

## Decision

**Hardware catalog 1.2.0 (append-only)**

- The new items record the 1C name (`erpName`), the cost in USD (`costUsd`) and what they are
  for (`use`):
  - `kiosk`: offered to customers or counted in the BOM.
  - `production`: the office's list only. This covers connectors, screws and sliding-door
    parts; no product rule counts them yet.
  - `legacy`: Strax and Hettich, kept only for older applications.
- Stock counts are not stored, because they change daily.

**Hinges**

- The kiosk offers one hinge brand: `samet`, the Master soft-close hinge.
- The hinge model follows each leaf's mounting (`hingeByMount`):
  - 0 mm for full overlay;
  - 8 mm for half overlay;
  - 18 mm for inset.
- Every hinge gets one 5 mm mounting plate (`hingePlate`).

**Drawer slides**

The kiosk offers four Samet slides:

- `samet_ball`: SO Class, ball bearing. This is the default, as in the Bazis pedestal.
- `samet_soft`: SO Class with soft close.
- `samet_smart`: Smart Slide, hidden, full extension.
- `samet_slidea`: Slidea, hidden.

Smart Slide and Slidea add their left and right locks per drawer (`slideExtras`). The 3D view
and the sketches read soft close and hidden mounting from the catalog (`softClose`,
`slideMount`), not from a brand name.

**Templates**

- New template versions: wardrobe **0.15.0** and pedestal **0.6.0**. Older versions keep
  Strax and Hettich.
- Migrated drafts get Hettich → Samet soft close and Strax → Samet ball bearing, each reported
  with MIGRATION_HARDWARE_CHANGED.

**Demo prices**

- Demo price = cost × `usdRate` 12 900 (an assumed rate), rounded to 100 so'm. The manager
  sets the real prices.

**Manager page**

- "Furnitura" is grouped by brand: A–Z, with items without a brand last.
- Each row shows the model, the 1C name, the cost in USD and what the item is for.

## Open (Dafna to confirm)

- The 8 mm half-overlay hinge is not in the report. It is used for leaves on a partition and
  is priced as the 0 mm hinge for now.
- Which mounting plate goes with which hinge. The 5 mm plate is assumed.
- The unit of the screw lines (the costs look like per pack).
- Slide lengths: the BOM counts one pair per drawer of the chosen series, not its length.
