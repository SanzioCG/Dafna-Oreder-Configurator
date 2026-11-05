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

| Batch | Scope                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| D-0   | Engine + shkaf carcass + 3D viewer + step UI                                                                                    |
| D-1a  | Material catalog, colour step, depth definition (ADR-003), hinged overlay doors, order draft 0.1                                |
| D-1b  | Interior fill presets (shelves, rails, drawers)                                                                                 |
| D-2a  | Backend: projects, branches/devices, customer confirmation, status model, audit log, outbox, Telegram notification, sales panel |
| D-2b  | CRM adapter                                                                                                                     |
| D-3   | Confirmation screen, server-side PDF, QR, on-screen keyboard, kiosk mode                                                        |
| later | Price, tumba, stol, website API                                                                                                 |

## Principles

- All dimensions in millimetres; the engine is the single source of truth for geometry.
- Product templates are data (JSON) + generator code (see ADR-002).
- **Never hide assumptions.** Every construction value not confirmed by Dafna production carries
  `unconfirmed: true` and a `note` in the template, and is marked in staff mode.
- Customer mode never shows technical warnings or unconfirmed markers.

## Glossary (uz / ru / en)

| O'zbekcha            | Русский            | English                  | Engine key / role   |
| -------------------- | ------------------ | ------------------------ | ------------------- |
| shkaf                | шкаф               | wardrobe                 | `wardrobe`          |
| tumba                | тумба              | cabinet / nightstand     | —                   |
| stol                 | стол               | table / desk             | —                   |
| korpus               | корпус             | carcass                  | —                   |
| yon devor (bokovina) | боковина           | side panel               | `side`              |
| usti (qopqoq)        | крыша              | top panel                | `top`               |
| tagi (dno)           | дно                | bottom panel             | `bottom`            |
| to'siq (peregorodka) | перегородка        | vertical partition       | `partition`         |
| orqa devor           | задняя стенка      | back panel               | `back`              |
| tsokol               | цоколь             | plinth                   | `plinth`            |
| bo'lim (seksiya)     | секция             | section (bay)            | `sections`          |
| javon (polka)        | полка              | shelf                    | D-1                 |
| shtanga              | штанга             | hanging rail             | D-1                 |
| tortma               | ящик               | drawer                   | D-1                 |
| eshik                | дверь              | door                     | D-1                 |
| fasad                | фасад              | front (door/drawer face) | D-1                 |
| LDSP                 | ЛДСП               | laminated chipboard      | `ldsp`              |
| HDF                  | ХДФ (ДВП)          | high-density fibreboard  | `hdf`               |
| kromka               | кромка             | edge banding             | —                   |
| kenglik              | ширина             | width                    | `width`             |
| balandlik            | высота             | height                   | `height`            |
| chuqurlik            | глубина            | depth                    | `depth`             |
| qalinlik             | толщина            | thickness                | `panelThickness`    |
| javon egilishi       | прогиб полки       | shelf sag (span limit)   | `SHELF_SPAN`        |
| nakladnoy eshik      | накладная дверь    | overlay door             | `door`              |
| bir / ikki tabaqali  | одно- / двустворч. | single / double door     | `single_*`/`double` |
| ilmoq (petlya)       | петля              | hinge                    | `hingeSide`         |
| tirqish              | зазор              | gap                      | `doorGap*Mm`        |
| dekor                | декор              | decor (colour/pattern)   | `decorName`         |
| korpus chuqurligi    | глубина корпуса    | carcass depth            | `carcassDepthMm`    |

## Visual language

Single source: `apps/web/src/theme/tokens.css` (each value is marked verified from the logo /
dafna.uz CSS, or `[APPROX]`). Font: **Nunito Sans** (the site's font; the brief assumed Nunito),
self-hosted via `@fontsource/nunito-sans`, latin + cyrillic, weights 400–800.

- **Single-layer layout:** one page background (`--bg`). Left zone (60%) = transparent 3D
  canvas directly on the background, no frame, no floor plane (soft contact shadow only); the
  only place where orbit gestures work. Right zone = cards floating on the background
  (gap ≥ 24 px at 1080p), no panel container. Floating frosted bottom nav centred on the screen.
- **Selection state contract** (all option buttons/cards): selected = solid brand-blue fill +
  white text; unselected = white fill + graphite text; disabled = 40% opacity + short reason.
  Pastels are card backgrounds (one per option-card type, `--card-*`) and never indicate state.
- **Customer mode** disables door/interior options that would produce an engine error and
  shows the reason; if a size change invalidates the selected option, it falls back to the
  template default. Staff mode keeps every option selectable.
- **3D legibility:** dark edge outlines (light outlines on dark decors), one directional key
  light + hemisphere ambient, soft contact shadow under the footprint.
- Radii 32/20/12, pills, circular icon buttons, soft elevation, press scale 0.97.
- Still `[APPROX]`: `--accent-lavender` (not found on the dafna.uz home page).
