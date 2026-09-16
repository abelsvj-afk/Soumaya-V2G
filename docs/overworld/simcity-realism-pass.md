# A SimCity-realism pass: interiors, NPC travel, population income, dispatched building

## What's being asked (verbatim, 4 distinct complaints in one message)

1. Building interiors: "when u enter, it has the overlay pop up first so you cant really walk
   around or anything. And if u exit the overlay, you exit the building completely."
2. "all npcs make money towards the treasury... just like city builder populations, I should
   see the money running up just based off them."
3. "usually when building you dont have your own npc like i do in this involved in building. So
   we need a proper way thats not too slow for building roads and all the various stuff like in
   city builders. Even queue hangar employees to dispatch and do the building."
4. "npc traversal needs to be realistic. No coming out of a building, walk away from it, then
   teleport or flying back to it all fast. They live around the map just like me and have lives."

## Investigated first (per "verify before you build") — each complaint checked against real code

### #4 — NPC teleport: root-caused, a real bug

Read `ExteriorScene.ts`'s outing system (`maybeStartOuting`/`walkPath`) first: it's genuinely
real BFS pathfinding, tile-by-tile tweened, chained via `onComplete` — no shortcut there. The
real bug is in `applySocietyState` (the Working/Break/Home transition handler), confirmed by
reading it line by line: when a real schedule transition fires WHILE an NPC is mid-outing
(possibly 20-40+ tiles from their own building, at Park or Market), the transition code kills the
outing's walk tween (correct) but then moves the sprite with either an INSTANT `setPosition` to
the door (the `home`/`break` branch's `sprite.image.setPosition(doorX, doorY)` before its own
tween) or a flat 500ms straight-line tween from wherever the sprite currently is to the door (the
`working` branch) — neither accounts for real distance. A schedule transition interrupting an
outing is exactly the "walk away, then fly back fast" the user saw on-device — this was never
caught by this session's own measurement-only verification, since those scripts measured
straight-through outings, never an outing genuinely interrupted mid-flight by a schedule tick.

**Fix**: when a transition interrupts an active outing, route the sprite back to its real
destination (door for Working, post for Break/Home) via `findPath` + `walkPath` — the exact same
real, tile-by-tile mechanism the outing itself already used to get there — instead of an instant
snap or a distance-blind flat tween. When NOT interrupting an outing (the common case — the
sprite is already at/near its own building), the existing short direct tween stays exactly as-is;
a straight one-tile hop between a door and its own adjacent post is honestly a "step," not a
fly-across-the-map, and doesn't need real pathfinding.

### #1 — building interiors: root-caused, a real architecture gap, not just UX polish

Read `enterInterior`/`exitInterior`/`handleInput` together. The interior room's tiles
(`interiorRoomOrigin()` onward) sit past `REGION_WIDTH` specifically so normal exterior movement
can never reach them — but `handleInput`'s own movement grid is hardcoded to
`{ width: REGION_WIDTH, height: REGION_HEIGHT, ... }`. That means even if the transition lock
were simply left off after entry, the player COULD NOT MOVE AT ALL inside the interior room —
every step would fail `tryMove`'s own bounds check. That's the real reason `enterInterior` had to
auto-fire the overlay immediately: giving control back with the current grid would have looked
like the game hung. This is an architecture gap, not a preference — the interior was never
walkable by construction.

The exit side has the same shape: `OverworldRoot.tsx`'s `closeOverlay` calls
`returnToDoor`/`returnToBusinessDoor` the INSTANT the overlay closes — there was never a
real "you're back inside, standing there" moment. Closing the overlay and leaving the building
were the same action, hence "exit the overlay, exit the building completely."

## Decisions

### #4 fix (do this round)

`applySocietyState`'s `working` and `break`/`home` branches: when the sprite's own npcId is
found in `outingActive` at the moment the transition fires, don't reset it to the door and just
tween/snap toward the target — instead call `findPath` from the sprite's REAL current tile
(`spriteTile(sprite)`) to the real target (door for Working, post for Break/Home) and `walkPath`
it home, tile by tile, same as an outing's own return leg. Only fall back to the existing short
direct tween/snap when the sprite was NOT mid-outing (the normal case, already correct). If
`findPath` genuinely fails (should be unreachable given the same grid every outing already
proves reachable), fall back to the existing behavior rather than leaving the sprite stuck —
tolerate-gracefully, this app's own established convention.

### #1 fix (do this round) — real walk-in agency, matching the actual Pokémon-interior convention

- `interiorRoom.ts` gains one new pure export, `interiorCounterTile()`: the real interactable
  point inside the room, top-center — the EXACT tile the existing decorative glyph
  (`interiorGlyphText`) already renders at (`px + w/2, py + TILE_SIZE * 0.8`), so no art moves,
  only a real interaction is added where the art already implied one.
- `ExteriorScene.ts` gains `insideInterior: boolean` and `pendingInteriorEmit: (() => void) |
  null` fields, plus the real exterior door tile to return to (`interiorReturnDoor`).
- `enterInterior(glyph, emit, returnDoor)`: after the entry tween (or instant snap under reduced
  motion) finishes, sets `insideInterior = true`, stores `pendingInteriorEmit = emit` and
  `interiorReturnDoor = returnDoor`, and clears the transition lock — but never calls `emit()`
  itself anymore. The player has real control from this point, in both motion-preference modes
  (reduced motion only ever affects tween smoothness in this app, never gameplay agency — every
  existing exterior step already proves that same convention).
- `handleInput`'s movement grid branches on `insideInterior`: a small grid scoped to the interior
  room's own rect (`isPassable` true only inside it) instead of the exterior
  `REGION_WIDTH`/`REGION_HEIGHT` grid — the actual missing piece that made real walking
  impossible before.
- `afterStep` branches on `insideInterior` first: reaching `interiorCounterTile()` with a pending
  emit fires it (opens the overlay) and clears `pendingInteriorEmit` (leaves `insideInterior`
  true — the overlay layers over the same Phaser scene, same as today); reaching
  `interiorEntryTile()` (the doorway) — reachable at all only once the overlay is closed and
  input is unpaused — calls `exitInterior(interiorReturnDoor)` for real, exactly reproducing the
  existing exit tween/teleport, just now player-triggered by walking there instead of by the
  overlay's own close button firing it as a side effect.
- `OverworldRoot.tsx`'s `closeOverlay` stops calling `returnToBusinessDoor`/`returnToDoor` for
  every walked-into-a-place kind — closing the overlay now ONLY closes the overlay (the existing
  `setPaused(overlay.kind !== "none")` effect already unpauses the scene on its own). The player
  reappears standing in the interior room, near the counter, in real control — free to walk back
  to the counter (reopen the same overlay) or to the doorway (leave for real). `handleInteract`'s
  existing standalone-object paths (Soumaya, the Bulletin Board — never moved the player) are
  untouched, since they never route through `enterInterior` at all.
- Net effect: the interior room stops being a decorative teleport buffer and becomes a real,
  small, walkable space — proportionate to its own actual 5x4 size, not a sprawling new set.

### #2 — population-driven passive income (do a first real slice this round)

`passiveIncome.ts` already pays real rent from PLACED STRUCTURES, gauged by their own price —
that's a landlord's income, not a population's. The user's ask is the OTHER real SimCity income
stream: people who have jobs generate tax revenue just by having them, independent of anything
the player personally does. Real, honest scope for this round: every society NPC currently in
the real `working` schedule state (per `npcSchedule.ts`'s own `scheduleStateAt`, the SAME
function the visual Working/Break/Home state already reads) contributes a small real trickle to
the Town Treasury for real elapsed time worked — computed at read time from the same wall-clock
convention `passiveIncome.ts` itself already established, never a running timer, and completely
independent of the existing per-structure rent (both stack, they're honestly two different real
income sources). Gated the same honest way rent already is: a neglected building's own NPC
doesn't generate tax (an attendant nobody visits isn't doing real civic work worth taxing) —
reuses `buildingNeglect.ts`'s existing `isNeglected` check, no new signal invented.

Rate: 1 cent per real NPC-hour actually spent in the `working` state (matches the existing
`WAGE_PER_HOUR_CENTS` order of magnitude for a single interaction, but this is a MUCH higher
volume of real accrued hours across 24+ NPCs continuously, so it's kept small per-NPC
deliberately — this is ambient background income, not the main economic lever, which stays the
player's own real interactions per `npc-economy.md`'s original design intent).

### #3 — a dispatched build/worker-queue system: real scope, deferred to its own round

This is the biggest, most novel piece — genuinely new mechanics, not a bug fix or a small
addition to something that already exists. Real open decisions that need resolving BEFORE any
code (per Rule #1), not guessed here:
- Who are "Hangar employees" — new NPCs (interacting with the just-closed population-growth
  round's own Resident roster, which currently has zero jobs) or a purely abstract queue with no
  visible worker sprite at all (cheaper, safer, but less of "just like city builder games")?
- What does "dispatch" actually animate — a real worker NPC walking the real BFS path to the
  build site (this app's own established, verified pathfinding) and dwelling there for a real
  construction-time window, mirroring `CONSTRUCTION_MS`/`isUnderConstruction`'s existing
  wall-clock convention?
- Does this REPLACE the existing arm-then-place-it-yourself flow (a design regression for anyone
  who prefers hands-on placement) or ADD an alternative "queue it, a worker gets to it" path
  alongside the existing one?
- How does queuing multiple builds at once interact with the Treasury (pay up front per item,
  same as today, or a lump construction-crew wage)?
This needs its own resolved spec and its own round — implementing it alongside 3 other real
fixes in one pass would risk exactly the kind of under-verified, rushed mechanic this app's own
"verify before you build" standard exists to prevent. Tracked as its own follow-up task.

## Verification plan

- NPC-teleport fix: a real reproduction script — start an outing, interrupt it with a forced
  schedule transition mid-walk, assert the sprite's real path home uses `findPath`/`walkPath`
  (real tile count, real duration) rather than an instant `setPosition`/flat 500ms regardless of
  distance.
- Interior walk-in: new `interiorRoom.test.ts` cases for `interiorCounterTile()` (inside the
  room, distinct from the entry tile). `ExteriorScene.ts`'s own Phaser-integration code stays
  untested directly, per this file's established convention (verified by measurement/reasoning
  above, not a unit test).
- Population income: new `passiveNpcIncome.ts` (or an addition to `passiveIncome.ts`) test cases
  — a working NPC accrues real cents over real elapsed time; a neglected building's NPC accrues
  nothing; stacks correctly with existing structure rent without double-crediting.
- Full gate before commit.
