# ADR-017: Catalog extension (admin-added materials and hardware) and priced services

- Status: accepted (D-20, 2026-11-23)
- Builds on: ADR-002 (templates as data), ADR-011 (reproducible applications), ADR-016 (prices)

## Context

Dafna wants to add boards and hardware from the admin page and see them in the configurator at
once, and to price services (cutting, drilling, delivery, …) without a developer. Dafna's real
lists and its 1C price source are still to come, so the first version runs on demo data.
Templates and catalogs are versioned and never edited. A stored application must regenerate
the same order draft in any later engine version.

## Decision

1. **Catalog extension.** The extension is a list of materials (kind LDSP / MDF, thickness,
   colour, decor code, usage: corpus / door / table top) and hinges / slides (brand, model, soft
   close). It is stored in the Google Sheet tab `Katalog`. At runtime it is applied to the
   **current** templates:
   - a material becomes an option of the material parameters its usage names. The parameter's
     own `materialKinds` rule still applies, so there is no MDF carcass on the pedestal;
   - a hinge or slide becomes a new brand option;
   - `getMaterial()` falls back to the extension.
2. **Append-only.** The server (`mergeCatalog`) assigns ids (`x_m…`, `x_h…`, brand key
   `x_…`). It never deletes an entry; "hiding" only removes it from the customer's choices.
   After an entry is saved, its construction fields are locked: kind, thickness and usage for a
   material; kind and brand key for hardware. Older applications therefore regenerate
   unchanged.
3. **Everywhere the engine runs**, the extension is applied first:
   - the kiosk loads it from `GET /api/catalog` (no prices) at start;
   - every server entry applies it before generating (submit, retry, assembly, quote, manager).
     A failed read is logged and never fatal.
4. **Services** are part of the price list (`services`). Each service has a name and a basis:
   per m² of board, per metre of edge band, per product, or a % of the other costs. It can be
   limited to some products. Services are stored as `xizmat` rows in the `Narxlar` tab and are
   counted before the profit %.
5. **1C link.** Every board and hardware item carries its 1C article (`erpCodes`). The coming
   1C price sync will match on that article and fill only the sheet / hardware prices.

## Consequences

- Admin-added materials have a colour, not a texture photo (images are a later step).
- A new hinge / slide is shown in 3D as the built-in mechanism of its type (soft close or
  not).
- Drilling and per-part services wait for machining data (the production confirmation table).

## D-21 addendum: decor photos (textures)

- Any material (built-in or added) may get a decor photo on the manager page. The photo is
  shrunk in the browser (≤ 2048 px, JPEG) and stored in the Vercel Blob store
  (`BLOB_READ_WRITE_TOKEN`). The extension keeps `textures[id] = {url, widthMm, heightMm}`.
- A photo is visual only, so it may be replaced or removed at any time. Only Blob URLs are
  accepted (data URLs on the dev server only).
- The 3D view tiles the photo at true scale (the photo shows widthMm × heightMm of board, laid
  along the board's length). The kiosk swatches show the photo.
