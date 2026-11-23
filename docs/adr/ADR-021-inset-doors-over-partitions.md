# ADR-021: Inset doors close neighbouring sections as one opening (D-27)

- Status: accepted (D-27, 2026-11-23)
- Builds on: ADR-020 (construction from Dafna's Bazis models)

## Context

In wardrobe 0.13.0 every inset (vkladnoy) leaf sat inside its own section. Between two doored
sections the partition's front edge showed as a strip between the leaves. The founder asked
whether that is how Bazis does it.

It is not. In the Bazis models two inset leaves meet with only a 3 mm gap and nothing between
them:

- Offis: two 377.5 mm leaves = (764 − 3 × 3) / 2.
- Sectional pedestal: leaves X 20…398.5 and 401.5…780.

No file has a partition between inset leaves, so the files do not show how a partition is
handled. The founder decided to hide it behind the doors.

## Decision

Wardrobe template **0.14.0**, gated by the rule `inset-doors-hide-partitions`:

- With inset doors, neighbouring doored sections form one opening. Leaves have
  `insetDoorGapMm` (3 mm) at the ends and between them. Each section's leaves share the width
  up to the partition centre lines.
- A partition between two doored sections stands **behind the doors**: its front edge is
  door thickness + `insetPartitionBehindDoorMm` (1 mm) behind the carcass front. This is the
  same line as the shelves.
- The partition stays full depth and frames the opening in three cases:
  - next to an open section;
  - next to a `books_lower` section (its upper part is open);
  - at a D-15 carcass split.
- A leaf whose hinge edge is on a hidden partition is mounted half overlay on it. Leaves at
  the run's ends stay `inset`.
- Drafts made before 0.14.0 with inset doors and partitions migrate with
  MIGRATION_CONSTRUCTION_CHANGED. Older templates regenerate unchanged.

The kiosk's "Eshik turi" choice is now two picture cards: a front view and a plan view of the
wardrobe, plus one plain sentence. The customer sees the difference without the words
nakladnoy / vkladnoy.

## Open

- The hinge plate on a set-back partition (half overlay, 17 mm behind the front) needs the
  technologist's check.
