# ADR-016: Live prices, server-side quote and the manager page

- Status: accepted (D-19, 2026-11-23)
- Replaces: the client-side DEMO price of ADR-015 (D-9) and D-18

## Context

Dafna wants real prices in the kiosk. Board (sheet) prices live in Dafna's ERP. Hardware,
labour, edge band, assembly and the profit % are set by a manager and change over time.
Customers must see only the final price, never the costs or the profit %.

## Decision

1. **Price list = data the manager keeps.** `PriceList` gains `boardSheets` (price of one
   sheet + sheet size, by material id; converted to a per-m² price, and it wins over the per-m²
   lists) and `assembly` (per product type). The profit is `markupPct` of all costs together
   (boards with waste, edge band, hardware, labour, assembly).
2. **Stored in the Google Sheet**, tab `Narxlar`, as a readable table (Turi, Kod, Nomi, Narx,
   sheet size). The manager page rewrites the tab on save. Until the first save the DEMO list is
   used and the kiosk marks the price "sinov narxi".
3. **The price is computed on the server** (`POST /api/quote` with the product, template
   version and params). The kiosk never downloads the price list. A customer gets
   `{total, currency, demo, priceListVersion}`. Staff (consultant PIN, kept in memory only) and
   the manager also get the breakdown. Each warm instance caches the list for 60 s.
4. **Manager page** `/manager`, with its own PIN (`MANAGER_PIN`, Vercel env), separate from
   the consultant PIN. It edits the profit %, labour per m², edge band per metre, assembly per
   product, sheet prices and hardware prices. It shows the resulting price of each product's
   default model before saving. Requests are rate limited per IP and the PIN is sent in a
   header.
5. **ERP.** Sheet prices will be read from Dafna's ERP. Until it is connected they are typed on
   the manager page, and the page says so. The ERP adapter will fill `boardSheets` and nothing
   else.

## Consequences

- The price needs the network: while `/api/quote` is unreachable no price is shown (never a
  stale or invented one).
- Tests compute the price locally with the DEMO list (no server in jsdom).
- New env var: `MANAGER_PIN`. No new service: the existing Google service account and sheet
  are used.
