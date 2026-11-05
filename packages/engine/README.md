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
  The product occupies `[0, width] × [0, height] × [0, depth]`.

### Panel frame

A `Panel` is a rectangular board. In its local frame it is centred at the origin with
**length along local X, thickness along local Y, width along local Z** (a board lying flat).

- `position` = board **centre** in product coordinates (mm).
- `rotation` = Euler angles in **degrees, order XYZ**, local frame → product axes.

| Rotation     | Board orientation                          | Used by         |
| ------------ | ------------------------------------------ | --------------- |
| `[0, 0, 0]`  | horizontal: length X, thickness Y, width Z | top, bottom     |
| `[0, 0, 90]` | vertical: length Y, thickness X, width Z   | side, partition |
| `[90, 0, 0]` | vertical: length X, width Y, thickness Z   | back, plinth    |

In Three.js: `new BoxGeometry(lengthMm, thicknessMm, widthMm)`, mesh at `position`, rotation in
radians.

## Template format (`templates/wardrobe.v0.json`)

```jsonc
{
  "templateId": "wardrobe",
  "templateVersion": "0.1.0",        // stored in every order draft
  "productType": "wardrobe",
  "generator": "wardrobe-carcass-v0", // generator code that understands this template
  "units": "mm",
  "parameters": [ParamDef],
  "constants": { "<name>": { "value", "unit?", "unconfirmed", "note?" } },
  "constructionRules": [{ "id", "unconfirmed", "note" }]
}
```

`ParamDef`:

| Field             | Meaning                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `key`             | parameter key in `Params`                                              |
| `type`            | `int` \| `enum` \| `bool`                                              |
| `default`         | default value                                                          |
| `min`, `max`      | inclusive range (int); violations are `OUT_OF_RANGE` errors            |
| `step`            | UI increment for slider/stepper (int). **Not** a validation constraint |
| `options`         | allowed values (enum)                                                  |
| `unit`            | `mm`                                                                   |
| `labelKey`        | i18n key of the label                                                  |
| `uiStep`          | UI wizard step key (`size`, later `color`, `interior`, `doors`)        |
| `customerVisible` | shown in customer mode                                                 |
| `unconfirmed`     | `true` = assumption, not yet confirmed by Dafna production             |
| `note`            | explanation (always present for unconfirmed values)                    |

The task brief used the name `step` for both the numeric increment and the UI step key; the
template uses `step` (increment) and `uiStep` (wizard step) to keep them apart.

## API

```ts
import {
  wardrobeTemplateV0 as T,
  defaultParams,
  generate,
  validate,
  toOrderDraft,
} from '@dafna/engine';

const params = { ...defaultParams(T), width: 1800 };
const issues = validate(params); // Issue[] — never throws
const result = generate(T, params); // { panels, sections, issues } — never throws
const draft = toOrderDraft(params, result); // dafna-order/0-draft JSON, no price fields
```

- `resolveParams(template, input)` → `{ params, issues }`: complete parameter set (missing or
  invalid keys fall back to defaults) + type/range/option issues. Unknown keys → `UNKNOWN_PARAM`
  warning.
- `validate(params, template = wardrobeTemplateV0)` → `Issue[]`.
- `generate(template, params)` → `GenerateResult`. If any **error** issue exists, `panels` and
  `sections` are empty. Output is deterministic (stable ids and order: `side-left`,
  `side-right`, `bottom`, `top`, `partition-1..n-1`, `back`, `plinth-front`, `plinth-back`).
- `toOrderDraft(params, result, { now? })` → `OrderDraft`.
- `listUnconfirmed(template)` → every unconfirmed parameter, constant and construction rule.
- `clampParam(def, value)` → integer clamped to `[min, max]` (used by the UI).
- `computeLayout`, `autoSectionCount`, `distributeEvenly` — building blocks, exported for tests
  and future drawings.

### Issues

`{ code, severity: 'error' | 'warning', paramKey?, messageKey: 'issue.<CODE>', values }`

| Code                   | Severity | When                                                        |
| ---------------------- | -------- | ----------------------------------------------------------- |
| `INVALID_TYPE`         | error    | not an integer / not a boolean                              |
| `OUT_OF_RANGE`         | error    | int outside `[min, max]`                                    |
| `INVALID_OPTION`       | error    | enum value not in `options`                                 |
| `GEOMETRY_INVALID`     | error    | a derived inner size ≤ 0 (cannot happen within v0 ranges)   |
| `UNSUPPORTED_TEMPLATE` | error    | template `generator` is not `wardrobe-carcass-v0`           |
| `UNKNOWN_PARAM`        | warning  | input key not defined by the template                       |
| `SHELF_SPAN`           | warning  | a section inner width > `maxShelfSpanMm` (900, unconfirmed) |

## Construction v0 (wardrobe carcass)

With `t = panelThickness`, `ph = plinthHeight` (0 if `base = none`), `tb = 3` (0 if
`backPanel = none`), `n` = section count:

- carcass height `Hc = height − ph`; carcass depth `Dc = depth − tb` (back overlay counted
  inside the overall depth); carcass occupies `z ∈ [tb, depth]`.
- **sides**: `Hc × Dc × t`, standing on the plinth, at `x ∈ [0, t]` and `[width − t, width]`.
- **top / bottom**: `(width − 2t) × Dc × t`, between the sides.
- **partitions**: `(Hc − 2t) × Dc × t`, between top and bottom.
- **sections**: inner width total `width − (n + 1)·t`, split equally in whole mm (remainder
  +1 mm to the leftmost sections); inner height `Hc − 2t`; inner depth `Dc`.
- `sections = auto`: smallest `n ∈ {1,2,3,4}` with every inner width ≤ 900 mm.
- **back** (HDF overlay): `width × Hc × tb` at `z ∈ [0, tb]`, covering the carcass only.
- **plinth**: front and back strips `width × ph × t`; front strip set back by `plinthRecess`
  from the front, back strip flush with the carcass back.

Every assumption above is listed as `unconfirmed` in the template (`constructionRules`,
`constants`) and shown in staff mode.
