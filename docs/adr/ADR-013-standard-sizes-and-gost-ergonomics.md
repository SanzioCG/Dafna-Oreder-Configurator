# ADR-013: Standard sizes and GOST 13025.1-85 storage presets (wardrobe template 0.7.0)

- Status: accepted (D-7)
- Date: 2026-11-13

## Context

The founder asked for a simpler customer flow: no free sizes, only standard ones, and an
interior that follows ergonomics (long and short clothes, reach heights) from a reliable,
widely used standard. Tables, bedside units and office cabinets will follow, so the rules are
written as data that later products reuse.

## Source

**GOST 13025.1-85** «Мебель бытовая. Функциональные размеры отделений для хранения»,
with amendments 1–3. It is an interstate standard (CIS) and is used in Uzbekistan. The values
were read from the standard's own text and drawings
([files.stroyinf.ru](https://files.stroyinf.ru/Data2/1/4294838/4294838129.htm)).

| Rule                                                         | Value                                       | Where        |
| ------------------------------------------------------------ | ------------------------------------------- | ------------ |
| Long clothes (coats, dresses): rail top to the element below | ≥ 1400 mm                                   | drawing 1    |
| Short clothes (suits, jackets, shirts)                       | ≥ 900 mm                                    | drawing 2    |
| Clothing compartment depth                                   | ≥ 560 mm                                    | drawings 1–2 |
| Rail top to the shelf above                                  | ≥ 50 mm                                     | drawings 1–2 |
| Rail top edge from the floor                                 | ≤ 1900 mm (more only with a pull-down rail) | cl. 2.3      |
| Gap between shelves                                          | ≥ 170 mm                                    | cl. 3.1      |
| Top drawer edge from the floor                               | ≤ 1250 mm                                   | cl. 7        |
| Shelves above 1900 mm                                        | rarely used items only (antresol)           | table 6 note |

For future tables, the relevant standards are EN 527-1:2011 (fixed desk height 740 ± 20 mm)
and GOST 13025.3-85.

## Decisions

### Template 0.7.0 (v6)

The generator is the same, and the change is additive: the new presets read new template
constants, and the old presets do not change. All application fixtures for 0.5.0 and 0.6.0
still regenerate exactly.

**Standard sizes.** The new `ParamDef.customerValues` holds the sizes a customer may choose:

| Size   | Values (mm)                                   | Default |
| ------ | --------------------------------------------- | ------- |
| Width  | 800, 1000, 1200, 1500, 1600, 1800, 2000, 2400 | 1500    |
| Height | 2100, 2400                                    | 2100    |
| Depth  | 450, 600                                      | 600     |

These are widely used industry sizes and stay **unconfirmed** until Dafna confirms its range.
Staff keep free sizes. The API rejects a kiosk application with any other size
(`NON_STANDARD_SIZE`).

**Storage presets.**

- **`long_hang`** (long clothes): the rail's top edge sits as high as GOST allows (≤ 1900 mm,
  and ≥ 60 mm below the panel above). Below it there is ≥ 1400 mm of free hanging height.
  Above it, an antresol is added when it fits (see the antresol rule below).
- **`short_hang`** (short clothes and shelves): a 1000 mm hanging zone (GOST ≥ 900; the extra
  100 mm is unconfirmed margin), with shelves below it.
- **`short_hang_drawers`**: drawers at the bottom (top drawer edge ≤ 1250 mm), short clothes
  above.
- **`shelves`** and **`drawers_shelves`** work as before (gap ≥ 170 mm, drawers ≤ 1250 mm).

**Antresol rule.** When a compartment of at least 170 mm fits above the rail, the space above
the rail gets a divider shelf and an antresol.

- At height 2400 this gives a divider at 1960 mm with about 400 mm of storage above it.
- At height 2100 nothing usable fits, so there is no antresol.

**Depth rule.**

- **450 mm deep:** the inner depth is below 560 mm, so a rail would break GOST. All hanging
  presets warn (`RAIL_DEPTH_SHORT`), and the customer UI disables them with a plain-language
  reason.
- **`auto`:** it never warns, because it falls back to shelves when the hanging default does
  not fit.

**`auto` presets come from the template.** They are now template data: behind a double door
the default is `short_hang`, otherwise `shelves`.

**Constants.**

- Values taken from GOST are marked `unconfirmed: false`, with the clause cited in the note.
- Dafna's own choices (60 mm hanger gap, 1000 mm hanging zone, `auto` presets, standard sizes)
  stay `unconfirmed: true`.

**Migration.** A draft made before 0.7.0 maps `rail` → `long_hang`, `rail_shelf` →
`short_hang`, and `rail_drawers` → `short_hang_drawers`. Every section whose fill changes is
reported as `MIGRATION_INTERIOR_CHANGED`. The carcass and doors do not change.

### UI

- **Step 1 "Joy":** width, height and depth are chips only, with no stepper, slider or
  "Batafsil". The depth chips say what they suit: "60 sm, kiyim ilish uchun" and "45 sm, tor
  joy: javon va tortmalar".
- **Step 3 "Ichki":** the options are Uzun kiyimlar, Kalta kiyimlar, Kalta kiyim + tortma,
  Buklangan kiyim (shelves), Mayda narsalar (drawers and shelves), and Bo'sh. Each has its own
  icon.

## Later (same model for other products)

The ergonomic rules are template constants, not wardrobe code. Bedside units, office cabinets
and tables will get their own templates with their own standard sizes, and they reuse the same
zone rules:

- drawers ≤ 1250 mm;
- reach ≤ 1900 mm;
- shelf gap ≥ 170 mm;
- desk height per EN 527-1 and GOST 13025.3.

Doors per zone (full height, lower only, or open sections) are the next construction step.
