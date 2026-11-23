# ADR-020: Construction from Dafna's Bazis models (D-26)

- Status: accepted (D-26, 2026-11-23)
- Builds on: ADR-018 (technologist's confirmation table), ADR-011 (reproducible applications)

## Context

Dafna sent seven Bazis-Mebelshchik projects (`docs/production/bazis/`, analysed in
`ANALIZ.md`): the Lester wardrobe, a small wardrobe, an office wardrobe, a sideboard, the mobile
pedestal and two desks. In several places they differ from the confirmation table and from the
founder's earlier answers. The founder decided: **the Bazis models are right**.

## Decision

New template versions: wardrobe **0.13.0**, pedestal **0.5.0**, desk **0.4.0**. The new
construction depends on template data (the rules `lester-carcass`, `lester-pedestal` and
`lester-desk`), so older versions regenerate unchanged.

**Wardrobe 0.13.0**

- `base`: **feet** (four 20 mm Bingo feet, the default) or plinth. On feet the full-width
  bottom stands on the feet, and the sides stand between bottom and top. "No plinth" drafts
  migrate to feet, and the change is reported.
- The back is HDF in a **groove**: 12 mm from the rear edge, 8 mm into every panel.
  Partitions stop at the back.
- **Inset doors by default**, with 3 mm gaps.
- Shelves sit 1 mm behind an inset door (17 mm from the front), or 5 mm from the front in an
  open section. Removable shelves are 1 mm short at each side.
- Two edge bands:
  - PVC 1 mm: doors and fronts all round; top and bottom at the front and ends.
  - 0.4 mm: everywhere else.
- Drawer boxes are 120 mm high.
- Catalog 1.1.0 (for the feet).

**Pedestal 0.5.0 ("Tum mobil")**

- Castors are 55 mm.
- Top and bottom are full size. The sides stand between them, 5 mm in from the ends and 15 mm
  from the rear.
- The back is a 16 mm board of the carcass decor.
- The fronts overlay the sides and stand between bottom and top, with gaps of 4 mm (bottom),
  3 mm (between) and 3 mm (top). Top and bottom reach 4 mm past the fronts. This replaces the
  0.4.0 "top flush with the fronts".
- Drawer box: always 120 mm high, 14 mm above the front's lower edge. The front is the box's
  front wall.
- Bands: 1 mm and 0.6 mm.

**Desk 0.4.0 ("stol 1500")**

- The work top is two full sheets (16 + 16 mm) with one 1 × 35 mm band. This replaces the
  0.3.0 50 mm frame strips.
- Each leg is two boards, 5 mm in from the ends, front and back, standing on 5 mm pads.
- The modesty panel is three stepped layers (466 / 316 / 166 mm), 35 mm from the back edge.

## Not taken from the files (yet)

- The 2 mm side inset of the wardrobe.
- The exact hinge positions: the hardware catalog keeps its own hinge count rule.
- Separate decors for the desk's top pieces (the files use two colours).
- The rail anchor point.

## Note

The files are the small "Lester" range. Tall wardrobes with a plinth keep the plinth
construction as an option.
