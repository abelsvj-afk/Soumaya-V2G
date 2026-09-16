# Real interior-camera bug, real interior art, real "start earning right away" (task #125)

> Per Rule #1. Direct response to: "building interiors are like 75% off screen for some reason
> when you enter a building... I also noticed no real looking building interiors at all. Also
> earning money at the beginnning needs to be possible. Just like city builder games you start
> earn right away as soon as you start placing buildings and have people coming into the town."
> Measured/investigated all three before writing any code — not guessed.

## 1. The interior-camera bug — measured, root-caused

**Measured directly** (a real script computing the actual camera-clamp math Phaser applies,
against this repo's real `REGION_WIDTH`/`REGION_HEIGHT`/interior-room geometry): with
`REGION_WIDTH=55`, `REGION_HEIGHT=32`, the interior room sits at world tile `(61, 0)`, 5x4 tiles.
`worldBoundsTiles()` unions both spaces into one `66 x 32`-tile (`2112 x 1024`px) camera-bounds
rectangle — the doc comment's own stated design: "a single `setBounds` call at scene creation,
never toggled at transition time." Centering the camera (via `startFollow`) on the player standing
in the tiny room gets clamped hard against the world's far edge. Across 3 realistic viewport sizes
(390x844 phone portrait, 800x500, 1280x800 desktop), the interior room's own real footprint occupies
**2.0% – 6.2% of the visible screen** — the rest is either the reserved margin gap or nothing at
all. That's "75%+ off screen," confirmed by the numbers, not a guess — genuinely worse than the
report even said.

**Root cause**: one shared camera-bounds rectangle covering BOTH the exterior town and the tiny
interior room was a real simplification the original `walk-in-interiors.md` spec explicitly chose
to avoid "toggling bounds at transition time" — reasonable to try, but the real math above proves
it doesn't work once the two spaces are wildly different sizes (a 66-tile-wide world vs. a 5-tile
room). This needs the toggle it tried to avoid.

## 2. No real-looking interior — confirmed, same investigation

`buildInteriorRoom()` draws exactly two `Phaser.GameObjects.Rectangle`s (a flat-color "floor" fill
+ a stroked-border "wall" outline) and a door glyph — its own doc comment says so plainly ("Plain
rectangles + a glyph Text, not new art"). Confirmed by reading the code, not assumed.

## Decisions

1. **Toggle camera bounds + a real fit-to-room zoom on interior transitions.** On `enterInterior`
   (once the walk-in dwell finishes): `stopFollow()`, `setBounds()` to the interior room's own
   real pixel rect (not the exterior union), compute a real "contain" zoom — the room's own real
   width/height in px vs. the current real viewport (`this.scale.width/height`) — the same
   `background-size: contain` math already familiar from this codebase's own zoom feature
   (`applyZoom`), then `centerOn()` the room. On `exitInterior`: restore the exterior-only bounds
   (`REGION_WIDTH x REGION_HEIGHT` — the union was always the actual bug, not just the interior
   half of it), restore the player's own chosen exterior zoom level, resume `startFollow`. A real
   `handleResize` while inside recomputes the interior fit-zoom too (a rotated phone or a resized
   desktop window must not re-break this).
2. **Real interior floor art, no new sourcing needed.** Reuses `TileFrame.path` — the SAME real
   ground tile already tiled across the plaza outdoors — painted per-tile across the room's own
   footprint (the exact per-tile `tileAt()` convention `drawGround()` already uses outdoors),
   replacing the flat-color rectangle. The wall stays a real bordered rectangle (a genuine
   architectural frame is a bigger, riskier art-sourcing task than this round's real scope) but
   themed from the building palette instead of the generic UI panel-border color, so it reads as
   a wall around a real floor rather than a placeholder box. This directly answers "no real
   looking interiors" using only already-loaded assets — zero new sourcing risk.
3. **Buildings visibly earn within a real play session, not real days.** `passiveIncome.ts`'s own
   real math, measured: at the shipped `DAILY_RATE=0.1` (10%/day), a representative 500¢
   structure earns `500 * 0.1 * (elapsed/86400000)` cents — under 1 whole cent for over 2 REAL
   HOURS of elapsed time (`Math.floor` truncates everything below that to 0). That's the literal
   mechanism behind "doesn't feel like earning right away" — the rate was tuned for a multi-day
   patient-city-builder pacing this app, with no separate accelerated game-clock, can't deliver in
   real human session lengths. Recalibrated so a typical (300-1000¢) structure visibly earns its
   first cents within single-digit real MINUTES: `DAILY_RATE: 0.1 → 1.2` (a structure now earns
   ~120% of its own price per real day, ~5% per real hour) — still capped, but the cap itself
   drops from `MAX_ACCRUAL_DAYS=3` to `MAX_ACCRUAL_DAYS=1` (a real day, not three) so the much
   faster new rate can't compound into an outsized AFK windfall. The 1.5x sidewalk bonus and every
   other existing rule stay exactly as they are — a pure rate/cap retune, not a new mechanic.
4. **Population — "people coming into the town" — now really contributes income too.** The other
   real gap: `passiveNpcIncome.ts` already taxes real WORKING society NPCs, but Residents
   (population-growth.md, task #118) were deliberately built with zero job/schedule and so earn
   nothing — the literal "people in town earning nothing" the request names. New
   `data/passiveResidentIncome.ts`: a flat, modest per-real-hour credit for every Resident
   currently, genuinely HOUSED (`housing.ts`'s own real `assignResidents()` — never a phantom
   unassigned resident; population growth's own "more homes built → more residents actually move
   in" is what grows this stream, exactly matching "have people coming into the town"). Same
   real per-id baseline/no-retroactive-payout convention `passiveNpcIncome.ts` already
   established (a first-ever call sets a baseline, an unhoused stretch is never banked for later).

## Verification plan

- The real camera-clamp measurement above (already run) proves the bug; a matching post-fix
  measurement (fit-zoom math against the same 3 viewports) proves the room fills the visible
  screen after the change.
- New `passiveIncome.test.ts` cases at the new rate/cap constants (a representative structure
  visibly earns whole cents within single-digit real minutes; the AFK cap is genuinely 1 day, not
  3).
- New `passiveResidentIncome.test.ts` (mirrors `passiveNpcIncome.test.ts`'s own real test shape):
  baseline-on-first-call, credits only while genuinely housed, an unhoused stretch never banked.
- `ExteriorScene.ts`'s own Phaser-integration code has no dedicated test (this file's established
  convention) — the camera/zoom fix is verified by the real clamp-math measurement, not a browser.
- Full gate (typecheck + server + web tests + build).
