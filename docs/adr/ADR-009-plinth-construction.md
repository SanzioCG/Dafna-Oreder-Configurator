# ADR-009: Plinth construction — sides to the floor, strips between the sides

- Status: accepted (D-3a.1). The construction is **confirmed by Dafna**; the `plinthHeight` and
  `plinthRecess` values stay unconfirmed.
- Date: 2026-11-05

## Context

Up to template 0.4.0 the side panels stood on the plinth, which consisted of two full-width strips
(front and back). In three-quarter, side and back views — and during the presentation's 360°
turn — the open ends of the plinth showed as dark gaps under the carcass. Dafna confirmed how
their wardrobes are actually built.

## Decision (template v4, `templateVersion` 0.5.0, generator `wardrobe-carcass-v4`)

With `t` = corpus board thickness, `W` = width, `H` = height, `ph` = `plinthHeight`:

- **Side panels run the full height to the floor**: `H × Dc × t`, at y = 0…H. This applies to
  `base = plinth` and `base = none` alike.
- **Plinth strips sit between the side panels**: length `W − 2t`, height `ph`, thickness `t`,
  from x = t to x = W − t.
  - The front strip is set back from the carcass front by `plinthRecess`.
  - The back strip is flush with the carcass back.
- **The carcass bottom rests on the plinth strips** (bottom face at y = `ph`).
  - Carcass height is still `H − ph`.
  - Partitions still run between the carcass bottom and top.
- **Doors** still cover the carcass only (height = carcass height − 2 × edge gap), so the plinth
  stays visible below them.
- Overall width / height / depth are unchanged. So are `base = none`, the interior, and the
  overlay back panel, which still covers the carcass.

The result has no visible gaps under the carcass from any angle: the side panels close the
plinth at both ends, and the back strip closes it at the rear.

## Migration

- The order draft schema stays `dafna-order/0.3-draft`: no field changed.
- A draft made with an older template is re-generated with the current one.
  - With `base = plinth`, the panels differ: the side length and the plinth strip length. This is
    reported as a `MIGRATION_CONSTRUCTION_CHANGED` warning with `from` / `to` template versions.
    It is never silent.
  - With `base = none`, the geometry is identical, so there is no warning.
- The older chains (D-0, 0.1, 0.2) end in the same step. Their tests compare the result with the
  old fixtures through the ADR-009 transform (`test/construction.ts`): only the sides and the
  plinth strips change.

## Consequences

- Production lists change: side panels are `ph` longer, and plinth strips are `2t` shorter.
- The "open plinth ends" finding of ADR-008 is resolved.
- Still to confirm with Dafna: the `plinthHeight` default and range, and the `plinthRecess`
  default and range.
