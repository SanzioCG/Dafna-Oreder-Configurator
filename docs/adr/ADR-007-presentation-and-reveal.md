# ADR-007: Themes, dimension overlay, smart camera, presentation and reveal

- Status: accepted (D-3a)
- Date: 2026-11-05

## Context

The designer brief asked for a light/dark theme, cleaner dimensions, a camera that follows the
customer's selection, and a final "presentation" moment before confirming. Product decisions
override parts of it:

- Colours stay logo-verified: `--brand-blue #009FE2`, `--brand-graphite #2A2928`.
- `--success #20B85A` comes from the designer.
- The layout language stays: page background + configurator sheet + cards, with no redesign.
- No emoji in UI text; SVG icons instead.
- Customers see centimetres; staff see millimetres.

No backend exists yet, so nothing may pretend to submit an order.

## Decisions

### 1. Themes

- `<html data-theme="light|dark">`.
  - Light tokens live in `theme/tokens.css` (default).
  - Dark overrides live in `theme/tokens.dark.css`, one tokens file per theme.
- Dark values:
  - bg `#101216`, surface `#191D24`, text `#F4F5F2` (designer).
  - Neutrals and status surfaces are derived.
  - Pastel card fills are darker and desaturated, keeping the hue of each card type.
- Theme source:
  - Kiosk default from `VITE_KIOSK_THEME` (per deployment), overridable with `?theme=`.
  - The customer's toggle in the sheet header is stored per device. Storage access is wrapped
    in try/catch; if storage fails, the toggle still works but is not remembered.
  - `resetTheme()` returns to the kiosk default; the D-3b session reset must call it.
- The logo swaps to `dafna-logo-white.svg` on dark.
- 3D in dark:
  - The canvas sits on a mid-dark radial stage (`--stage-bg`, centre `#353A43`) that fades into
    the near-black page, not on black.
  - Lighting is identical in both themes, so decor colours render the same pixel values.
  - Edge outlines are lighter tokens (`--edge-on-light-decor #8A9099`,
    `--edge-on-dark-decor #D3D7DD`).
  - The floor shadow is black at 0.85 opacity, so it stays visible.
  - The tokens are read at render time, and the provider sets `data-theme` synchronously
    before the scene re-renders.

### 2. Dimension overlay

- One SVG over the 3D zone replaces the drei lines and the DOM labels.
- React renders the structure once per spec change. A projector inside the canvas render loop
  writes the projected coordinates into the elements through refs, so there is no React state
  during camera motion.
- Brand-blue lines, perpendicular end ticks (no arrowheads), pill labels on the theme surface.
  Stroke widths are in rem, so they scale to 4K.
- Primary dimensions (overall W / H / D) are always shown.
- Secondary dimensions (section widths) appear only on the interior and doors steps, and only
  while the sections are visible (no doors, or doors open). They never appear in presentation.
- Label collisions (pure function):
  - Primary labels never move.
  - A secondary label is offset up, then down; if it still overlaps, it is hidden.
- Values come from engine output only (`result.dimensions`, `section.innerWidthMm`).
- Formatting:
  - Customer: cm, one decimal at most, decimal comma (`136 sm`, `65,6 sm`).
  - Staff: mm.

### 3. Smart camera

- Pure pose math lives in `viewer/framing.ts` and reuses `fitDistance`:
  `fitToModelPose`, `fitToSelectionPose`, `interpolatePose`, `easeInOutCubic`.
- `CameraRig` exposes `animateCameraTo(pose, ms)`, `fitToModel`, `fitToSelection` and
  `resetCamera`.
- Moves are 600 ms, ease-in-out. `highlightSelection` is the existing SectionPicker outline,
  now also on the doors step.
- Triggers are explicit selections only:
  - A section tab or a 3D tap frames the section (interior step) or its door(s) (doors step).
  - Entering the size or colour step frames the full model.
- Parameter changes keep the existing smooth re-fit. Camera moves never rebuild geometry.
- A move requested while a pointer is down on the 3D zone waits for release
  (`DeferredCommand`; the latest request wins). A user gesture cancels an automatic move.
  "Markazlash" stays.

### 4. Presentation ("Ko'rib chiqish") and reveal

- The sheet and step navigation hide, the 3D fills the screen, and the logo sits top-left.
- The reveal is a pure timeline (`presentation/reveal.ts`) plus a `RevealDirector`.
  - It is driven from the existing render loop: the door progress goes into a ref read by every
    leaf, which swings around its real hinge pivot.
  - Leaves on a shared partition open to 85°, so they never intersect.
  - The sway orbits the camera around the showcase target, so the overlay stays attached.
  - Confetti is drawn on a 2D canvas from the same loop.
  - React only receives the discrete events: doors closed, title, done.

| Phase     | Full  | Short |                                                                 |
| --------- | ----- | ----- | --------------------------------------------------------------- |
| showcase  | 0.8 s | 0.3 s | three-quarter showcase pose, doors open (if any)                |
| close     | 1.2 s | 0.9 s | doors close, ease-in-out                                        |
| sway      | 4.5 s | —     | turntable ±35° and back (not 360°: the back panel faces a wall) |
| settle    | —     | 0.3 s |                                                                 |
| celebrate | 1.5 s | —     | confetti (brand colours) + "Ajoyib tanlov!" + SVG success icon  |

- Which reveal plays:
  - Full: first presentation of a configuration revision in the session.
  - Short (≤ 1.5 s, no confetti): presented again after an edit.
  - None: the configuration is unchanged.
  - Final state directly: `prefers-reduced-motion`.
- The revision is the serialized params.
- Double triggers are ignored: `start` is a no-op while a reveal is running.
- "O'tkazib yuborish" (skip, top-right) is visible during the whole sequence and jumps to the
  final state.
- Orbit is locked only while the reveal runs. The dt clamp is 0.25 s per frame, so slow frames
  drop frames instead of stretching the sequence.

### 5. Stable state and flow

- Summary card:
  - Placed on the right, never over the wardrobe centre.
  - Shows size, corpus and door decor, sections with presets, and door types, all from the
    engine result.
  - Each row's "o'zgartirish" returns to its step with the selection intact.
- Buttons: green "Konfiguratsiyani tasdiqlash" and secondary "Konfiguratsiyani tahrirlash".
  They appear as soon as the doors have closed.
- Flow state machine (`state/flow.ts`, unit-tested):
  - `configurator → presentation → ready_to_confirm → contact`.
  - `edit` returns from presentation / ready_to_confirm to the configurator.
  - `back` goes from contact to ready_to_confirm.
  - Anything else is rejected.
- Animation state and the future submission state are independent of the flow.
- `contact` is a placeholder until D-3b:
  - Customers see "Tez orada"; staff see a TODO marker.
  - "Orqaga" returns.
  - Nothing is submitted and no order number is shown.

## Consequences

- Viewers that need the 3D scene in tests mock `Scene`. The reveal, camera and overlay logic is
  pure and unit-tested; the in-canvas drivers are thin.
- Unconfirmed / to review with the designer:
  - Dark neutrals, pastels and stage colours.
  - Reveal durations.
  - The ±35° sway.
  - The 600 ms camera move.
  - The selection framing direction (`SELECTION_VIEW_DIR`).
  - The label collision rule.
- Not measured: real fps at 4K. The in-app test browser throttles background panes to about
  2 fps, so the reveal still needs a timing check on the kiosk hardware.
