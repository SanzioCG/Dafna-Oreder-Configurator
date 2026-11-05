# ADR-004: Material catalog

- Status: accepted (D-1a)
- Date: 2026-11-05

## Context

D-0 had a global `panelThickness` parameter (16 | 18) and generic material names (`ldsp`,
`hdf`). D-1a adds decor choice for corpus and doors. A board's thickness is a property of the
board (decor + thickness = one stock item), not of the wardrobe.

## Decision

- A versioned JSON catalog, `packages/engine/catalog/materials.v0.json`
  (`catalogVersion` 0.1.0): `id`, `kind` (`ldsp` | `hdf` | `mdf`), `decorName` (i18n key),
  `thicknessMm`, `colorHex`, `textureUrl` (null for now), `customerVisible`, `unconfirmed`,
  `note`.
- **Thickness comes from the selected material.** `panelThickness` is removed; corpus geometry
  uses `corpusMaterial.thicknessMm`, doors `doorMaterial.thicknessMm`, the back the
  `backMaterial` constant's thickness. No thickness is hard-coded in generator code.
- `Panel.material` is a catalog **id**; order drafts embed the full catalog entries used
  (`materials.corpus/doors/back`) plus `catalogVersion`, so a draft stays readable after the
  catalog changes.
- Template parameters reference the catalog by id (`options`) and declare allowed kinds
  (`materialKinds`); `validate` reports `MATERIAL_UNKNOWN` otherwise.
- `doorMaterial = same_as_corpus` is the default.
- The viewer maps a material id to one shared Three.js material. `colorHex` is used today; when
  `textureUrl` is filled the texture is loaded into that material — no other change needed.

### v0 content (all `unconfirmed: true`, placeholders until Dafna sends its decor list)

| id                   | kind | mm  | decor            | customer |
| -------------------- | ---- | --- | ---------------- | -------- |
| `ldsp_white_16`      | ldsp | 16  | white            | yes      |
| `ldsp_light_grey_16` | ldsp | 16  | light grey       | yes      |
| `ldsp_beige_16`      | ldsp | 16  | beige            | yes      |
| `ldsp_oak_light_16`  | ldsp | 16  | light oak        | yes      |
| `ldsp_anthracite_16` | ldsp | 16  | anthracite/black | yes      |
| `ldsp_white_18`      | ldsp | 18  | white            | staff    |
| `hdf_white_3`        | hdf  | 3   | white (back)     | staff    |

`ldsp_white_18` was not in the D-1a brief. It keeps the 18 mm board that D-0 listed as a
confirmed Dafna standard, makes D-0 drafts with `panelThickness = 18` migratable, and lets the
tests cover 18 mm. It is staff-only so customers see one white swatch.

## Migration of D-0 order drafts

`panelThickness` → `corpusMaterial` = first LDSP with that thickness (white, since D-0 had no
decor choice); `doors = none`; the draft is re-generated with the current engine and gets
`schemaVersion: dafna-order/0.1-draft` and `migratedFrom: dafna-order/0-draft`. Details in
`packages/engine/README.md`.

## Consequences

- When Dafna's real decor list arrives, only the catalog JSON (and i18n decor names) changes;
  ids in old drafts must stay resolvable — never delete or reuse an id, add new ones.
- Template `options` for material parameters must be updated together with the catalog.
