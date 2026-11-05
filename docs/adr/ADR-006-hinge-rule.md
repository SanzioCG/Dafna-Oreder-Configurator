# ADR-006: Door leaf width, hinge sides and hinge mount

- Status: accepted (D-1c, revises the D-1b version of this ADR)
- Date: 2026-11-05

## Context

D-1a decided single vs double doors on the section **inner** width but checked DOOR_TOO_WIDE on
the **leaf** width. D-1b fixed that (decision 1 below, kept) and additionally introduced a rule
"no two leaves may hinge on the same partition" (`HINGE_CONFLICT`).

**Why that D-1b rule was wrong.** In real overlay-door wardrobes two leaves hinged on the same
partition are normal: each leaf covers half of the partition edge and uses a half-overlay hinge
(full overlay on the outer side panels). The only limitation is that two such leaves cannot
both be opened fully at the same moment — they do not collide in a way that makes the product
impossible. The rule therefore forbade valid, common layouts and had costly side effects:
two adjacent double doors were impossible, the default 1360 mm wardrobe was forced to 3
sections, 2 sections at 1360 were disabled for customers, no layout existed at 2400 mm with
doors (the customer width was held at 2399 with a toast), and 0.1 drafts with two adjacent
double doors could not be migrated.

## Decision

1. **One rule source, measured on the leaf** (unchanged from D-1b).
   `maxSingleLeafWidthMm = 600` (unconfirmed). A section's single-leaf width = its door coverage
   (partition centre line to partition centre line, outer edge at the ends) minus its gaps
   (1.5 mm at outer edges / next to an empty section, 1.5 mm = half of the 3 mm gap next to a
   doored section). `doors = auto`: single if that width ≤ 600, else double. `DOOR_TOO_WIDE`
   uses the same (rounded) leaf width.
2. **Leaves may share a partition.** No hinge constraint between sections; any combination of
   single/double doors is valid. `HINGE_CONFLICT` was removed entirely: with shared partitions
   allowed there is no remaining geometric impossibility for it to report.
3. **Single-door hinge sides: symmetric front, hinges towards the outer sides.** Section `i` of
   `n` hinges right if `i > (n − 1) / 2`, else left (a middle section of an odd count hinges
   left). Staff overrides (`doorSectionN`) are always respected.
4. **Hinge mount per leaf** (`hingeMount`, data only, unconfirmed): `full_overlay` when the
   leaf hinges on an outer side panel, `half_overlay` when it hinges on a partition.
5. **Leaf widths rounded to 0.5 mm** (unconfirmed, unchanged). The remainder goes to the leaves
   that lost most by rounding (ties: leftmost), so leaves + gaps = covered width exactly.
6. **`sections = auto`** is back to the D-1a behaviour: smallest count with every inner width
   ≤ 900 (SHELF_SPAN) and, with doors, no DOOR_TOO_WIDE.

## Examples (single doors)

| Sections | Hinges     | Mounts                 | Shared partition |
| -------- | ---------- | ---------------------- | ---------------- |
| 1        | L          | full                   | —                |
| 2        | L, R       | full, full             | —                |
| 3        | L, L, R    | full, half, full       | —                |
| 4        | L, L, R, R | full, half, half, full | —                |

Double doors: left leaf hinges left, right leaf right. Default 1360 mm (2 sections, 2 doubles):
leaves L,R,L,R, mounts full, half, half, full — leaves 2 and 3 share partition 1.

## Consequences

- Default 1360 mm wardrobe → **2 sections with 2 double doors (4 leaves)**; every width
  600–2400 has a valid door layout (2400 → 3 doubles); the 2399 hold is gone.
- The 3D viewer opens leaves that share a partition to **85°** (others 100°) and pivots each
  leaf on its front-face hinge edge, so the two leaves never intersect in the animation.
- Order draft schema 0.3 (door panels carry `hingeMount`). Migration keeps the original door
  types and hinge sides of 0.1/0.2 drafts (as `doorSectionN` overrides where the auto rule
  differs). Only a 0.1 single door whose leaf now exceeds 600 mm changes (→ double, reported
  as `MIGRATION_DOORS_CHANGED`).
- To confirm with Dafna: max leaf 600, rounding 0.5, the hinge-side rule, hinge mount types.
