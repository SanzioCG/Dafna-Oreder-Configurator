# @dafna/engine

Pure TypeScript product engine for the Dafna configurator. **No DOM, no Three.js, no React**
(enforced by `lib: ["ES2022"]` and ESLint import rules). The same code runs in the kiosk browser
and, later, on the Node backend (`pnpm build` emits `dist/`, runnable with plain Node).

## Units and coordinate system

- All lengths are **millimetres** (integers for inputs; positions can be `.5`).
- Right-handed, Y up:
  - **X = width** (left → right as seen from the front),
  - **Y = height** (floor → up),
  - **Z = depth** (back/wall → front/customer).
- **Origin = bottom-left-back corner** of the overall product bounding box, at floor level.
  The product occupies `[0, width] × [0, height] × [0, depth]` (doors closed).

### Panel frame

A `Panel` is a rectangular board. In its local frame it is centred at the origin with
**length along local X, thickness along local Y, width along local Z** (a board lying flat).

- `position` = board **centre** in product coordinates (mm).
- `rotation` = Euler angles in **degrees, order XYZ**, local frame → product axes.

| Rotation     | Board orientation                          | Used by            |
| ------------ | ------------------------------------------ | ------------------ |
| `[0, 0, 0]`  | horizontal: length X, thickness Y, width Z | top, bottom        |
| `[0, 0, 90]` | vertical: length Y, thickness X, width Z   | side, partition    |
| `[90, 0, 0]` | vertical: length X, width Y, thickness Z   | back, plinth, door |

In Three.js: `new BoxGeometry(lengthMm, thicknessMm, widthMm)`, mesh at `position`, rotation in
radians. Door panels are always given **closed**; opening is a viewer animation only.

## Template format (`templates/wardrobe.v1.json`)

Current template: **v1, `templateVersion` 0.2.0, generator `wardrobe-carcass-v1`** (D-1a:
materials, depth definition, doors). `templates/wardrobe.v0.json` (D-0, 0.1.0) is kept as an
archive only; D-0 order drafts are migrated (see below), not generated with it.

```jsonc
{
  "templateId": "wardrobe",
  "templateVersion": "0.2.0", // stored in every order draft
  "productType": "wardrobe",
  "generator": "wardrobe-carcass-v1", // generator code that understands this template
  "units": "mm",
  "parameters": [ParamDef],
  "constants": { "<name>": { "value", "unit?", "unconfirmed", "note?" } },
  "constructionRules": [{ "id", "unconfirmed", "note" }],
}
```

`ParamDef`:

| Field              | Meaning                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| `key`              | parameter key in `Params`                                                  |
| `type`             | `int` \| `enum` \| `bool`                                                  |
| `default`          | default value                                                              |
| `min`, `max`       | inclusive range (int); violations are `OUT_OF_RANGE` errors                |
| `step`             | UI increment for slider/stepper (int). **Not** a validation constraint     |
| `options`          | allowed values (enum)                                                      |
| `unit`             | `mm`                                                                       |
| `labelKey`         | i18n key of the label (enum option labels: `option.<labelKey suffix>.<v>`) |
| `uiStep`           | UI wizard step key: `size`, `color`, `doors` (later `interior`)            |
| `customerVisible`  | shown in customer mode                                                     |
| `unconfirmed`      | `true` = assumption, not yet confirmed by Dafna production                 |
| `note`             | explanation (always present for unconfirmed values)                        |
| `control`          | UI hint; `swatch` = enum of material ids shown as colour swatches          |
| `materialKinds`    | enum of material ids: allowed catalog kinds (checked by `validate`)        |
| `appliesToSection` | 1-based section a parameter belongs to (UI hides it if there are fewer)    |

Parameters (v1): `width`, `height`, `depth`, `sections`, `corpusMaterial`, `doorMaterial`
(`same_as_corpus` or a material id), `backPanel`, `base`, `plinthHeight`, `plinthRecess`,
`doors` (`none` | `all_single` | `auto`), `doorSection1..4` (staff override: `preset` | `none` |
`single_left` | `single_right` | `double`).

## Material catalog (`catalog/materials.v0.json`)

`{ catalogVersion, materials: Material[] }` with `Material` =
`{ id, kind: ldsp|hdf|mdf, decorName (i18n key), thicknessMm, colorHex, textureUrl (null for
now), customerVisible, unconfirmed, note }`. `Panel.material` is a material **id**.

**All thicknesses come from the catalog**: corpus boards from `corpusMaterial`, doors from
`doorMaterial`, the back from the `backMaterial` constant. Every v0 decor is an unconfirmed
placeholder (ADR-004). `ldsp_white_18` is staff-only (`customerVisible: false`).

## API

```ts
import {
  wardrobeTemplate as T,
  defaultParams,
  generate,
  validate,
  toOrderDraft,
} from '@dafna/engine';

const params = { ...defaultParams(T), width: 1800, corpusMaterial: 'ldsp_oak_light_16' };
const issues = validate(params); // Issue[] — never throws
const result = generate(T, params); // { panels, sections, issues, dimensions } — never throws
const draft = toOrderDraft(params, result); // dafna-order/0.1-draft JSON, no price fields
```

- `resolveParams(template, input)` → `{ params, issues }`: complete parameter set (missing or
  invalid keys fall back to defaults) + type/range/option issues. Unknown keys → `UNKNOWN_PARAM`.
- `validate(params, template = wardrobeTemplate, catalog = materialsV0)` → `Issue[]`.
- `generate(template, params, catalog = materialsV0)` → `GenerateResult`: `panels`, `sections`
  (with `doorType`), `issues`, `dimensions` (incl. the depth breakdown). If any **error** issue
  exists, `panels`/`sections` are empty and `dimensions` is `null`. Deterministic ids and order:
  `side-left`, `side-right`, `bottom`, `top`, `partition-1..n-1`, `back`, `plinth-front`,
  `plinth-back`, then door leaves left to right (`door-N` for a single door,
  `door-N-left` / `door-N-right` for a double door). Door panels have `role: 'door'`,
  `sectionIndex` and `hingeSide`.
- `toOrderDraft(params, result, { template?, catalog?, now? })` → `OrderDraft`.
- `migrateOrderDraft(draft)` / `migrateParamsFromD0(params)` — see Migration.
- `listUnconfirmed(template, catalog?)` → every unconfirmed parameter, constant, rule, material.
- `clampParam`, `getMaterial`, `computeLayout`, `autoSectionCount`, `autoDoorKind`,
  `resolveDoorTypes`, `distributeEvenly` — building blocks.

### Issues

`{ code, severity: 'error' | 'warning', paramKey?, messageKey: 'issue.<CODE>', values }`

| Code                              | Severity | When                                                               |
| --------------------------------- | -------- | ------------------------------------------------------------------ |
| `INVALID_TYPE`                    | error    | not an integer / not a boolean                                     |
| `OUT_OF_RANGE`                    | error    | int outside `[min, max]`                                           |
| `INVALID_OPTION`                  | error    | enum value not in `options`                                        |
| `MATERIAL_UNKNOWN`                | error    | material id not in the catalog, or of a disallowed kind            |
| `GEOMETRY_INVALID`                | error    | a derived inner size ≤ 0 (cannot happen within v1 ranges)          |
| `DOOR_TOO_WIDE`                   | error    | single door on a section with inner width > `maxSingleDoorWidthMm` |
| `UNSUPPORTED_TEMPLATE`            | error    | template `generator` is not `wardrobe-carcass-v1`                  |
| `UNKNOWN_PARAM`                   | warning  | input key not defined by the template                              |
| `SHELF_SPAN`                      | warning  | a section inner width > `maxShelfSpanMm` (900, unconfirmed)        |
| `DOOR_TOO_HEIGHT`                 | warning  | door height > `maxDoorHeightMm` (2400, unconfirmed)                |
| `MIGRATION_THICKNESS_UNAVAILABLE` | error    | migration: no LDSP with the D-0 `panelThickness` in the catalog    |
| `UNSUPPORTED_SCHEMA`              | error    | migration: unknown order draft `schemaVersion`                     |

## Construction v1 (wardrobe carcass + hinged doors)

With `t` = corpus material thickness, `td` = door material thickness, `tb` = back material
thickness (0 if `backPanel = none`), `g` = `doorGapFrontMm` (2), `ph` = `plinthHeight` (0 if
`base = none`), `n` = section count, _doors_ = at least one section has a door:

- **depth** (ADR-003) = overall outer depth = `tb + carcassDepth + (doors ? g + td : 0)`, so
  `carcassDepth Dc = depth − tb − (doors ? td + g : 0)`. Carcass at `z ∈ [tb, tb + Dc]`.
- carcass height `Hc = height − ph`.
- **sides** `Hc × Dc × t` on the plinth; **top / bottom** `(width − 2t) × Dc × t` between the
  sides; **partitions** `(Hc − 2t) × Dc × t` between top and bottom.
- **sections**: inner width total `width − (n + 1)·t`, split equally in whole mm (remainder
  +1 mm to the leftmost); inner height `Hc − 2t`; inner depth `Dc`.
  `sections = auto`: smallest `n ∈ {1,2,3,4}` with every inner width ≤ 900.
- **back** (HDF overlay) `width × Hc × tb` at `z ∈ [0, tb]`.
- **plinth**: front and back strips `width × ph × t`; front strip set back by `plinthRecess`
  from the **carcass** front, back strip flush with the carcass back.
- **doors** (overlay): door type per section = staff override `doorSectionN`, else the preset:
  `none`; `all_single`; `auto` → inner width ≤ 600 single, else double. Preset single doors
  alternate hinges left, right, left, … from the left; a double door's left leaf is hinged left,
  the right leaf right. A section's door coverage runs between the centre lines of its
  partitions (outer carcass edge at the ends). Gaps: 1.5 mm at outer edges and next to a
  section without a door, 3 mm between leaves. For a fully doored front:
  `Σ leaf widths + 2·1.5 + (leaves − 1)·3 = width`. Door height `Hc − 2·1.5`, from `ph + 1.5`
  to `height − 1.5` (plinth visible). Door back face at `tb + Dc + g`, front face at `depth`.
  Leaf widths are not rounded (can be `.5` / `.25`).

Every assumption above is listed as `unconfirmed` in the template (`constructionRules`,
`constants`) or the catalog, and is shown in staff mode.

## Order draft schema `dafna-order/0.1-draft`

`{ schemaVersion, productType, templateVersion, catalogVersion, params, materials: { corpus,
doors, back } (full catalog entries or null), doors: [{ sectionIndex, type, leaves: [panel
ids] }], dimensions, panels, sections, issues, generatedAt, migratedFrom? }`. No price fields.

Changes from `dafna-order/0-draft` (D-0): added `catalogVersion`, `materials`, `doors`,
`dimensions`, `sections[].doorType`, optional `migratedFrom`; `params.panelThickness` replaced by
`params.corpusMaterial` / `doorMaterial` / `doors` / `doorSection1..4`; `panels[].material` is now
a catalog id (`ldsp` → e.g. `ldsp_white_16`, `hdf` → `hdf_white_3`).

## Migration (D-0 drafts)

`migrateOrderDraft(draft)` → `{ draft | null, issues }`, never throws:

1. `dafna-order/0.1-draft` → returned unchanged.
2. `dafna-order/0-draft` → params migrated by `migrateParamsFromD0`: `panelThickness` 16/18 →
   `corpusMaterial` = first LDSP in the catalog with that thickness (`ldsp_white_16` /
   `ldsp_white_18`); `doors = 'none'` (D-0 had no doors); all other keys copied. The draft is
   then **re-generated** with the current engine, keeping the original `generatedAt` and setting
   `migratedFrom`. Without doors the depth formula equals D-0's, so the geometry is identical —
   verified against real D-0 drafts in `test/fixtures/`.
3. A thickness with no catalog material → `MIGRATION_THICKNESS_UNAVAILABLE`, `draft: null`.
4. Anything else → `UNSUPPORTED_SCHEMA`, `draft: null`.
