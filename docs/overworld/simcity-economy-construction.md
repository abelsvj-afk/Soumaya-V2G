# Real pricing-gauged treasury income + Hangar previews + construction delay (Stage 2.41, task #86/#87)

> Per Rule #1. Direct user request: *"Need a way for the town to make money for the treasury
> gauged amount correctly based on all including pricing. Also there should be images or
> something showing the actual property in the hangar options that'll be put down. It must be
> built after being placed. Remember let's go ahead and SimCity it up."* Three concrete asks,
> checked against the real code before designing anything:

1. Treasury income is currently a flat rate, disconnected from real prices.
2. The Hangar's Housing/Business catalog rows show only a generic emoji, never the real
   illustration that actually renders once built.
3. A placed home/business appears fully complete the instant it's placed — no construction
   period at all.

## What was verified before designing anything

- **`townLedger.ts`'s `creditHour`** credits the exact same flat `WAGE_PER_HOUR_CENTS` (25¢) for
  every real interaction, at every building, regardless of what actually happened — a Bank
  check-in and a Bookshop sale earn identically. `wagesEarnedCents`/`townTreasuryEarnedCents`
  derive the treasury as `hours × 25¢`, so no real price anywhere in the app (business type
  tiers, individual goods) has ever affected how much the town actually earns — only how much
  things cost to buy. Confirmed neither `hoursWorked` nor `wagesEarnedCents` is rendered
  anywhere in the UI (grepped `.tsx` files), so this can be restructured freely.
- **`housing.ts`/`business.ts`'s `PlacedHome`/`PlacedBusiness`** carry no timestamp at all — a
  home/business is indistinguishable from "built yesterday" the instant `placeArmedHome`/
  `placeArmedBusiness` returns.
- **`buildingSprites.ts`'s `homeBuildingSprite()`/`businessBuildingSprite()`** always return the
  same real PNG regardless of type (COTTAGE for every home type, ARCHED_HALL for every business
  type) — already loaded as public assets (`/overworld/buildings/human-city.png`/`human-city2.png`)
  and already what `ExteriorScene.ts` actually paints. A real, honest Hangar preview reuses these
  exact same files, scaled the same way — it does NOT imply each type gets distinct art (that's
  the separate, already-tracked task #78).
- **`townBuilder.ts`'s decor items** (Garden Bed, Bench, …) render in-world as plain text emoji
  glyphs, not sprite images — the Hangar catalog's emoji IS already the real in-world
  representation for these. No preview gap exists there; only Housing/Business have a real
  catalog-vs-reality mismatch.

## Resolved decisions

**1. Revenue scales with the real price of what was actually sold, not a flat rate.** A new
`revenueForPriceCents(priceCents)` formula (`townLedger.ts`) credits a real cut of a sale
(`Math.max(WAGE_PER_HOUR_CENTS, Math.round(priceCents * 0.5))`) — a genuinely more expensive good
earns the treasury more, a cheap one earns the old baseline as a floor. Applied at the two real
point-of-sale call sites: `MarketOverlay.tsx`'s purchase handler and `business.ts`'s
`purchaseGoodFromBusiness`. Civic buildings (Bank/Library/Sanctuary/…) keep the flat rate — no
real pricing data exists there to gauge against, so nothing to change.

**2. Building a home/business stays a pure expense; selling goods there is the real income
side.** `armHomeType`/`armBusinessType` already spend the treasury on real capex (matches a real
town's own budget) — left unchanged. Revenue only flows from an actual sale (a good bought), the
same "real interaction, never a timer" convention every other credit in this app already follows.

**3. `creditHour`/`recordBuildingWork` both gain an optional wage override**, defaulting to the
existing flat rate — every civic-building call site (Bank, Library, Hangar, …) is untouched
(same behavior, same values). Internally, the ledger now accumulates real EARNED CENTS per place
(not `hours × flat-rate` computed at read time), so a variable per-sale amount can be credited
correctly; `hoursWorked`/`workedPlaceIds` (interaction counts) are unaffected.

**4. The Hangar's Housing and Business sections each get a real image thumbnail** — the exact
same PNG `ExteriorScene.ts` actually paints for that catalog (COTTAGE for every home row,
ARCHED_HALL for every business row), sized proportionally to that type's own real footprint
(width×height) so a 4-tile Apartment Block visibly reads as bigger than a 2-tile Cottage even
though today they share one illustration — an honest preview of real footprint, not invented
distinct art.

**5. A real, short construction period, using the same wall-clock-timestamp convention
`buildingNeglect.ts` already established.** `PlacedHome`/`PlacedBusiness` gain a real `builtAt:
number` (ms epoch, set at placement). `CONSTRUCTION_MS` (90 seconds) — long enough to register as
"not instant," short enough not to be tedious in a low-stakes, single-player cosmetic game.
`isUnderConstruction(placed, nowMs = Date.now())` is a pure function of that timestamp, computed
at read time — no running timer, no server job, matching the app's own standing architecture
constraint (client has no background ticking).

**6. A home/business under construction is honestly unusable, shown in-world, not narrated.**
While under construction: `ExteriorScene.ts` paints the building at reduced opacity with a 🚧
badge instead of its normal type glyph — the visual itself explains the state, no toast/popup
needed (this app has no live toast UI mounted in the Overworld to begin with). `assignResidents`
(housing.ts) skips a home still under construction — an NPC can't move into an unfinished house.
Stepping onto a business's door tile while it's under construction is a silent no-op (the
`enter-business` event isn't emitted) — same "silently refuse until ready" convention every other
blocked arm-mode interaction in this scene already uses. Once `CONSTRUCTION_MS` elapses, the very
next snapshot refresh (already-existing `refreshPlacedHomes`/`refreshPlacedBusinesses` polling)
re-paints it as complete — same read-time-recomputed pattern as neglect dimming.

## Deferred, explicitly

Distinct art per home/business TYPE (task #78, already tracked separately — this round's preview
images are honest about reusing one shared illustration per category, not a claim that each type
looks different); a visible progress bar/percentage during construction (the badge + dimming is
enough signal for this slice); scaling revenue for Market/Hangar/Town Builder decor items (they
have no "sale" concept — buying decor is capex, same as building a home).
