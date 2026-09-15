# Backlog #80 — literal walk-in building interiors

Implementation-level spec for task #113, resolving `wave4-full-vision.md` §C.2's decision into
concrete engine mechanics before writing code (Rule #1). This is Red Zone work
(`overworld/engine/*` + `ExteriorScene.ts` scene-transition logic) — kept for Claude, not
delegated, per CLAUDE.md.

## What exists today

Every door-building interaction is instantaneous: `afterStep()` detects the player's tile is a
door (`doorPlaceAt`/`businessDoorAt`) and immediately emits `enter-place`/`enter-business`, which
`OverworldRoot.tsx` turns into `setOverlay({...})` — the real feature screen (Bank UI, Library UI,
etc.) pops up the same frame you touch the door tile. There is no visual sense of having gone
anywhere; the player is still standing on the outdoor door tile the whole time, just with a modal
on top. `returnToDoor()`/`returnToBusinessDoor()` already implement "leaving returns to the exact
tile you entered from" (FR3) — teleporting the player straight back to that same door tile the
instant the overlay closes.

## Decision: a single reserved interior "room" the camera visits, not a second Phaser Scene

`wave4-full-vision.md` speculated about "mirroring `ExteriorScene.ts`'s scene-swap convention" —
re-reading the actual code, there is no multi-`Phaser.Scene` convention here (`OverworldRoot.tsx`
registers exactly one scene, `exterior-scene`). The real, already-shipped convention this repo
uses for "you went somewhere and will come back to exactly where you left" is `returnToDoor()`'s
door-tile teleport. Building a genuine second `Phaser.Scene` (its own lifecycle, its own input/
camera/resize wiring, its own preload) duplicates a lot of fragile machinery this session cannot
visually verify, for a purely cosmetic outcome — real risk for a polish feature, not justified.

Instead: **one persistent, reusable "interior room" is drawn once at scene creation, in reserved
world-tile space just past the real town's east edge** (`REGION_WIDTH + margin`), permanently
included in the camera's world bounds (`setBounds`, extended once at creation) but never reachable
by normal exterior movement (`tryMove`'s bounds check is still exactly `{REGION_WIDTH,
REGION_HEIGHT}` — unchanged). Entering a building now:

1. Locks input (new `interiorTransitionLock`, separate from the existing React-driven `paused`
   flag — see "why a separate lock" below).
2. Teleports the player sprite into that reserved room (a tween under normal motion, an instant
   jump under `prefersReducedMotion()` — same branch this file already uses for every other move).
   The existing camera `startFollow` does the rest; no manual camera pan code needed.
3. Updates the room's single glyph `Text` object to the entered building's own icon — reusing
   `workIconForPlace()` (door places) / `businessGlyphFor()` (player-built businesses), the exact
   same icons already used for attendant "at work" flashes elsewhere in this file. No new icon
   table.
4. After a short dwell (`INTERIOR_ENTER_DWELL_MS` = 260ms, motion-gated to 0 under reduced motion
   — matching this file's "skip the tween, jump straight to `finish()`" convention, never an
   artificial hold with nothing to look at), unlocks input and emits `enter-place`/`enter-business`
   exactly as before — the overlay opens automatically, same trigger as today. See "why automatic,
   not a second interact press" below.

Leaving (`returnToDoor`/`returnToBusinessDoor`, called by `OverworldRoot.tsx` when the overlay
closes) now defers the actual exterior teleport by a second short dwell
(`INTERIOR_EXIT_DWELL_MS` = 200ms, same reduced-motion exemption) instead of firing instantly —
so there's a real, if brief, "you're still inside, then you step back out" beat on the way out
too, using the same reserved room the player is already standing in (position never moved during
the dwell, since the overlay closing didn't reposition anything yet).

## Why a separate `interiorTransitionLock`, not reusing `paused`

`OverworldRoot.tsx` owns `paused` externally (`setPaused(overlay.kind !== "none")`) and calls it
on its own render schedule — it will call `setPaused(false)` the moment `setOverlay({kind:
"none"})` commits, which happens synchronously inside the same `closeOverlay()` that just called
`returnToBusinessDoor`/`returnToDoor`. If the exit dwell relied on `paused` alone, React's own
unpause would race ahead of the 200ms exit dwell and re-enable movement while the player is still
supposed to be mid-transition, standing in reserved off-map tile space. A second, scene-owned lock
avoids that race entirely — `handleInput` now gates on `this.paused || this.interiorTransitionLock`.

## Why automatic, not a second interact press

An alternative reading of "the existing overlay still opening on interact" is a genuine two-step
flow: walk in, see the room, THEN press interact to open the screen, with a separate way to leave
without interacting at all. Rejected for this pass: it requires a new "walk back out" input path
(the player is standing in reserved space with no real geometry to walk through) with no way to
visually verify the escape route works before shipping — a bug there would be a real soft-lock,
which given this sandbox's standing inability to click through the actual app is a risk not worth
taking for a cosmetic feature. The automatic-after-a-dwell version delivers the same "you're
inside now" feeling with no new failure mode: the timer is authoritative and always fires.

## Room visuals: no new art this round

The room itself is two `Phaser.GameObjects.Rectangle`s (a filled floor, a stroked wall outline,
both plain colors pulled from the existing UI `theme.ts` palette so the two systems don't drift)
plus the one glyph `Text`. Deliberately not sourcing per-building-type furniture art or new CC0
packs this round — `wave4-full-vision.md` §C.1's own "distinguish with a stronger glyph rather
than inventing art" escape hatch applies here too, and the glyph is already the game's established
non-color-only cue for "which building is this." A furnished, per-type room (distinct furniture
silhouettes) is real future depth, not required to satisfy "you walk inside" this round.

## Scope: door-buildings and player-built businesses only

Object places that aren't buildings — Soumaya (a person standing in the open), the Bulletin Board
(a sign) — are unaffected. "Walking into a building" only makes sense for the 11 static
door-buildings and any player-built business; those two `afterStep()` branches are the only ones
routed through the new `enterInterior()` helper.

## Verification

Phaser scene/camera-visual code (per CLAUDE.md's "verify before you build") can't be rendered from
this sandbox, and this file's own established convention (see e.g. NPC autonomy/outings entries in
`roadmap.md`) is to verify pure logic directly and flag Phaser-integration code as unconfirmed
rather than write a brittle mocked-Phaser test around it. What's new and pure this round —
`data/interiorRoom.ts`'s reserved-room placement math and icon lookups — is unit-tested directly:
the reserved room's tile footprint is asserted to start at/after `REGION_WIDTH`, never overlapping
the real town, for every real `REGION_WIDTH`/`REGION_HEIGHT` value. The full gate stays green. Not
yet seen rendered in a real browser — flagged in `CLAUDE.md`'s Pending Validation like every other
Phaser-visual entry this session.
