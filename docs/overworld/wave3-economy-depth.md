# Wave 3 — economy depth: passive income, zone function, demolish, onboarding

Per Rule #1 (no code before the design is complete). Resolves the 5 structural gaps tracked from
`docs/overworld/gameplay-uiux-audit-2026-09-15.md`'s own list, in response to being asked to
finish Wave 3 and keep going deeper. Each decision below is made directly (matching this
session's own established practice of resolving ambiguity itself rather than blocking on it),
with the reasoning shown so a reviewer can see why.

## 1. Passive income from built structures (task #99, #103)

**The problem restated**: right now, every home/business/decor item you build is a pure one-time
treasury expense that never pays anything back — the exact inversion of how SimCity/every real
city-builder works, and the direct cause of the original "takes way too long to afford anything"
complaint (fixed partially by the pricing-gauge round; this closes the rest of it).

**Decision — a real, capped, read-time-computed rent accrual.** Every placed home and business
(not decor items — a garden bed doesn't "earn," a home/business is a real economic unit) accrues
a small amount of real treasury income continuously, the exact same wall-clock-timestamp-computed-
at-read-time pattern `buildingNeglect.ts`/`isUnderConstruction` already use — no new timer, no
new infrastructure, just `Date.now() - lastCollectedAt` evaluated whenever the world snapshot
refreshes.

- **Rate**: 10% of the structure's own real purchase price, per real day elapsed. A genuinely
  pricier building earns more, matching `revenueForPriceCents`'s own "gauged by real pricing"
  principle from the same-day economy round.
- **Cap**: accrual stops accumulating past **3 real days** since last collected. Two reasons: (a)
  prevents the game rewarding literally never opening it (an AFK-farming exploit with zero real
  interaction), and (b) keeps the mental model simple — "check in every few days," not an
  idle-game timer to optimize.
- **Collection**: automatic, on every `loadWorldSnapshot()` (the same real refresh cycle every
  other passive signal like neglect/construction already rides). No separate "Collect Rent"
  button — reusing the exact same "silently computed and applied" convention neglect/construction
  use, not a new UI surface. `lastCollectedAt` starts at the structure's own real `builtAt`
  timestamp (so a fresh build doesn't retroactively earn for time before it existed) and is
  re-stamped to `now` every time accrual is actually credited.
- **Under construction**: accrues nothing (an unfinished home/business earns nothing, matching
  `isUnderConstruction`'s own "honestly unusable" framing from the same-day round).
- **Not an exploit vector**: spamming refresh doesn't help (income is time-elapsed-based, not
  refresh-count-based); the 3-day cap bounds the maximum single accrual; the rate is deliberately
  modest — meaningfully speeds up affording the NEXT thing, never trivializes the whole economy
  (a $10 Apartment Block earns $1.00/day, capped at $3.00 — real money, not dominant).

## 2. Sidewalk/transit real function (task #101, #104)

**The problem restated**: 2 of 4 zone types are paintable labels with zero mechanical effect — a
real, provable half-shipped feature the audit flagged.

**Decision — both become real, purely additive bonuses, never new requirements.** Critically,
neither retroactively invalidates anything a player has already zoned/built — both are pure
upside, so no existing town can be broken by this round shipping.

- **Sidewalk → passive-income bonus.** A home/business with at least one sidewalk-zoned tile
  orthogonally adjacent to its footprint earns its rent (decision #1) at **1.5x** the base rate.
  Real-world logic: a business with real foot traffic access does better. Ties the two new
  mechanics together rather than inventing a third, disconnected one.
- **Transit → neglect-decay reduction.** A business with at least one transit-zoned tile
  orthogonally adjacent to its footprint (the same real adjacency test as sidewalk above — one
  consistent rule for both bonuses, not two different radii to explain) has its neglect entropy
  computed at **75%** of the normal rate (via a real multiplier on the elapsed-days input to
  `entropyFrom`, not a new invented decay curve) — "better civic access, ages more slowly," same
  idea as sidewalk, different resource (attention instead of money). Homes have no neglect
  concept at all (a standing, deliberate asymmetry this audit already found and left as-is), so
  this bonus only ever applies to businesses.
- Both are computed fresh at read time from the real zoning + placement data already on disk —
  no new stored state, no migration risk.

## 3. Demolish/remove mechanic (task #101, #105)

**The problem restated**: no way to undo a placement mistake anywhere — decor item, home, or
business — a real, flagged usability trap for a builder game where misclicks are inevitable.

**Decision — a real partial-refund demolish, surfaced in the Hangar.** Consistent with the
existing arm/cancel-refund convention (`cancelArmedHome` etc. from the 2026-09-15 Wave 1 fix):

- **Decor items**: demolishing refunds 100% of the price. Purely decorative, no dependent state,
  no reason to charge for moving your mind about a bench.
- **Homes/businesses**: demolishing refunds **50%** of the real purchase price. Not 100% — once
  built, a home has real assigned residents and a business has real accumulated neglect/earned
  history; a full refund would make demolish-and-rebuild-elsewhere functionally free relocation,
  which is a bigger design change than "let me undo a mistake." 50% keeps a real cost to moving a
  serious structure while still giving a genuine way out of a bad placement (today: none at all).
  A home still `isUnderConstruction` (hasn't housed anyone or earned anything yet) refunds 100%
  instead — functionally identical to canceling an arm before it was ever placed.
- **Surfaced in the Hangar** (already the town-building management hub): each of the 3 catalogs
  gains a real "Your placed [items/homes/businesses]" list with a `ConfirmButton` "Demolish" per
  row (reusing the exact confirm-then-refund pattern from the 2026-09-15 audit fix) — not a
  new in-world interaction (no risk to `ExteriorScene.ts`'s already-complex interact-press
  priority chain).
- Removing a home re-triggers `assignResidents`'s existing fresh-recompute-every-call behavior
  automatically (no stale-residency risk — it already never stores assignments).

## 4. Onboarding nudge for a fresh town (task #101, #106)

**The problem restated**: zero in-world guidance for a brand-new player beyond a static "How to
Play" list behind a gear icon they have no reason to find yet.

**Decision — a single, real, dismissible TownHud tip, not a tutorial system.** Deliberately the
smallest real fix, not an invented onboarding flow:

- Shown only when the town is genuinely fresh — `workedPlaceIds(spaceId).length === 0` (the same
  real "has anything actually happened here" signal `townLedger.ts` already provides, not a new
  tracked flag).
- One line: "👋 New here? Walk into any building to explore, or step into the tall grass to
  capture a thought." — the two real, actual first actions the game supports, nothing invented.
- A real dismiss (×) persists to localStorage so it never shows again once dismissed OR once the
  town stops being fresh (whichever first) — never a nag.
- Lives in `TownHud.tsx` (already the persistent, always-visible surface) — no new overlay, no
  new z-index surface to get wrong.

## 5. Population growth (task #101, #107) — specced, implementation deferred

**The problem restated**: the 22-NPC roster is permanently fixed; building more housing only
reshuffles who lives where, never grows the town — a real, honest gap vs. the genre's core
"build → population grows → more demand" loop.

**Decision on the shape, if built**: growth would be gated by real housing capacity actually
built (never a timer, matching every other mechanic in this app) — e.g., once total built home
capacity exceeds the current 22, a new NPC becomes eligible to "move in," assigned deterministically
like every other NPC assignment here.

**Why this is deferred rather than built this round**: unlike the other 4 items, this one has a
real ripple footprint that the others don't:
- `npcDialogue.ts`'s `PROFILE_LIST` is 22 fully hand-authored profiles (name, job-flavor dialogue
  lines, achievement-reaction lines, relationship-flavor text) — a new NPC needs either genuinely
  new hand-authored content (real writing work, not a mechanical change) or a real decision to
  generate it proceduralaly/via LLM (a meaningfully different, riskier design than every other
  hand-authored NPC in this game).
- A new NPC needs a real home building assignment AND a real job/building association (every
  existing NPC belongs to exactly one of the 11 door-places) — there's no "unaffiliated resident"
  concept anywhere in the current NPC model, so growth either needs new buildings (its own large
  feature) or overloading existing buildings with more attendants than they have physical posts
  for (`attendantPosts()` is generated from a fixed 2-per-building footprint reservation).
- `townHallMeetingSlots()` (just fixed this same audit to comfortably cover 22) would need
  re-sizing again, `MEETING_ROWS_OUT` tuned to whatever the new real cap becomes.

None of these are unsolvable, but each is a real design decision this session hasn't made yet
(hand-author more NPCs vs. LLM-generate them; new buildings vs. denser existing ones) and forcing
an answer just to ship something risks exactly the kind of "invented, not honestly interesting"
mechanic this whole audit has been fixing. Tracked as its own future round, spec-first per Rule #1
once those calls are actually made — not attempted here.
