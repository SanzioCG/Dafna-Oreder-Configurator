# ADR-023: Dafna's 1C prices on the manager page (D-30)

- Status: accepted (D-30, 2026-11-24)
- Builds on: ADR-016 (live prices, manager page), ADR-017 (catalog extension), ADR-022 (hardware)

## Context

EMAN's developers gave Dafna access to 1C through the OData API at `api.eman.uz`. The access
has these limits:

- one base, `eman_materials`;
- one token, read-only (GET);
- only `Catalog_*`, `InformationRegister_*` and `AccumulationRegister_*`;
- 1500 requests per minute;
- no expiry and no IP restriction.

The base holds about 20 000 items. Dafna needs only some of them: laminate, chipboard and some
hardware. A live check (Master 18 mm hinge 11 599 so'm, Kronostar 16 mm chipboard 341 600 so'm
per sheet, both in UZS) matched the items of Dafna's stock report.

## Decision

- **Nothing is imported wholesale.** The manager links our items one by one. The existing
  "1C kodi" field (article) of every board, the edge band and every hardware item gets a
  **"1C"** button. It searches 1C by name words or the exact article, and a click puts the
  article into the field.
- **"1C narxlarini olish"** pulls the current price of every linked item into the fields:
  - hardware: per unit;
  - edge band: per metre;
  - boards: per sheet. A price per m² is turned into the sheet price with the board's sheet
    size.
  - UZS is taken as it is, and USD is converted with the price list's `usdRate`. Any other
    currency is left alone and reported.

  The manager checks the result and saves with "Saqlash" as before. The kiosk price is still
  computed only on the server.

- New Vercel Function **`POST /api/erp`** (`server/erp1c.ts`):
  - it needs the manager PIN and is rate limited;
  - it has two actions: `search` and `prices`;
  - for prices it batches the OData requests: articles → keys, then the price slice of price
    type `1b9d6aa5-…` (Dafna's retail type), free stock summed over the warehouses, and
    currency names;
  - a 1C error is answered as `erp_unavailable`, without 1C's own text.
- Configuration comes from the environment only:
  - **`EMAN_1C_TOKEN`** (secret, Vercel only);
  - optional `EMAN_1C_URL` and `EMAN_1C_PRICE_TYPE`.

  Without the token the button reports that 1C is not connected.

## Open

- Free stock is returned by the API but not shown on the page yet.
- Some 1C items are packs (e.g. "Retail … 20 Pcs"): the manager links the piece article.
- The token was shared in a chat. Dafna should ask EMAN for a new token, restricted to
  Vercel's addresses if possible.

## Update (D-31, 2026-11-24): the manager builds the kiosk catalogue from 1C

The founder asked for the whole 1C list to be available, with the manager marking which items
the kiosk shows.

- A new section **"1C katalogi"** browses all of `eman_materials` by item kind
  (`Catalog_ВидыНоменклатуры`: ЛДСП › Эггер ЛДСП › Эггер 16 мм, ЛМДФ, Кромка, …). It also has
  a search. Each row shows the 1C name, article, price and free stock. 1C's own item folders
  are almost flat (18 940 items at the top), so the item kind is the tree.
- **"Kioskga qo'shish"** opens a form prefilled from the 1C name: LDSP or MDF board, hinge or
  slide; thickness, brand, decor group and sheet size. The manager adds the colour and where
  the board is used.
  - The new entry goes into the catalog extension (ADR-017) as before, so it is append-only.
  - On save, the server links it to its 1C article and puts the 1C price (per sheet or per
    unit) into the price list under the new id. The article and price are not stored in the
    "Katalog" tab.
- "Kioskdan olish" hides an entry again; nothing is deleted.
- **1C is only read.** The token allows GET only, and the code sends nothing else. Nothing is
  ever written to 1C.
- **Pictures:** 1C has a picture field (`ФайлКартинки`), but it is empty for nearly every item
  (0 of 1000 chipboard items, 4 of 728 MDF, 0 hinges). The attached-files catalog is not
  published to OData either. Decor photos stay a manager upload (D-21).
- Server: `/api/erp` gains the actions `kinds` and `items`. 1C refuses `$expand` together
  with `$inlinecount`, so the item count is a request of its own.

## Update (D-32, D-33, 2026-11-24): search by section; mechanisms from 1C with customer info

- **Groups.** Each top 1C item kind belongs to one group:
  - material: ЛДСП, ЛМДФ, Кромка, Столешницы, …;
  - hardware: INFINITY (Hettich and other brands), Yechim (Samet, Camet, Mesan, Cebi, …),
    NUOMI, Опора;
  - other.

  The default comes from the kind's name. The manager changes it in "1C katalogi"; the choice
  is saved with the prices (sheet rows `erp_tur`).

- **Search by section.** The "1C" search beside a 1C code looks only in its section's group:
  - the Materials page searches materials;
  - a hinge row searches hinges, and a slide row slides (by the 1C kind path or the name).
- **«+ Yangi furnitura»** now starts in 1C:
  1. choose hinge or slide;
  2. search among hardware only (each result shows its price, stock and 1C kind);
  3. pick an item;
  4. set the brand (the brand group in the kiosk), the model, soft close and a **text for the
     customer**.

  On "Saqlash" the item is linked to its 1C article and priced from 1C. An item 1C does not
  have can still be added by hand.

- **Customer info.** An added mechanism carries `info` (up to 400 characters) and a `photoUrl`.
  Both are visual only and may change at any time. The photo is uploaded on the manager page
  with "Ma'lumot / rasm" (the decor-photo store), and both are kept in the Katalog tab
  (columns 15 and 16). The kiosk's hardware card shows them under the brand heading.
- Some 1C items are sets with price 0 (e.g. "Комплекты SENSYS"). For those, the manager links
  the piece article or types the price.
