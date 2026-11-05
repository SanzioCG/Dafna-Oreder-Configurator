# ADR-010: Simplified customer flow (start screen, 4 steps, plain language, cm)

- Status: accepted (D-4)
- Date: 2026-11-05

## Context

A customer with no furniture knowledge must design a wardrobe in about 1–2 minutes. The
engineering parameters stay in the engine and stay fully available to staff. This changes only
the customer-facing UI and flow. The engine, validation, blocking / reset mechanisms
(`blockingIssue`, `repairCustomerParams`, `ResetToast`), the state machine, the smart camera,
the presentation timing and the order draft are all unchanged.

## Decisions

### Flow

| Step                                             | Card               | Customer content                                                                    |
| ------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------- |
| 0 "Shkafingizni tanlang" (start, customers only) | bento cards        | 4 ready-made models, or "Noldan boshlash"                                           |
| 1 "Joy"                                          | mint `#B9F0D3`     | width chips, big stepper, slider; "Batafsil" (height, depth); "Pastki yopiq taglik" |
| 2 "Rang"                                         | yellow `#FFE680`   | corpus decors; "Eshiklar boshqa rangda"                                             |
| 3 "Ichki"                                        | lavender `#CFC6FF` | "Eshikli shkaf"; part pills; interior options                                       |
| 4 "Ko'rib chiqish"                               | cyan `#009FE3`     | the full-screen presentation (ADR-008)                                              |

- **Ready-made models.** All four are defined in `apps/web/src/state/presets.ts`, and every value
  is unconfirmed:

  | Model   | Width   |
  | ------- | ------- |
  | Ixcham  | 1000 mm |
  | Klassik | 1500 mm |
  | Keng    | 2000 mm |
  | Katta   | 2400 mm |
  - Height, depth, doors and the interior come from the template defaults; the interior is
    `auto`, the recommended fill.
  - Picking a model loads its engine params and goes to step 1.
  - The card thumbnail is a pre-rendered SVG front view drawn from engine output, not a fifth
    WebGL scene.

- **Step 1.**
  - Width chips 100 / 120 / 150 / 180 / 200 / 240 sm and a big − value + stepper; every move is
    10 mm.
  - "Pastki yopiq taglik" is the same as `base = plinth`.
  - The section count is never shown to customers and is always `auto`.
- **Step 2.**
  - "Eshiklar boshqa rangda" is OFF by default: `doorMaterial = same_as_corpus` and the door
    swatches are hidden.
  - ON shows the door swatches with the current door decor selected.
- **Step 3.**
  - "Eshikli shkaf" switches `doors` between `auto` and `none`.
  - Parts are picked with pills ("1", "2", …) or by tapping the 3D model; the smart camera frames
    the part.
- Staff see the same four steps, plus the "Xodim sozlamalari" card (see Staff).

### Plain language (customers)

- Interior options map one-to-one to engine presets:

  | Customer label          | Engine preset                                           |
  | ----------------------- | ------------------------------------------------------- |
  | Tavsiya etilgan         | `auto`, badge "Tavsiya", hint shows what it resolves to |
  | Ilib qo'yiladigan kiyim | `rail`                                                  |
  | Buklangan kiyim         | `shelves`                                               |
  | Ilish + javon           | `rail_shelf`                                            |
  | Mayda narsalar          | `drawers_shelves`                                       |
  | Ilish + tortmalar       | `rail_drawers`                                          |
  | Bo'sh                   | `empty`                                                 |

- Disabled options show a human reason (`creason.*`), for example "Bu kenglikda javon egilib
  qoladi" or "Bu chuqurlikda kiyim ilgichi sig'maydi". Reset toasts use the same words.
- These never appear in customer UI (a test checks every step):
  - codes;
  - the engineering words bo'lim, tsokol, shtanga, LDSP, Avto.
- The customer word for a section is **qism**.

### Units

- Customers see **whole centimetres**: `toDisplay(mm) = round(mm / 10)`, half up; for example
  1365 mm shows as 137 sm and 656 mm as 66 sm.
- Staff see millimetres. The engine always works in mm.
- Customer steppers and chips move in 10 mm steps, so sizes a customer sets are exact.
  Converting back to mm is `cm × 10`.
- Engine-derived sizes (section widths) are rounded for display only.

### Staff

- "Xodim sozlamalari" is a collapsible card in every step, closed by default, and it stays open
  across steps. It holds every engine parameter of that step: section count, back panel, base,
  plinth height / recess, all decors including 18 mm, door preset, per-section door / hinge
  overrides, interior presets. It also holds the issues list and the order draft JSON.
- The theme switch and the `?theme=` override are available only in staff mode or a dev build.

## Consequences

- To confirm with Dafna: the ready-made models, the step colours, and the chip widths.
- The section count, back panel and plinth sizes are staff-only. A customer can never select a
  combination that the staff-only rules would block.
