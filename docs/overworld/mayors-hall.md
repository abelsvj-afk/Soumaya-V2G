# Mayor's Hall (Stage 2.23, task #63)

> Per Rule #1. Resolves soumaya-governance.md decision #5's open questions before any code.

## Resolved decisions

**1. Footprint — literally the biggest building on the map.** 12x6 (72 tiles) vs. every other
building's uniform 6x3 (18 tiles) — 4x the area, unmistakably the largest. Placed as its own row
below the south row (extending `REGION_HEIGHT` the same way the existing width already derives
from the rightmost building), not squeezed into the existing 6x3 grid. `attendantPostsFor`,
`isMovementPassable`/`isNpcPathPassable`/`isPlacementBlocked` are all already generic over
`DOOR_PLACES`' own footprint/door fields — a bigger footprint needs zero changes to any of them.

**2. "Her security"** — the working interpretation stated in soumaya-governance.md is confirmed
here: two attendant NPCs, the exact same pattern every other building already has
(`ATTENDANTS_PER_BUILDING`, generic). Named and given real dialogue profiles
(`npcDialogue.ts`) the same way every other building's attendants already are.

**3. What walking in shows — a real Mayor's Office dashboard, not a new invented screen.**
Combines three already-real data sources into one town-wide read-out: the Town Treasury balance
(`townLedger.ts`), an aggregate health read across every building's real neglect
(`buildingNeglect.ts`), and the zoning plan (`zoning.ts`'s `zoneCounts`). Nothing new is computed
— this is the first screen that puts already-real per-building numbers next to each other at the
town level, which is exactly what a Mayor's own office would show.

**4. No new building illustration.** The "Old stone buildings" pack has 5 images, all already
reused across the other 10 places; Mayor's Hall reuses `FLAG_TOWER` (the same civic-banner
illustration Town Hall and the Gym already use) rather than inventing new art — real art for a
distinct "biggest building" look is tracked under task #74's asset sourcing.

**5. Attendant sprite art + work icon.** No dedicated attendant sprite exists either — falls back
to the generic player-sprite frame, the same tolerate-gracefully convention every unmapped place
already uses (Market/Park's attendants do the same). A work icon costs nothing new to add: 🛡️.

**6. No auto-credited work event this round.** Every other building's wage-crediting either has a
real button to hook (`recordBuildingWork` calls throughout the overlays) or a diff-detected read
(Bank/Gym). The Mayor's Office is read-only this round — no action exists yet to hook, so it earns
no wages/hours yet rather than inventing a fake interaction. Revisit once it has one.

## Deferred, explicitly

A distinct building illustration and attendant sprite (task #74); any real interaction inside the
Mayor's Office beyond reading the dashboard; her literally living/working there (she still tours
the whole town per Stage 2.17 — this is her seat, not a cage).
