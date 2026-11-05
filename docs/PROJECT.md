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

| Batch  | Scope                                                                                                                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-0    | Engine + shkaf carcass + 3D viewer + step UI                                                                                                                                                          |
| D-1a   | Material catalog, colour step, depth definition (ADR-003), hinged overlay doors, order draft 0.1                                                                                                      |
| D-1b   | Interior fill per section, door leaf/hinge rule fixes (ADR-006), production-ready panel fields, order draft 0.2 (ADR-005)                                                                             |
| D-1c   | Leaves may share a partition (ADR-006 revised), hinge mount per leaf, default depth 600, order draft 0.3                                                                                              |
| D-3a   | Design system V2 (tokens, White/Dark, Inter, contrast gate), redesigned steps, SVG dimension overlay, smart camera, full-screen presentation with 360° reveal, confirm entry, flow (ADR-007, ADR-008) |
| D-3a.1 | Plinth construction (sides to the floor, ADR-009), Dark theme V2.1 Deep Graphite, consultant modal (1408), audit fixes                                                                                |
| D-4    | Bold Bento design system (Dark + Light), simplified customer flow (start screen, 4 steps, plain language, cm), staff settings cards, presentation final (ADR-007, ADR-010)                            |
| D-4.1  | Presentation polish (8 s reveal, camera tour, candy shower), footer pill, customer theme toggle                                                                                                       |
| D-5    | Contact screen + on-screen keyboard, /api/submit (Google Sheets + Telegram, idempotent IDs), retry cron, submitted screen + session reset, regenerateApplication (ADR-011)                            |
| D-2a   | Backend: projects, branches/devices, customer confirmation, status model, audit log, outbox, Telegram notification, sales panel                                                                       |
| D-2b   | CRM adapter                                                                                                                                                                                           |
| D-3b   | Contact form + submission, server-side PDF, QR, on-screen keyboard, idle timeout / session reset                                                                                                      |
| later  | Price, tumba, stol, website API                                                                                                                                                                       |

### Roadmap after D-5 (from "Tasdiqlandi" leads)

- **Hardware** (hinges, rails, drawer slides, handles) is added to the configurator and to the
  template; a new template version, with a new application fixture (ADR-011 freeze rule).
- **Constructor / production hand-off**: only leads with status `Tasdiqlandi` are processed;
  the full order draft comes from `regenerateApplication(params, templateVersion)`.
- **Bazis / GibLab export** from the regenerated order draft (panels, edges, operations).
- **Status UI / CRM** replaces the manual sheet dropdown (`LeadStore` adapter).
- **Data localization**: move storage to a server in Uzbekistan if the legal review requires it.
- **QR / public result page** for the customer (needs a protected page, not in D-5).

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

## Visual language (design system V3 "Bold Bento", ADR-007)

Single source: `apps/web/src/theme/`.

- `tokens.css` holds Light plus the shared tokens, `themes.css` holds Dark, `typography.css` holds
  Inter.
- `theme/contrast.test.ts` checks every text / background and state pair (WCAG).
- `theme/lines.test.ts` and `theme/outline.test.ts` enforce the outline rules.
- All three run in the gate.

Rules:

- **Bold bento:** colored rounded cards (28 px), chunky pills, round 64 px icon buttons, and a
  black (`--ink`) selected state with white text. No thin light / grey outlines anywhere. The
  wardrobe is the only photorealistic element.
- **Outlines:**
  - Inside colored cards: 2 px `--ink`.
  - Directly on the page: 2.5 px `--ink` in Light, none in Dark.
  - Focus: 3 px `--ink`, no glow.
- **Layout:**
  - The 3D zone takes about 60 % and stays neutral (`--viewport`).
  - The panel takes about 40 % (`--bg`). It holds the header (logo per theme, language pill,
    peach "Konsultant chaqirish"), the step pills, one colored card per step, and a fixed footer
    (Orqaga · Tayyor — ko'rib chiqish · Keyingi).
  - The page never scrolls.
- **Customer flow** (ADR-010): start screen with ready-made models, then Joy (mint), Rang
  (yellow), Ichki (lavender) and Ko'rib chiqish (cyan).
  - Plain language: no codes and no engineering words.
  - Sizes are shown in whole centimetres.
- **Staff:** the same steps and look, plus a collapsible "Xodim sozlamalari" card in each step
  (all engine parameters, issues, order draft JSON). Staff see millimetres.
- **Themes:**
  - Dark is the default kiosk theme (`VITE_KIOSK_THEME=dark|white`).
  - Only staff can switch it. `?theme=` works only in staff mode or a dev build.
  - Switching never resets the configuration.
- **Customer mode** disables every option that would produce an engine error or a customer-
  blocking warning. A plain reason is shown, for example "Bu kenglikda javon egilib qoladi".
  Staff mode keeps every option selectable and shows the issue.
- **Never change a customer choice silently:** every auto-reset shows a peach toast in plain
  words. It is dismissible and disappears after 3 s.
- **Dimension overlay / smart camera / presentation / flow:** see ADR-008. The presentation shows
  no dimension overlay and no particles; the wardrobe stands on a minimal platform.
