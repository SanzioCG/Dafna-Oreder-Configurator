# ADR-018: The technologist's confirmation table (D-22)

- Status: accepted (D-22, 2026-11-23)
- Builds on: ADR-002 (templates as data), ADR-006 (doors), ADR-009 (plinth), ADR-011
  (reproducible applications), ADR-014 (pedestal and desk)

## Context

About 80 construction values in the templates were assumptions. Dafna's technologist answered
45 of the 47 "A" rows of the confirmation table (`docs/production`, internal). 20 were confirmed
as they were, 19 changed and 6 were unknown. The founder then clarified the open answers.

## Decision

New template versions: wardrobe **0.12.0**, pedestal **0.3.0**, desk **0.3.0**. Older versions
stay archived and unchanged, so stored applications regenerate as they were. The new
behaviour depends on template data (the rule `top-over-sides`, the parameter `doorMount`, the
constant `worktopFrameStripMm`), so the generator ids stay the same.

**Wardrobe**

- The top lies **on** the side panels, and its ends are banded. Where two carcasses meet, the
  ends are not banded. The bottom stays between the sides.
- Two door mountings (`doorMount`):
  - overlay (nakladnoy, as before). The edge gap is now **3 mm**.
  - **inset** (vkladnoy). The leaves sit inside each opening, flush with the carcass front,
    with **2 mm** all round and between leaves. The door is then not part of the depth stack.
    Shelves and drawer fronts are set back from the door's back face.
- A single leaf is at most **500 mm** wide. Leaf widths are whole millimetres; the
  technologist's answer "0" means no half millimetres.
- Setbacks from the front: shelves **20 mm**, internal drawer fronts **20 mm**. The shelf
  above a rail is **200 mm** below the top.

**Pedestal**

- Fronts are flush with the sides (0 mm). The drawer box sits 10 mm above the front's lower
  edge. The smallest front is 120 mm.
- **No A4 hanging-file drawer**: A4 files go into the document wardrobe. With 120 mm small
  fronts, the file layout no longer fits 550 mm.

**Desk**

- Dafna has no table-top boards now. The work top is a 16 / 18 mm laminated board. A frame of
  **50 mm** strips of the same board is glued underneath, and the outer edge is banded once
  over both layers.

**Migration**

- A wardrobe draft from before 0.12.0 is reported with `MIGRATION_CONSTRUCTION_CHANGED`.
- An old staff door choice that is now too wide is dropped with `MIGRATION_DOORS_CHANGED`.
- Sizes are lowered before the doors are checked.

## Still open

- Waiting for the hardware list: slide clearance, drawer box height and back clearance (they
  depend on the slide model) and the castor height. These will move to the hardware card.
- Unknown: the back / drawer-bottom board, pedestal fronts, desk leg inset and modesty panel.
- Unanswered: edge band thickness (row 28), pedestal plinth (row 35), and every B / C row.
