# ADR-003: Definition of the `depth` parameter

- Status: accepted (D-1a)
- Date: 2026-11-05

## Context

In D-0 there were no doors and `depth` meant back panel + carcass. Adding overlay (nakladnye)
doors raises the question whether the depth the customer chooses is the carcass depth or the
outer depth including the doors. The customer measures the niche/room, so the number on screen
must be what the wardrobe really occupies.

## Decision

`depth` = **overall outer depth** of the product with closed doors:

```
depth = backPanelThickness + carcassDepth + (doors ? doorGapFront + doorThickness : 0)
carcassDepth = depth − backPanelThickness − (doors ? doorThickness + doorGapFront : 0)
```

- `backPanelThickness` = thickness of the back material (HDF 3 mm), 0 if `backPanel = none`.
- `doorThickness` = thickness of the door material (catalog).
- `doorGapFront` = 2 mm (unconfirmed constant `doorGapFrontMm`).
- "doors" = at least one section has a door. With `doors = none` nothing is subtracted, so the
  D-0 meaning is preserved exactly (this is what makes the D-0 migration geometry-identical).
- Handles are not part of the depth (no handles yet).

Staff mode shows the breakdown, e.g. `Orqa 3 + korpus 495 + tirqish 2 + eshik 16 = 516 mm`.

## Consequences

- D-1a kept the default depth 516 mm (carcass 495 with doors). D-1c changed the default to
  **600 mm** (unconfirmed; carcass 579 with 16 mm doors) so rail presets are available at the
  default size (RAIL_DEPTH_SHORT threshold 530 unchanged).
- The overall dimension label and the PDF (D-3) show `depth` directly.
- Changing the door material thickness (e.g. 18 mm) changes the carcass depth, not the overall
  depth.
