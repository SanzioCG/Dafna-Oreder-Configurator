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

| Rotation     | Board orientation                          | Used by                               |
| ------------ | ------------------------------------------ | ------------------------------------- |
| `[0, 0, 0]`  | horizontal: length X, thickness Y, width Z | top, bottom, shelf, drawer bottom     |
| `[0, 0, 90]` | vertical: length Y, thickness X, width Z   | side, partition, drawer side          |
| `[90, 0, 0]` | vertical: length X, width Y, thickness Z   | back, plinth, door, drawer front/back |

In Three.js: `new BoxGeometry(lengthMm, thicknessMm, widthMm)`, mesh at `position`, rotation in
radians. Door panels are always given **closed**; opening is a viewer animation only.

## Template format (`templates/wardrobe.v2.json`)

Current template: **v2, `templateVersion` 0.3.0, generator `wardrobe-carcass-v2`** (D-1b:
leaf/hinge door rules, interior fill, production fields). `wardrobe.v0.json` (D-0) and
`wardrobe.v1.json` (D-1a) are kept as an archive only; older order drafts are migrated.

```jsonc
{
  "templateId": "wardrobe",
  "templateVersion": "0.3.0", // stored in every order draft
  "productType": "wardrobe",
  "generator": "wardrobe-carcass-v2", // generator code that understands this template
  "units": "mm",
  "parameters": [ParamDef],
  "constants": { "<name>": { "value", "unit?", "unconfirmed", "note?" } },
  "constructionRules": [{ "id", "unconfirmed", "note" }],
}
```

`ParamDef`:

| Field              | Meaning                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| `key`              | parameter key in `Params`                                                       |
| `type`             | `int` \| `enum` \| `bool`                                                       |
| `default`          | default value                                                                   |
| `min`, `max`       | inclusive range (int); violations are `OUT_OF_RANGE` errors                     |
| `step`             | UI increment for slider/stepper (int). **Not** a validation constraint          |
| `options`          | allowed values (enum)                                                           |
| `unit`             | `mm`                                                                            |
| `labelKey`         | i18n key of the label (enum option labels: `option.<labelKey suffix>.<v>`)      |
| `uiStep`           | UI wizard step key: `size`, `color`, `interior`, `doors`                        |
| `customerVisible`  | shown in customer mode                                                          |
| `unconfirmed`      | `true` = assumption, not yet confirmed by Dafna production                      |
| `note`             | explanation (always present for unconfirmed values)                             |
| `control`          | UI hint: `swatch` (material swatches), `presetCards` (illustrated preset cards) |
| `materialKinds`    | enum of material ids: allowed catalog kinds (checked by `validate`)             |
| `appliesToSection` | 1-based section a parameter belongs to (UI hides it if there are fewer)         |

Parameters (v2): `width`, `height`, `depth`, `sections`, `corpusMaterial`, `doorMaterial`
(`same_as_corpus` or a material id), `backPanel`, `base`, `plinthHeight`, `plinthRecess`,
`doors` (`none` | `all_single` | `auto`), `doorSection1..4` (staff override: `preset` | `none` |
`single_left` | `single_right` | `double`), `interior1..4` (`auto` | `empty` | `shelves` | `rail`
| `rail_shelf` | `drawers_shelves` | `rail_drawers`). The brief asked for one per-section
`interior` array; params stay flat scalars (like `doorSectionN`), and the order draft carries
the interior as a per-section array.

## Material catalog (`catalog/materials.v0.json`)

`{ catalogVersion, materials: Material[] }` with `Material` =
`{ id, kind: ldsp|hdf|mdf, decorName (i18n key), thicknessMm, colorHex, textureUrl (null for
now), customerVisible, unconfirmed, note }`. `Panel.material` is a material **id**. All
thicknesses come from the catalog (ADR-004). `ldsp_white_18` is staff-only.

## API

```ts
import {
  wardrobeTemplate as T,
  defaultParams,
  generate,
  validate,
  toOrderDraft,
} from '@dafna/engine';

const params = { ...defaultParams(T), width: 1800, interior1: 'drawers_shelves' };
const issues = validate(params); // Issue[] — never throws
const result = generate(T, params); // { panels, rails, sections, issues, dimensions } — never throws
const draft = toOrderDraft(params, result); // dafna-order/0.2-draft JSON, no price fields
```

- `validate(params, template = wardrobeTemplate, catalog = materialsV0)` → `Issue[]`.
- `generate(template, params, catalog = materialsV0)` → `GenerateResult`: `panels`, `rails`,
  `sections` (door type + interior summary), `issues`, `dimensions`. With any **error** issue,
  geometry is empty and `dimensions` is `null`. Deterministic ids and order: `side-left`,
  `side-right`, `bottom`, `top`, `partition-1..n-1`, `back`, `plinth-front`, `plinth-back`,
  door leaves L→R (`door-N` single, `door-N-left`/`-right` double), then per section L→R the
  drawer parts (`sN-drawer-K-front|side-left|side-right|back|bottom`) and shelves bottom to top
  (`sN-shelf-K`, `sN-shelf-fixed`, `sN-shelf-top`). Rails: `sN-rail`.
- `toOrderDraft(params, result, { template?, catalog?, now? })` → `OrderDraft`.
- `migrateOrderDraft(draft)`, `migrateParamsFromD0`, `migrateParamsFrom01` — see Migration.
- `listUnconfirmed(template, catalog?)` → every unconfirmed parameter, constant, rule, material.
- Building blocks: `planDoors`, `doorKindForLeaf`, `assignRun`, `roundLeaves` (doors.ts);
  `planInterior`, `resolveInterior`, `evenShelfBottoms`, `defaultPresetFor` (interior.ts);
  `computeLayout`, `autoSectionCount`, `distributeEvenly`, `clampParam`, `getMaterial`.

### Issues

`{ code, severity: 'error' | 'warning', paramKey?, messageKey: 'issue.<CODE>', values }`

| Code                              | Severity | When                                                               |
| --------------------------------- | -------- | ------------------------------------------------------------------ |
| `INVALID_TYPE`                    | error    | not an integer / not a boolean                                     |
| `OUT_OF_RANGE`                    | error    | int outside `[min, max]`                                           |
| `INVALID_OPTION`                  | error    | enum value not in `options`                                        |
| `MATERIAL_UNKNOWN`                | error    | material id not in the catalog, or of a disallowed kind            |
| `GEOMETRY_INVALID`                | error    | a derived inner size ≤ 0 (cannot happen within v2 ranges)          |
| `DOOR_TOO_WIDE`                   | error    | a single leaf wider than `maxSingleLeafWidthMm` (600, leaf width)  |
| `HINGE_CONFLICT`                  | error    | two leaves would hinge on one partition (ADR-006)                  |
| `UNSUPPORTED_TEMPLATE`            | error    | template `generator` is not `wardrobe-carcass-v2`                  |
| `UNKNOWN_PARAM`                   | warning  | input key not defined by the template                              |
| `SHELF_SPAN`                      | warning  | a section inner width > `maxShelfSpanMm` (900)                     |
| `DOOR_TOO_HEIGHT`                 | warning  | door height > `maxDoorHeightMm` (2400)                             |
| `RAIL_DEPTH_SHORT`                | warning  | rail preset, carcass inner depth < `railMinDepthMm` (530)          |
| `RAIL_HEIGHT_SHORT`               | warning  | rail preset, clear hanging height < `railMinHangingHeightMm` (900) |
| `DRAWER_SECTION_TOO_WIDE`         | warning  | drawer front width > `drawerMaxFrontWidthMm` (900)                 |
| `MIGRATION_THICKNESS_UNAVAILABLE` | error    | migration: no LDSP with the D-0 `panelThickness` in the catalog    |
| `MIGRATION_DOORS_CHANGED`         | warning  | migration: the D-1b hinge rule changed a section's door type       |
| `UNSUPPORTED_SCHEMA`              | error    | migration: unknown order draft `schemaVersion`                     |

The web app blocks every error plus `SHELF_SPAN`, `RAIL_DEPTH_SHORT`, `RAIL_HEIGHT_SHORT` and
`DRAWER_SECTION_TOO_WIDE` for customers (`CUSTOMER_BLOCKING_WARNINGS`); staff sees them.

## Construction v2 (carcass, hinged doors, interior)

With `t` = corpus thickness, `td` = door thickness, `tb` = back thickness (0 without back),
`g` = `doorGapFrontMm` (2), `ph` = `plinthHeight` (0 if `base = none`), `n` = section count:

- **depth** (ADR-003): `carcassDepth Dc = depth − tb − (doors ? td + g : 0)`.
- **carcass**: sides `Hc × Dc × t` on the plinth, top/bottom between the sides, partitions
  between top and bottom; sections share `width − (n + 1)·t` in whole mm.
  `sections = auto`: smallest `n ∈ {1..4}` with every inner width ≤ 900 **and** (if the doors
  preset is not `none`) a door layout without DOOR_TOO_WIDE / HINGE_CONFLICT.
- **doors** (ADR-006): coverage between partition centre lines; gaps 1.5 at outer edges and next
  to an empty section, 3 between leaves. Single-leaf width = coverage − gaps; `auto`: single if
  ≤ 600, else double. Hinges: per run of doored sections `L* D? R*` — 1: L, 2: L,R, 3: L,R,R,
  4: L,L,R,R; a lone doored section in the right half hinges right. Leaf widths rounded to
  0.5 mm, remainder to the leaves that lost most; `Σ leaves + gaps = covered width` exactly.
  Consequence: no layout exists with doors at 2400 mm (16 mm board) / 2398–2400 mm (18 mm).
- **interior** (ADR-005), per section inner box `y ∈ [ph + t, height − t]`:
  drawers (2 × 170 front, 3 gaps) at the bottom with a fixed shelf directly above; rail presets
  put a top shelf 400 below the top inner face and the rail axis 60 below it (or below the top);
  free space without a rail gets removable shelves, `round(height / 334)` compartments with equal
  openings (bottom faces rounded to 0.5). Shelves: length = section inner width,
  depth = `Dc − 4`. Drawer box width = inner width − 2 × 13; front = box width (simplified);
  box height = front − 40; box depth = longest 50 mm slide (250..550) that fits.
- **production fields** on every panel: `edges` (visible front edges 0.8 mm ABS placeholder:
  local front edge of sides/partitions/top/bottom/shelves, all edges of doors and drawer fronts;
  others null), `grainDirection` (`length` for LDSP/MDF, `null` for HDF), `operations`
  (always empty). They exist for a future Bazis / GibLab export — **never guess drilling or
  edge data further without Dafna production data.** Panel sizes are finished sizes.

Every assumption is listed as `unconfirmed` in the template or the catalog and shown in staff mode.

## Order draft schema `dafna-order/0.2-draft`

`{ schemaVersion, productType, templateVersion, catalogVersion, params, materials, doors,
interior: [{ sectionIndex, preset, presetSource, shelves, rails, drawers, clearHangingHeightMm }],
dimensions, panels (with edges / grainDirection / operations), rails, sections, issues,
generatedAt, migratedFrom? }`. No price fields.

Changes from 0.1: added `interior`, `rails`, panel production fields, section interior summary,
params `interior1..4`; template 0.3.0. (0.1 vs 0-draft: see git history of this README / ADR-004.)

## Migration

`migrateOrderDraft(draft)` → `{ draft | null, issues }`, never throws. A chain of parameter
steps, then **one** re-generation with the current engine (original `generatedAt` kept,
`migratedFrom` = original schema):

1. `0.2-draft` → returned unchanged.
2. `0-draft` → `migrateParamsFromD0` (`panelThickness` → `corpusMaterial`, `doors = none`) → step 3.
3. `0.1-draft` → `migrateParamsFrom01`: `interior1..4 = empty` (0.1 had no interior),
   `sections: auto` pinned to the draft's section count (the D-1b auto rule also considers doors).
4. A door type changed by the D-1b hinge rule → `MIGRATION_DOORS_CHANGED` warning (e.g. 0.1
   L,R,L → L,R,R). An order that cannot be built any more (two adjacent double doors →
   `HINGE_CONFLICT`) → `draft: null` with the errors; staff must re-confirm it.
5. Unknown schema → `UNSUPPORTED_SCHEMA`.

Verified with real drafts in `test/fixtures/` (D-0 drafts and 0.1 drafts generated by the D-1a
engine at main @ 10d0238).
