# ADR-015: Hardware choice, bill of materials and price (DEMO price list)

- Status: accepted (D-9), prices are DEMO
- Date: 2026-11-13

## Context

Dafna wants two things:

- the price calculated automatically while the customer configures;
- a choice of mechanism brand, e.g. Strax or Hettich for drawers and hinges.

The real price list and calculation rules will come from Dafna later; until then the mechanism
runs on demo data.

## Decisions

- **Hardware catalog `hardware.v1.json`.**
  - Items: slides, hinges, castors, the lift frame, rail and rail holder, each with a brand.
  - Brand maps: `hingeBrand` / `slideBrand` → item (`strax` | `hettich`).
  - Hinge rule: hinges per leaf by leaf height, using the fitting makers' usual table (≤ 900:
    2, ≤ 1600: 3, ≤ 2000: 4, ≤ 2600: 5).
  - Door weight is not taken into account yet.
- **`computeBom(template, params, result)`** turns engine output into a bill of materials:
  - boards: m² per material (metal frame parts are excluded);
  - edges: metres per band;
  - hardware: hinges per leaf, a pair of slides per drawer, rail metres plus 2 holders per
    rail, castors, the lift frame.
- **`computePrice(bom, catalog, priceList)`** prices the bill of materials:
  - boards: m² × waste factor × board price, where the board price is looked up by material
    id, then by thickness (table tops), then by kind;
  - edges: edge metres × price per metre;
  - hardware: count × unit price;
  - labour: price per m² of board;
  - markup: a percentage of the subtotal;
  - the total is rounded.

  The result reports any item without a price (`missing`).

- **Price list `pricelist.demo.json`.** It is versioned (`priceListVersion`) and marked
  `demo: true`. **A demo price is never shown to customers**; staff see it labelled "sinov
  narxi", with the breakdown in the staff panel. Customers see the price automatically once a
  real list (`demo: false`) replaces it.
- **Brand parameters.**
  - Wardrobe template **0.8.0** = 0.7.0 + `hingeBrand` / `slideBrand`. The generator and
    geometry are unchanged; the brands only feed the bill of materials and the price. It has
    its own fixtures.
  - The pedestal template (0.1.0, not released yet) has the same two parameters.
  - The desk's lift frame is a single item.
- **UI.** Step 3 gets a "Mexanizmlar" block that shows only the mechanisms the configuration
  has: hinges if there are doors, slides if there are drawers. Brand names are never
  translated.

## Later (needs Dafna's data)

- The real price list and the calculation rules (labour, markup, waste).
- More brands and items (Blum, Boyard …; handles; lift frames by supplier).
- Hinge count by door weight.
- Store the price and the price list version with the application (sheet, Telegram, PDF).
