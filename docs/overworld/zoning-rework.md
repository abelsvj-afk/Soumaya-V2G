# Zoning at true SimCity scale (Stage 2.36, task #77)

> Per Rule #1. Direct, repeated, emphatic real feedback on the zoning shipped in `zoning.md`
> (task #75): *"you're only zoning, like, one small square... you gotta really take a step back
> and look at the SimCity's zoning, like, how they zone... there can't be one small square tile
> in the game that should just zone for residential when a building is gonna need more than just
> that one tile space... you need to be at a zone, like, a lot of space at one time, not just one
> tile... the fact that you have to go back to the hangar to do it again, to zone one block at a
> time is... too slow and doesn't make sense."* Two distinct, separable complaints, both real and
> both confirmed by reading the shipped code (`data/zoning.ts`) before writing anything:

1. **Every single tile requires a fresh Hangar trip.** `zoneTileAt()` calls `clearArmedZone()`
   as its last line — the armed type is gone the instant one tile is painted, forcing the player
   back to the Hangar to re-arm before the next tile. Confirmed directly in the source, not
   assumed.
2. **There is no way to designate an area — only one 1x1 tile per interact press.** No brush, no
   drag-rectangle, nothing SimCity's own zoning tool does by letting a player draw a block at once.

## What does NOT need to change

- The underlying model (a zone is a per-tile tag, `ZoneType` = residential/commercial/sidewalk/
  transit, zoning itself is free) stays exactly as `zoning.md` decided — that part of the design
  was never the complaint. This doc is scoped to the *painting ergonomics* only.
- `isTileZonable`/`isPlacementBlocked` (the real town-geometry check) is reused unchanged for
  every tile in an area, exactly as it already gates a single tile.
- Housing/business placement (#66/#67) already places a whole multi-tile footprint in one
  interact press — that part of "place buildings" was never actually 1-tile-at-a-time. This round
  only touches the zoning *tagging* phase, which genuinely was.

## Resolved decisions

**1. Arming a zone type now persists across paints.** `zoneTileAt()` no longer clears the armed
type after painting. A player arms once in the Hangar, then can walk anywhere in town and press
interact tile after tile without a single additional Hangar trip. Arming a *different* type (or a
zone-area commit — see below) still replaces the current arm, same as today; nothing new needed
there.

**2. A real area/brush mode, adapted to grid movement + one action button (no mouse-drag exists
in this game).** The Hangar's Zoning section gains a second control per zone type: **Tile** (the
existing one-press-one-tile behavior, now persistent per decision 1) and **Area** (new). In Area
mode:
   - The first interact press on a zonable tile sets that tile as a visible **anchor** (a
     highlighted marker) — nothing is zoned yet.
   - The second interact press, anywhere else in the world, commits the full **rectangle**
     between the anchor and the current tile (inclusive), zoning every zonable tile inside it in
     one action and skipping any tile blocked by real town geometry — the same silent-skip
     convention `isTileZonable` already uses for a single tile.
   - The armed type/mode is NOT cleared after a commit — the anchor clears, but the player can
     immediately start a new rectangle elsewhere, chaining multiple areas without returning to
     the Hangar. This is the actual "a lot of space at one time" fix, not a cosmetic rename of
     the same 1x1 mechanic.
   - No artificial size cap: the user explicitly does not want small-scale zoning, so the
     rectangle can span as much of the open map as the two chosen corners cover.

**3. A persistent "zoning active" indicator + one-tap Stop, so leaving the tool armed forever is
never silently confusing.** Since arming no longer auto-clears, the always-visible `TownHud`
(task #73) gains a small chip whenever a zone type is armed — `🏠 Zoning: Residential (Area)` —
with an inline **Stop** button that disarms from anywhere in the world, no Hangar trip required
to *stop* either. This directly closes the loop: the Hangar is now needed to START a zoning
session (arm a type/mode) but never again mid-session, and stopping is equally a single tap from
wherever the player is standing.

**4. Live rectangle preview is explicitly deferred.** Showing a shaded rectangle outline that
grows as the player walks from the anchor toward the second corner would be a nice SimCity-style
touch, but requires a per-frame recompute in `ExteriorScene.update()` — real added engine risk
for a cosmetic improvement. This round ships the anchor marker + commit-on-second-press
mechanism (which already fully solves both real complaints); a live preview is a legitimate
future refinement, not required to prove the mechanism.

## Data model changes (`data/zoning.ts`)

```ts
export type ZoneMode = "tile" | "area";

export function armedZoneMode(spaceId): ZoneMode | null;      // paired with armedZoneType
export function armZoneType(spaceId, type, mode = "tile"): void; // now also clears any pending anchor
export function zoneAnchor(spaceId): { x: number; y: number } | null;
export function setZoneAnchor(spaceId, x, y): void;
export function clearZoneAnchor(spaceId): void;
export function zoneRectangle(spaceId, x0, y0, x1, y1): ZonedTile[]; // normalizes corners, zones every zonable tile, does NOT clear the arm
export function disarmZoning(spaceId): void;                   // clearArmedZone + clearZoneAnchor, for the HUD Stop button
```

`zoneTileAt()` keeps its existing single-tile-paint signature and behavior, minus the
`clearArmedZone()` call at the end (decision 1).

## Interaction (`ExteriorScene.handleInteract()`)

The existing zoning branch (`if (armedZoneType(this.spaceId))`) now checks the armed mode:
- **Tile mode**: unchanged logic, minus the auto-clear (now removed at the data layer).
- **Area mode**: no pending anchor → try to set one (silent no-op if the faced tile isn't
  zonable, same convention as everywhere else); pending anchor → commit the rectangle between the
  anchor and the current faced tile, paint every real zoned tile returned, clear the anchor
  marker, keep the arm active.

## Deferred, explicitly

Live rectangle preview (decision 4); a minimum/maximum rectangle size; SimCity-style "must zone
in blocks aligned to a grid" shape rules; a broader "increase placement options" pass beyond
zoning specifically (tracked separately — task #78's building-art diversity and any future
placement-menu work).
