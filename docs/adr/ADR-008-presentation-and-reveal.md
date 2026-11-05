# ADR-008: Dimension overlay, smart camera, presentation, reveal and flow

- Status: accepted (D-3a V2); supersedes the first D-3a draft, which had a ±35° sway, cm for
  customers and confetti over the whole screen
- Date: 2026-11-05

## Context

The configuration ends in a final presentation that must not look like another step. No backend
exists yet (D-2a), so the flow stops at a `contact` placeholder. Nothing may pretend to submit an
order.

## Decisions

### Dimension overlay

- One SVG over the 3D viewport. React renders the structure once per spec change; a projector in
  the render loop writes projected coordinates straight into the SVG elements through refs, so
  there is no React state per frame.
- Lines and end ticks in `--primary-strong`, no arrowheads; label pills on `--surface`.
- Primary dimensions (overall W / H / D) are always shown.
- Secondary dimensions (section widths) are shown only on the interior and doors steps, while
  the sections are visible. They are hidden in presentation.
- Collisions (pure function): primary labels never move; a secondary label is offset up, then
  down, otherwise hidden.
- Values come from engine output only, in millimetres.
- During the presentation turn the overlay applies the same rotation as the wardrobe.

### Smart camera (one controller: `CameraRig`)

- API:
  - `fitToModel`, `fitToSelection(box)`, `animateCameraTo(pose, ms)`, `resetCamera`;
  - `highlightSelection(id)`: outline in `--primary-strong`.
- Pose math lives in `framing.ts`. Moves are 600 ms, ease-in-out.
- `CameraAnimator`: a new move cancels the running one and continues from the current pose.
- Triggers:
  - Size and colour steps: full model.
  - Interior step: picking a section (tab or 3D tap) frames it. Changing its preset keeps the
    focus.
  - Doors step: picking a section frames its door(s).
- Touch rules:
  - The camera never moves while a pointer is down on the 3D zone.
  - A selection made during a gesture is applied after release (`DeferredCommand`).
  - A pointer coming down stops a move in progress.
  - User orbit / zoom stay available; "Markazlash" stays.
- No geometry rebuild for camera moves.

### Presentation (separate full-screen state)

- The panel and step navigation hide, and the 3D fills the screen.
- DAFNA logo, primary dimensions only, skip button top-right, "Konsultant chaqirish" for
  customers.

| Phase     | Full  | Short |                                                             |
| --------- | ----- | ----- | ----------------------------------------------------------- |
| showcase  | 0.8 s | 0.3 s | presentation framing, doors open (if any)                   |
| close     | 1.2 s | 0.9 s | doors close on their real hinge pivots, ease-in-out         |
| turn      | 8.0 s | —     | exactly one 360° turn, constant velocity, 0.3 s ramps       |
| settle    | —     | 0.3 s |                                                             |
| celebrate | 1.3 s | —     | small particles from the upper sides + success icon + title |

- **The turn rotates the wardrobe itself** (a `Turntable` group around the vertical axis through
  the product centre) instead of orbiting the camera. That way the key light reaches the back
  panel when it faces the viewer, and the floor shadow turns with the footprint. The angle
  profile `turnAngle(t)` has velocity `v = 2π / (T − ramp)` with linear-acceleration ramps, so
  the area under the velocity curve is exactly 2π and the turn ends at the showcase angle.
- Celebration:
  - Particles use the `--particle-1..3` tokens (#009FE3 / #20B85A / #FFFFFF).
  - They start in the outer 28 % bands at the top and drift outwards, so they never cover the
    model centre (tested).
  - Title "Ajoyib tanlov!" plus subtitle (uz / ru) with a green lucide success icon.
- Once per configuration revision, guarded against double triggers.
  - Short version after an edit: doors close only, no turn, no particles.
  - Unchanged configuration: no animation.
  - `prefers-reduced-motion`: final state.
- "O'tkazib yuborish" is visible during the whole sequence and jumps to the stable state.
- The confirm button appears as soon as the doors have closed; it does not wait for the turn.
- Everything runs in the existing render loop (refs), with no per-frame React re-render. The
  dt clamp is 0.25 s per frame.
- Skip and unmount clean up: door override released, turn reset to 0, particles cleared.

### Back of the wardrobe

During the turn the back is visible. With the defaults it looks finished:

- The HDF back panel (`hdf_white_3`, its real catalogue colour) covers the rear edges of sides,
  top and bottom: z = 0…3 mm, while the carcass starts at z = 3 mm.
- So there is no overlap and no z-fighting.
- The rear plinth sits 3 mm in front of the back plane, under it.

**Resolved in D-3a.1 (ADR-009):** the open plinth ends found here are gone. The side panels now
run to the floor and the plinth strips sit between them.

### Stable state and flow

- `ConfigurationSummary` is placed bottom-right, never over the wardrobe centre.
  - It shows size, corpus decor, door decor, sections with interior presets, and door type.
  - Each row has an "o'zgartirish" link back to its step, with the selection intact.
- Primary: "Konfiguratsiyani tasdiqlash" (`--success` fill, `#191D24` text) leads to `contact`.
- Secondary: "Konfiguratsiyani tahrirlash" returns to the configurator; nothing is lost.
- State machine (`state/flow.ts`, unit-tested):
  - `configurator → presentation → ready_to_confirm → contact`.
  - `edit` returns to the configurator.
  - `back` goes from `contact` to `ready_to_confirm`.
  - Anything else is rejected.
- Animation state and the future submission state are independent.
- `contact` is a placeholder until D-3b:
  - Customers see "Tez orada" + "Orqaga"; staff see a TODO marker.
  - No order numbers, statuses or submission results are shown or invented.

## Consequences / not yet measured

- FPS during the turn could not be measured in this environment: the in-app browser pane was
  hidden, which throttles requestAnimationFrame to about 2 fps. It needs a check on the kiosk
  hardware at 1080p and 4K.
- To confirm with the designer / Dafna:
  - the turn duration and ramps;
  - the celebration length and particle count;
  - the side-band width (28 %);
