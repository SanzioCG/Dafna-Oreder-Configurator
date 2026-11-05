# ADR-006: Door leaf width and hinge rule

- Status: accepted (D-1b, supersedes the door rules of D-1a)
- Date: 2026-11-05

## Context

D-1a decided single vs double doors on the section **inner** width but checked DOOR_TOO_WIDE on
the **leaf** width, and alternated single hinges L, R, L, R — which hangs two leaves on one
partition (they collide when opened). D-1b fixes both.

## Decision

1. **One rule source, measured on the leaf.** `maxSingleLeafWidthMm = 600` (unconfirmed).
   A section's single-leaf width = its door coverage (partition centre line to partition centre
   line, outer edge at the ends) minus its gaps (1.5 mm at outer edges / next to an empty
   section, 1.5 mm = half of the 3 mm gap next to a doored section).
   `doors = auto`: single if that width ≤ 600, else double. `DOOR_TOO_WIDE` uses the same
   (rounded) leaf width.
2. **No two leaves hinge on the same partition.** A leaf hinged right followed by a leaf hinged
   left across a partition collides; a double door uses both of its section's sides. Within a run
   of consecutive doored sections the only valid patterns are **`L* D? R*`** — at most one double
   door per run. Deterministic choice for free singles: the first `max(1, floor(m/2))` sections
   hinge left, the rest right; a run of one section in the right half of the wardrobe hinges
   right (symmetric front). Fixed staff overrides are respected if possible; otherwise
   `HINGE_CONFLICT` (error) names the override.
3. **Leaf widths rounded to 0.5 mm** (unconfirmed). The remainder goes to the leaves that lost
   most by rounding (ties: leftmost), so leaves + gaps = covered width exactly.
4. **`sections = auto` also requires a valid door layout** when the doors preset is not `none`.

## Examples (single doors, adjacent singles meet in the middle)

| Sections                      | Hinges     | Free edges meet at                                                      |
| ----------------------------- | ---------- | ----------------------------------------------------------------------- |
| 1                             | L          | —                                                                       |
| 2                             | L, R       | partition 1                                                             |
| 3                             | L, R, R    | partition 1                                                             |
| 4                             | L, L, R, R | partition 2 (L,R,L,R would hang doors 2 and 3 on partition 2 — invalid) |
| 3 with a double in the middle | L, D, R    | inside the middle section                                               |

## Consequences

- Two adjacent double doors are impossible. The default 1360 mm wardrobe with doors therefore
  gets **3 sections** (L,R,R) instead of D-1a's 2 sections with two double doors; customers
  cannot pick 2 sections at 1360 (reason: hinges collide), staff can and sees HINGE_CONFLICT.
- With doors there is **no valid layout at 2400 mm** (16 mm board; 2398–2400 with 18 mm): with
  4 sections both end leaves exceed 600 and both ends would need double doors. The customer
  slider is held at the nearest valid width (2399) with a toast. Options for Dafna: allow 5
  sections, a slightly larger max leaf, or accept a 2399 mm max width with doors.
- 0.1 order drafts are migrated: hinge sides changed by the rule are reported
  (`MIGRATION_DOORS_CHANGED`); drafts with two adjacent doubles return `HINGE_CONFLICT`.
