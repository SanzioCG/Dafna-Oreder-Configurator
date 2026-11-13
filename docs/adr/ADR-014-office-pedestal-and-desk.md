# ADR-014: Office pedestal and desk (multi-product engine)

- Status: accepted (D-8)
- Date: 2026-11-13

## Context

The kiosk sells more than wardrobes. The first new products are an **office pedestal** (ofis
tumbasi, under a desk) and an **office / writing desk** (stol). The desk comes with LDSP side
legs, a steel frame, or an electric height-adjustable frame. Both products need standard sizes
and ergonomics from reliable sources, as the wardrobe has (ADR-013). Applications for them must
be reproducible (ADR-011).

## Sources

**Desk.**

- **EN 527-1:2011** (office work tables; confirmed in 2023): a fixed-height desk is
  **740 ± 20 mm** high.
- **GOST 13025.3-85**: a writing desk's work surface is **at least 800 × 500 mm**.

**Pedestal.** No standard text was available, so the figures are manufacturer data from office
pedestals certified to BS EN 14073-2/-3 (e.g. the Flexiform pedestal datasheet):

- height about **597–600 mm** (fits under a 740 desk);
- widths 300 / 400 / 410 mm;
- A4 hanging-file drawer about 330 × 440 × 240 mm.

**Shared.** GOST 13025.1-85 (ADR-013) also applies:

- the top drawer edge is at most 1250 mm from the floor;
- shelves are at least 170 mm apart.

## Decisions

### Engine

- **Generator registry.** `registry.ts` holds generators for products other than the wardrobe.
  `generate()` and `validate()` dispatch to it when `template.generator` is not the wardrobe
  generator, so every caller keeps the single entry point `generate(template, params)`.
- **Catalog per template.** `catalogForTemplate(template)` gives each template its own catalog:
  - wardrobe below 0.6.0 → catalog 0.1.0;
  - wardrobe 0.6.0 and later → catalog 1.0.0 (unchanged, so wardrobe applications regenerate
    exactly);
  - pedestal and desk → catalog **1.1.0**.

  Catalog 1.1.0 is 1.0.0 plus Dafna's table-top boards (Белый 22 мм, Дуб сонома светлый 22 мм,
  Орех Пацифик H3700 25 мм) and metal finishes (Металл чёрный / белый).

- **Pedestal template 0.1.0 (`pedestal-v1`).**
  - Carcass: the top sits over the sides; the bottom sits between the sides; the back is an HDF
    overlay.
  - Base: castors (metal) or a plinth strip, with the sides going to the floor.
  - Interior layouts: 3 equal drawers; 2 small drawers plus 1 A4 hanging-file drawer (the file
    front keeps 300 mm and the small drawers share the rest, at least 90 mm each); or a door with
    one shelf.
  - Standard sizes: width 400 / 450 mm, height 600 mm, depth 500 / 600 mm.
  - Warnings:

    | Code                    | When                                      |
    | ----------------------- | ----------------------------------------- |
    | `FILE_DRAWER_TOO_SMALL` | the file box is under 330 × 240 mm inside |
    | `PEDESTAL_TOO_HIGH`     | the pedestal is over 700 mm high          |

  - **Our drawer boxes have 16 mm LDSP sides.** A 400 mm pedestal therefore leaves only 310 mm
    inside, so an A4 hanging file needs the **450 mm** pedestal. Factory 400 mm pedestals use
    thin metal drawer sides. The customer UI disables the option at 400 mm and explains why.
- **Desk template 0.1.0 (`desk-v1`).**
  - Work top: Dafna table-top boards (22 / 25 mm) or a 16 / 18 mm decor.
  - **Two desk types** (Dafna decision, D-8): there are no fixed metal legs.
    - `ldsp`: a board-made desk, two LDSP side legs and a modesty panel;
    - `metal_lift`: a purchased electric height-adjustable (lift) frame.
  - The frame parts are role `frame`: bought parts, not cut from board, with no edges and no
    grain.
  - Standard sizes: width 1000–1800 mm, depth 600 / 700 / 800 mm.
  - Height: **740 mm** sitting; the lift desk also offers **1100 mm** standing (unconfirmed;
    the frame adjusts continuously on site). A fixed desk cannot take 1100.
  - The width / depth minimum is the GOST 800 × 500.
  - Warnings:

    | Code                        | When                                   |
    | --------------------------- | -------------------------------------- |
    | `DESK_HEIGHT_NOT_ERGONOMIC` | a fixed-leg desk outside 720–760 mm    |
    | `DESK_TOO_SMALL`            | the work surface is under 800 × 500 mm |

    The lift frame may be set to any height.
- **Archive.** `PRODUCT_ARCHIVE[templateId][version]` holds every product's templates, and
  `regenerateApplication(params, version, { templateId })` uses it (the default is
  `wardrobe`). Application fixtures exist for both new products.
- **Order draft.** `productType` now comes from the template.

### UI

- **Start screen.** Product tabs (Shkaf / Ofis tumbasi / Stol), each with its own ready-made
  models.
- **One configurator for all products.** The `useConfigurator` hook holds the active template.
  Steps, option availability, the reset toast and the staff panel read the template through a
  React context.
- **Step 3 depends on the product.** It is "Ichki" for the wardrobe, "Tortmalar" for the
  pedestal and "Oyoqlar" for the desk. The pedestal and desk use a generic options step.
- **Step 2 "Rang".** It renders the template's swatch parameters: pedestal fronts are "Old
  panellar"; the desk shows the work top plus the leg decor or the frame colour, depending on
  the legs.
- **Presentation and submitted screens.** The decor line comes from the product summary, e.g.
  "Stoleshnitsa: … · Oyoq: …".

### API, sheet and Telegram

- **Request.** It carries `product` (the templateId); older kiosks send none, which means
  wardrobe. The API validates against that product's template, its standard sizes and its
  customer-blocking warnings.
- **Sheet.** Two columns are appended: **Mahsulot** (visible) and **templateId** (hidden).
  Existing columns are not moved.
- **Telegram.** The message shows the product name and product-specific labels.

## Open questions (Dafna)

- Pedestal: drawer box system (LDSP or metal sides), castor model, and whether a 400 mm
  pedestal must take A4 hanging files.
- Desk: the frame supplier and model (fixed / lift), the lift height range, and modesty panel
  height.
- Standard sizes for both products.
