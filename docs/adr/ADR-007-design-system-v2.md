# ADR-007: Design system V2 (flat UI, semantic tokens, White / Dark, contrast gate)

- Status: accepted (D-3a, "DAFNA Configurator V2"); replaces the pastel / sheet visual language
  of the first D-3a draft (Nunito Sans, pastel card fills, Light default)
- Date: 2026-11-05

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
   - 3D viewport: mid-dark neutral `#2E343D` (Dark) or light grey `#EEF0F2` (White).
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
  - It only fires `kiosk.requestConsultant()`, a `dafna:consultant-request` window event
    carrying the step / flow state and the configuration revision.
  - Delivery to staff comes with D-2a. No confirmation is shown until then, because nothing is
    delivered yet.

## Consequences

- Every new colour must be a token in the theme files, and the contrast test decides whether it
  is acceptable.
- Values to review with the designer:
  - the deviations above;
  - the disabled fill and text tones;
  - the 3D viewport greys.
