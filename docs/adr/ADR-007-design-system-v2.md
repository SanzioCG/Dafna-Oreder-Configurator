# ADR-007: Design system V2 (flat UI, semantic tokens, White / Dark, contrast gate)

- Status: accepted (D-3a, "DAFNA Configurator V2"); replaces the pastel / sheet visual language
  of the first D-3a draft (Nunito Sans, pastel card fills, Light default). **Component styling
  superseded by V3 "Bold Bento" (D-4, section below).** The token architecture, Inter, lucide
  icons, Dark default, staff-only theme switch and the contrast gate remain.
- Date: 2026-11-05

## D-4 update: design system V3 "Bold Bento"

Goal: playful bold bento — colored rounded cards, chunky pills, a black selected state, and
**no thin light / grey outlines anywhere**. The wardrobe stays the only photorealistic element.

### Tokens

Light values live in `tokens.css`, Dark values in `themes.css`.

| Token        | Light     | Dark      | Use                      |
| ------------ | --------- | --------- | ------------------------ |
| `--bg`       | `#F5F6F8` | `#191D24` | page and panel           |
| `--viewport` | `#EEF0F2` | `#242A33` | 3D zone                  |
| `--text`     | `#191D24` | `#F4F5F2` | text on `--bg`           |
| `--text-2`   | `#646A73` | `#8E949E` | secondary text on `--bg` |

These tokens are the same in both themes:

| Token                          | Value     | Use                                     |
| ------------------------------ | --------- | --------------------------------------- |
| `--ink`                        | `#191D24` | outlines, selected fill, text on pastel |
| `--on-ink`                     | `#FFFFFF` | text on `--ink`                         |
| `--paper`                      | `#FFFFFF` | unselected pill / card fill             |
| `--primary`                    | `#009FE3` | "Keyingi"                               |
| `--success`                    | `#20B85A` | "Tasdiqlash"                            |
| `--on-primary`, `--on-success` | `#191D24` | text on action buttons                  |
| `--step-size`                  | `#B9F0D3` | step 1 card (mint)                      |
| `--step-color`                 | `#FFE680` | step 2 card (yellow)                    |
| `--step-interior`              | `#CFC6FF` | step 3 card (lavender)                  |
| `--step-review`                | `#009FE3` | step 4 (cyan)                           |
| `--accent-peach`               | `#FDCDBD` | consultant, info cards                  |

The error colour is `#C93838` (Light) and `#F06B6B` (Dark). The step colours are unconfirmed.

### Shape

- Cards have a 28 px radius. Pills and buttons are fully rounded.
- Round icon buttons and steppers are 64 px.
- Text is Inter with bold headings; sizes use tabular numerals.

### Outline rules (enforced)

| Element                                                         | Light                                 | Dark                      |
| --------------------------------------------------------------- | ------------------------------------- | ------------------------- |
| Inside colored cards: pills, steppers, toggles, chips, swatches | `--line-in-card`, 2 px `--ink`        | same                      |
| Cards and buttons placed directly on the page                   | `--line-on-bg`, 2.5 px `--ink`        | none (separation by fill) |
| Focus                                                           | `--focus-line`, 3 px `--ink`, no glow | same                      |

- States:
  - Selected: solid `--ink` fill + white text.
  - Unselected: `--paper` fill + `--ink` text.
  - Disabled: 50 % opacity, with a plain reason below.
  - Pressed: scale 0.97.
- Toggles: ON is an `--ink` track with a white knob; OFF is a `--paper` track with an
  `--ink`-outlined knob.
- Option icons sit in a round `--ink` badge with a white glyph.
- Enforcement:
  - `theme/lines.test.ts` checks the line token values.
  - `theme/outline.test.ts` checks every `border` / `outline` in `styles.css`: each must be
    `0`, `none` or a line token, with no width / colour overrides and no V2 grey tokens.

### Contrast (gate, `theme/contrast.test.ts`)

Text pairs, 4.5:1 or more:

| Pair                | Ratio                    |
| ------------------- | ------------------------ |
| `--ink` on paper    | 16.90                    |
| white on `--ink`    | 16.90                    |
| `--ink` on mint     | 13.25                    |
| `--ink` on yellow   | 13.59                    |
| `--ink` on lavender | 10.60                    |
| `--ink` on cyan     | 5.69                     |
| `--ink` on peach    | 11.79                    |
| `--ink` on success  | 6.49                     |
| text on bg          | Light 15.63 / Dark 15.44 |
| text-2 on bg        | Light 5.04 / Dark 5.54   |
| error on bg         | Light 4.73 / Dark 5.65   |

- Selected vs unselected (`--ink` vs `--paper`) and the toggle states must be 3:1 or more.
- **Boundary contrast is not required for text-labelled controls.** An unselected pill is
  identified by its label and the `--ink` / `--paper` inversion, not by a grey hairline. This
  replaces the V2 `--border-control` 3:1 rule, and `--border-control` is no longer used.

## Context

The kiosk UI needs one consistent, flat visual language. In it the wardrobe is the only
photorealistic element. The UI also has to be readable from standing distance in a bright
showroom (White) and a dimmed one (Dark), on 1080p and 4K screens.

## Decisions

1. **Flat 2D vector UI.**
   - Solid fills, one radius scale (8 / 12 / 16 px at 1080p), 1 px control borders.
   - No gradients, no neumorphism, no decorative layers, no pastel card fills, no nested cards.
   - Groups in the panel are separated by spacing and a divider.
   - Shadows only on overlays floating over the 3D (toast, summary, title).
2. **Semantic tokens.**
   - `theme/tokens.css` holds the shared scales plus the White theme; `theme/themes.css` holds
     Dark (`<html data-theme="dark">`); `theme/typography.css` holds type.
   - Brief values are used, with these deliberate deviations, all found by the contrast test:
     - **Dark `--text-2` = `#8E949E`** (brief `#858B95`). The brief value measured **4.21:1** on
       `--surface #242A33`, below the 4.5:1 text minimum.
     - **White `--viewport-bg` = `#EEF0F2`**. A first, slightly darker grey (`#E6E8EB`) measured
       2.89:1 against the dimension lines.
     - **`--border` is decorative only** (dividers, table rules): `#D9DDE2` measures 1.36:1 on
       white.
     - **`--border-control`** (White `#80868F`, Dark `#737A86`) is a new token for the
       boundaries of interactive controls (inputs, unselected options, slider track). It passes
       3:1 on `--bg` and `--surface` in both themes.
   - `--on-primary` / `--on-success` are `#191D24` in both themes (dark text on blue / green).
3. **Selection contract.** Selected options use the `--primary` fill and a 3 px
   `--primary-strong` border, so the state differs by border thickness and not by colour only.
   - Unselected: surface fill + 1 px control border.
   - Disabled: neutral fill and muted text, with a human reason always visible (never an error
     code).
   - Focus: 3 px `--primary-strong` ring plus a soft halo.
4. **Typography.**
   - Inter, self-hosted (`@fontsource/inter`, latin + cyrillic, weights 400–700).
   - One scale of sizes (12–36 px at 1080p), weights, line heights and letter spacing.
   - Tabular numerals for dimensions.
5. **Icons.**
   - `lucide-react` for general UI: arrows, check, plus / minus, sun / moon, consultant
     (headset), reframe, warning, success.
   - A custom inline-SVG set for the interior presets, on the same 24×24 viewBox with a 2 px
     stroke.
   - No emoji anywhere.
6. **Themes.**
   - Dark is the default kiosk theme. `VITE_KIOSK_THEME=dark|white` per deployment, `?theme=`
     per URL.
   - Only staff can switch the theme (header icon button). The choice is stored per device
     (try/catch storage) and never resets the configuration.
   - No customer toggle.
   - Logo: `dafna-logo.svg` on White, `dafna-logo-white.svg` on Dark (SVGs unchanged).
   - 3D viewport: graphite `#242A33` (Dark V2.1) or light grey `#EEF0F2` (White).
   - Lighting is identical in both themes, so decor colours render the same.
   - Edge outlines and the contact shadow switch tone per theme.
7. **Automated contrast gate.**
   - `theme/contrast.test.ts` reads the token values from the CSS files, computes WCAG relative
     luminance and fails the test step (and so the gate) below:
     - text 4.5:1;
     - large text 3:1;
     - UI boundaries and focus indicators 3:1.
   - Both themes are checked. Vitest normally ignores CSS; only the two token files are let
     through (`vite.config.ts`).
8. **Components (`src/ui`).**
   - New: `Button`, `IconButton`, `StepNavigation`, `DimensionControl` (Slider + NumberField +
     ± buttons, min / max labels), `SectionSelector`, `StatusMessage`.
   - Renamed: `SelectionGrid` (was Segmented), `MaterialSwatch` (was SwatchPicker),
     `ConfigurationSummary` (was the presentation SummaryCard).
   - Reused: `ResetToast` (on `StatusMessage`), `ParamControl`, `InteriorStep`.
9. **Units.** Millimetres in both modes. The first D-3a draft showed centimetres to customers;
   the cm formatter is kept.

## Layout (V2)

- 3D viewport ~65 % and configuration panel ~35 %, at full height; the page never scrolls.
- The panel holds:
  - the logo;
  - "Konsultant chaqirish" (customers) and the language switch;
  - StepNavigation;
  - independently scrolling step content;
  - a fixed footer: Orqaga · "Tayyor — ko'rib chiqish" (steps 1–4) · Keyingi.
- "Konsultant chaqirish" appears on every customer screen (configurator, presentation,
  contact).
  - It fires `kiosk.requestConsultant()` (D-3a.1: and opens the honest 1408 modal), a
    `dafna:consultant-request` window event
    carrying the step / flow state and the configuration revision.
  - Delivery to staff comes with D-2a. No confirmation is shown until then, because nothing is
    delivered yet.

## Dark theme V2.1 "Deep Graphite" (D-3a.1)

- `--bg` / `--panel` (panel, header, footer): `#191D24`.
- `--surface` (inputs, controls) and the 3D viewport: `#242A33`.
- `--divider` `#363D47` (decorative only). `--text` `#F4F5F2`.
- `--text-2` `#8E949E` (approved). `--primary` / `--primary-strong`: `#009FE3`.
- `--border-control` is `#737A86`: the brief's example `#6B7380` measured only 3.02:1 on
  `--surface`. White values are unchanged; `--border` was renamed `--divider`, and `--panel` was
  added (White `#FFFFFF`).
- Measured (WCAG):

  | Pair                      | Ratio |
  | ------------------------- | ----- |
  | text on bg / panel        | 15.44 |
  | text on surface           | 13.20 |
  | text-2 on bg              | 5.54  |
  | text-2 on surface         | 4.73  |
  | border-control on bg      | 3.91  |
  | border-control on surface | 3.34  |
  | primary on bg             | 5.69  |
  | primary on surface        | 4.86  |
  | on-primary on primary     | 5.69  |
  | error on surface          | 4.83  |

- 3D Dark lighting:
  - The key and hemisphere lights are the same as in White, so decor colours do not shift.
  - A shadowless rim light from behind (`--rim-light`, Dark only) plus light edge outlines
    (`#C9CED6` on dark decors) separate Antratsit from the background.
  - The contact shadow is softened to 0.75 opacity.

## Product decisions (D-3a.1)

- UX-02: the SHELF_SPAN block stays for customers because of the physical sag risk. The 900 mm
  value stays unconfirmed until Dafna confirms it.
- UX-07: until D-2a, "Konsultant chaqirish" opens an honest modal with a close button: "Yaqin
  atrofdagi Dafna xodimiga murojaat qiling yoki qo'ng'iroq qiling: 1408" (uz / ru). The internal
  event is kept for D-2a; nothing claims a request was sent.

## Consequences

- Every new colour must be a token in the theme files, and the contrast test decides whether it
  is acceptable.
- Values to review with the designer:
  - the deviations above;
  - the disabled fill and text tones;
  - the 3D viewport greys.
