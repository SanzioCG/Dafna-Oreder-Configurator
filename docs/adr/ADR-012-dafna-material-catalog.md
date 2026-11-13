# ADR-012: Dafna material catalog 1.0.0 (wardrobe template 0.6.0)

- Status: accepted (D-6)
- Date: 2026-11-13

## Context

Catalog 0.1.0 (ADR-004) held six placeholder decors. Dafna sent its price-list decors: EGGER
uni colours and wood decors, Dafna LDSP boards, LMDF fronts, and table-top boards of 22 / 25 /
32 mm. Applications must stay reproducible (ADR-011), so the catalog cannot be edited in place.

## Decisions

- **New catalog `materials.v1.json` (1.0.0)** with 26 wardrobe materials plus the HDF back:
  - **LDSP 16 / 18 mm (22):** corpus and doors.
  - **LMDF 16 / 16.7 mm (4):** doors only (kind `mdf`). The corpus enum lists only LDSP, and
    a test enforces this.
- **Table-top and special-order boards are not in the wardrobe catalog.** The 22 / 25 / 32 mm
  table-top boards wait for the table catalog. "Другой цвет (срок уточним)" (special order)
  is not offered.
- **New fields.**
  - `code`: the supplier decor code, e.g. "EGGER U727 ST9". It is shown to staff, written
    into the sheet and Telegram ("Kulrang tosh (EGGER U727 ST9)"), and used later for Bazis /
    GibLab.
  - `group`: `plain` | `wood`, for the customer swatch headings.
- **Colours** are sampled from the price-list swatches; there are no textures yet. Every
  entry is `unconfirmed` until Dafna confirms the colours and sends texture images.
- **Wardrobe template 0.6.0 (v5)** changes only the material enums and the default decor
  (`ldsp_white_16` = "Белый шагрень", same id as before). The generator is unchanged
  (`wardrobe-carcass-v4`), so the ADR-011 freeze rule holds.
- **Archive.** `TEMPLATE_CATALOG` maps every template version to the catalog it was released
  with: 0.5.0 → 0.1.0, 0.6.0 → 1.0.0. `regenerateApplication` uses it. The 0.5.0 application
  fixtures still regenerate exactly, and there are new 0.6.0 fixtures (including LMDF 16.7 mm
  doors and an 18 mm corpus).
- **Migration.** Drafts before 0.6.0 map the placeholders to the nearest Dafna decor
  (`MATERIAL_MAP_V0_V1`). Each change is reported as a `MIGRATION_MATERIAL_CHANGED` warning;
  geometry is unchanged because the thicknesses are the same.

## Open questions (production)

- **16.7 mm LMDF doors.** The overall depth is kept, so the carcass depth becomes fractional
  (e.g. 578.3 mm) and panels would be cut to 0.1 mm. Production must decide: keep it, round
  the carcass depth down to whole mm, or treat the door as 17 mm.
- **Colours and textures.** Exact colours and texture images per decor (EGGER images need
  Dafna's permission).
- **Edge banding.** Edge banding per decor (matching colour, thickness) is still the single
  placeholder band.
