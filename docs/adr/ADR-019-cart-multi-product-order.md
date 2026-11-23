# ADR-019: Several products in one order (cart, D-25)

- Status: accepted (D-25, 2026-11-23)
- Builds on: ADR-011 (submission pipeline, reproducible applications)

## Context

One customer may want a wardrobe, two pedestals and a desk. Until now one application held
one product, and the customer had to fill in the contact form once for each product.

## Decision

- **Kiosk.**
  - In the presentation, "Savatga qo'shish va yana tanlash" puts the product on screen in the
    cart, with its render and price, and returns to the product cards.
  - A "Savat (n)" button opens the cart sheet. Each product there has a picture, size, decors
    and price, pieces − / +, "O'zgartirish" (back into the configurator) and "O'chirish". The
    sheet shows the total and "Buyurtma berish".
  - "Hammasini buyurtma qilish" in the presentation sends the cart together with the product on
    screen. Both paths use one contact form.
  - The cart lives in memory only, so a session reset empties it.
  - Limits: at most 5 products, each at most 10 pieces.
- **API.** `POST /api/submit` takes `items: [{product, params, quantity, renderPng?}]`. The
  single form (`product` / `params`) still works for older kiosks.
  - The engine re-validates every product. If one product is invalid, the whole order is
    refused.
  - Each product becomes **its own application**: sheet row, ID, order sheet, GibLab file and
    assembly link, so production and regeneration stay one product per application.
  - The products are linked by the new columns `Buyurtma` (order ID = the first product's ID),
    `Buyurtmada` ("2/3") and `Soni` (pieces), appended so existing sheets keep their columns.
  - Idempotency: the request key covers product 1, then `key~2`, `key~3`, …. A resend stores
    only the products that are missing.
- **Telegram.** One message per product, with its own files. Each message names the order and
  its place ("🧾 Buyurtma … · 2/3 mahsulot") and the number of pieces.
- **Submitted screen.** It shows the order number and every product with its ID and its own
  assembly QR code.
