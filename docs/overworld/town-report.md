# The Town Report — Wave 4 §E.1 (task #119, part 1)

## What's being asked

`wave4-full-vision.md` §E already resolved this: SimCity's own signature "how's my city doing"
view, built ONLY from real numbers that already exist elsewhere in this app — never a new
invented "happiness %". Mayor's Hall already shows Treasury, per-building neglect, housing, and
zoning as separate sections; the Town Report is one small, real dashboard at the top of the same
overlay that puts the town's real headline numbers next to each other for the first time:
population, treasury, buildings needing a visit, zoning balance, and civic-concern status.

## Investigated first

- Population = `housingSummary(spaceId).total` — already real (population-growth.md's own
  combined society+Resident roster).
- Treasury = `treasuryBalanceCents(spaceId)` — already real, already shown lower in the same
  overlay.
- Buildings needing a visit = the exact same `neglectedCount`/`doorPlaces.length` the "Town
  Health" section below it already computes — reused, not recomputed.
- Zoning balance = `zoneCounts(spaceId).residential` vs `.commercial` — the only genuinely new
  presentation: a real ratio of the two BUILDABLE zone types (sidewalk/transit are infrastructure,
  not "residential vs. commercial", so they're excluded from the ratio itself, though still shown
  in the existing Zoning Plan section below).
- Civic-concern status: real, but had no exported read-only getter — `checkCivicConcern` writes
  as a side effect of evaluating a NEW check, which the Town Report shouldn't trigger just by
  being viewed. Added `civicConcernActive(spaceId)` (`civicConcern.ts`) — a pure read of the exact
  same stored flag, zero new state.

## Decision

Add a "Town Report" `<h3>` section at the very top of `MayorsHallOverlay.tsx` (before "Town
Treasury"), five lines, each reusing a real, already-computed value: Population, Treasury,
Buildings needing a visit, Zoning balance ("N residential : M commercial", or "no zoning yet" if
both are 0), Civic concern ("Stable" / "A town meeting is due" — the real
`civicConcernActive(spaceId)` flag, reusing this app's own established plain-language
convention). Every existing section below it stays exactly as-is — the Town Report is a summary,
not a replacement.

## Deliberately deferred (Wave 4 §E, part 2)

Building tiers from real accumulated use ("a home/business worked without falling neglected for
14+ real days visually upgrades") needs its own resolved design first: the real data this app
keeps (`buildingNeglect.ts`) is a single "last worked at" timestamp, not a continuous history, so
"never fell neglected for 14 days straight" isn't directly answerable from what's actually
stored — computing it honestly would need a new streak-tracking mechanism, or a documented
proxy (e.g. a real interaction-count threshold) accepted as a deliberate simplification. Tracked
separately rather than guessed in this round.

## Verification plan

New `civicConcern.test.ts` case: `civicConcernActive` reflects the real stored flag without ever
writing to it. New `MayorsHallOverlay.test.tsx` cases: the Town Report's population/treasury/
neglect/zoning-balance/civic-concern lines each show the real current values; the zoning-balance
line reads "no zoning yet" on a fresh town. Full gate before commit.
