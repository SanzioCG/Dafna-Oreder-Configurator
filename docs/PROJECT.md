# Dafna Configurator — project context

## Product

Dafna (a division of EMAN) manufactures its own furniture and runs many showroom branches.
The goal is a **self-service configurator on a large landscape touchscreen** in each showroom.

Flow: customer configures furniture → reviews → confirms the order → the sales department
receives it (Telegram + Dafna CRM) → sales calls the customer to double-check → production.

The customer receives a PDF with the **visual result**: render, views, overall dimensions,
specification. It is **not** a production/detail drawing.

Planned categories: **shkaf** (wardrobe), **tumba**, **stol**. Price, backend, CRM and PDF
come in later batches.

## Batch plan

| Batch | Scope                                                                                                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-0   | Engine + shkaf carcass + 3D viewer + step UI                                                                                                                                                          |
| D-1a  | Material catalog, colour step, depth definition (ADR-003), hinged overlay doors, order draft 0.1                                                                                                      |
| D-1b  | Interior fill per section, door leaf/hinge rule fixes (ADR-006), production-ready panel fields, order draft 0.2 (ADR-005)                                                                             |
| D-1c  | Leaves may share a partition (ADR-006 revised), hinge mount per leaf, default depth 600, order draft 0.3                                                                                              |
| D-3a  | Design system V2 (tokens, White/Dark, Inter, contrast gate), redesigned steps, SVG dimension overlay, smart camera, full-screen presentation with 360° reveal, confirm entry, flow (ADR-007, ADR-008) |
| D-2a  | Backend: projects, branches/devices, customer confirmation, status model, audit log, outbox, Telegram notification, sales panel                                                                       |
| D-2b  | CRM adapter                                                                                                                                                                                           |
| D-3b  | Contact form + submission, server-side PDF, QR, on-screen keyboard, idle timeout / session reset                                                                                                      |
| later | Price, tumba, stol, website API                                                                                                                                                                       |

## Principles

- All dimensions in millimetres; the engine is the single source of truth for geometry.
- Product templates are data (JSON) + generator code (see ADR-002).
- **Never hide assumptions.** Every construction value not confirmed by Dafna production carries
  `unconfirmed: true` and a `note` in the template, and is marked in staff mode.
- Customer mode never shows technical warnings or unconfirmed markers.

## Glossary (uz / ru / en)

| O'zbekcha            | Русский              | English                  | Engine key / role   |
| -------------------- | -------------------- | ------------------------ | ------------------- |
| shkaf                | шкаф                 | wardrobe                 | `wardrobe`          |
| tumba                | тумба                | cabinet / nightstand     | —                   |
| stol                 | стол                 | table / desk             | —                   |
| korpus               | корпус               | carcass                  | —                   |
| yon devor (bokovina) | боковина             | side panel               | `side`              |
| usti (qopqoq)        | крыша                | top panel                | `top`               |
| tagi (dno)           | дно                  | bottom panel             | `bottom`            |
| to'siq (peregorodka) | перегородка          | vertical partition       | `partition`         |
| orqa devor           | задняя стенка        | back panel               | `back`              |
| tsokol               | цоколь               | plinth                   | `plinth`            |
| bo'lim (seksiya)     | секция               | section (bay)            | `sections`          |
| javon (polka)        | полка                | shelf                    | `shelf`             |
| shtanga              | штанга               | hanging rail             | `rail`              |
| tortma               | ящик                 | drawer (internal)        | `drawer_*`          |
| eshik                | дверь                | door                     | D-1                 |
| fasad                | фасад                | front (door/drawer face) | D-1                 |
| LDSP                 | ЛДСП                 | laminated chipboard      | `ldsp`              |
| HDF                  | ХДФ (ДВП)            | high-density fibreboard  | `hdf`               |
| kromka               | кромка               | edge banding             | —                   |
| kenglik              | ширина               | width                    | `width`             |
| balandlik            | высота               | height                   | `height`            |
| chuqurlik            | глубина              | depth                    | `depth`             |
| qalinlik             | толщина              | thickness                | `thicknessMm`       |
| javon egilishi       | прогиб полки         | shelf sag (span limit)   | `SHELF_SPAN`        |
| nakladnoy eshik      | накладная дверь      | overlay door             | `door`              |
| bir / ikki tabaqali  | одно- / двустворч.   | single / double door     | `single_*`/`double` |
| ilmoq (petlya)       | петля                | hinge                    | `hingeSide`         |
| tirqish              | зазор                | gap                      | `doorGap*Mm`        |
| dekor                | декор                | decor (colour/pattern)   | `decorName`         |
| korpus chuqurligi    | глубина корпуса      | carcass depth            | `carcassDepthMm`    |
| ichki to'ldirish     | наполнение           | interior fill            | `interior1..4`      |
| kromka (ABS)         | кромка (ABS)         | edge band                | `edges`             |
| tola yo'nalishi      | направление текстуры | grain direction          | `grainDirection`    |

## Visual language (design system V2, ADR-007)

Single source: `apps/web/src/theme/` — `tokens.css` (shared scales + White), `themes.css` (Dark),
`typography.css` (Inter, self-hosted latin + cyrillic). Every text / background and boundary
pair is checked by `theme/contrast.test.ts` (WCAG; part of the gate).

- **Flat 2D vector UI:** solid fills, one radius scale, no gradients, no pastel card fills, no
  nested cards; shadows only on overlays over the 3D. The wardrobe is the only photorealistic
  element.
- **Layout:** 3D viewport ~65 % | configuration panel ~35 % (surface colour): logo,
  "Konsultant chaqirish" (customers), language, StepNavigation (5 steps), independently
  scrolling step content, fixed footer Orqaga · "Tayyor — ko'rib chiqish" · Keyingi. The page
  never scrolls; nothing is hard-coded to one resolution (1 rem = 16 px at 1080p, 32 px at 4K).
- **Selection contract:** selected = `--primary` fill + 3 px `--primary-strong` border (differs by
  border thickness, not colour only); unselected = surface + 1 px control border; disabled =
  neutral fill + muted text + a short human reason (never an error code). Focus: 3 px ring + halo.
- **Themes:** Dark is the default kiosk theme (`VITE_KIOSK_THEME=dark|white`, `?theme=`); staff
  can switch it, customers cannot; switching never resets the configuration. Logo variant per
  theme. 3D lighting is the same in both themes; viewport background, edge outlines and contact
  shadow are themed.
- **Icons:** lucide-react + custom interior preset icons (24×24, 2 px). No emoji.
- **Units:** millimetres in both modes; the engine is the source of every dimension.
- **Customer mode** disables every option that would produce an engine error or a
  `SHELF_SPAN` / `RAIL_DEPTH_SHORT` / `RAIL_HEIGHT_SHORT` / `DRAWER_SECTION_TOO_WIDE` warning and
  shows a short reason; staff mode keeps everything selectable and shows the issue. Hidden from
  customers: order draft JSON, debug info, rule ids, validation logs, unconfirmed markers.
- **Never change a customer choice silently:** every auto-reset shows a toast (ResetToast on
  StatusMessage), dismissible, gone after 3 s.
- **Dimension overlay / smart camera / presentation / flow:** see ADR-008.
