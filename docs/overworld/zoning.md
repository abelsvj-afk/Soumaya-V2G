# Zoning — the real SimCity foundation under housing and business (Stage 2.21, task #75)

> Per Rule #1. Direct quote: "I also need zoning to be a thing... hot zoning is how many homes
> there are, where the homes can go, where sidewalks for the NPCs can go, where transportation
> services... can go, [where] commercial buildings can go to earn income... for the N PCs." This
> doc specs zoning as its own real layer — tasks #66 (housing) and #67 (business types) both now
> depend on this landing first, since "where X is allowed to go" is exactly what zoning defines.

## What already exists that this must reuse, not reinvent

- **The exact same arm-then-place interaction** town-builder (#65, shipped) already built: select
  something in the Hangar, then walk to a tile in the world and press interact to act on it.
  Zoning reuses this shape (arm a zone type instead of an item) rather than inventing a second
  interaction model.
- **`isPlacementBlocked`** (regionLayout.ts) — the same "is this tile free of real town geometry"
  check town-builder already uses, reused unchanged for "can this tile be zoned at all."
- **857 of 1104 tiles are already open ground** (measured in the town-builder round) — zoning
  operates on the region that already exists; this doc does not require growing the map.

## Resolved decisions

**1. A zone is a per-tile tag, not a drawn region.** Matches the tile-at-a-time town-builder
mechanic exactly: arm a zone type in the Hangar, walk to a tile, press interact, that ONE tile is
tagged. No minimum contiguous shape is enforced in this slice — a real SimCity-style "must zone in
blocks" refinement is possible later but adds real complexity (shape validation) this slice
doesn't need to prove the mechanism.

**2. Four real zone types, matching the request exactly**: `residential` (where a home, #66, may
later be placed), `commercial` (where an income-earning business, #67, may later be placed),
`sidewalk` (an NPC-walkable designation — cosmetic/organizational only; NPCs can already path
across any open ground via `isNpcPathPassable`, so this never changes passability, it just marks
intent), and `transit` (a bus/train STOP marker — explicitly never cars, per the request). Actual
moving buses/trains are a real, separate mechanic and are NOT built in this slice — `transit`
zoning marks where a stop would go, nothing moves yet. Stated plainly as deferred, not hidden.

**3. Zoning itself is free; building on a zone costs real treasury.** SimCity's own model, and
consistent with what's already real here: planning (zoning) and paying (constructing) are
different moments. `armZoneType`/`zoneTileAt` never touch `townLedger.ts` — only the eventual
home/business placement (#66/#67) will spend the treasury, the same way town-builder's decor
items already do.

**4. Town-builder's existing decor items (#65) stay zone-agnostic.** A garden bed or bench can
still be placed on any open tile regardless of zoning — zoning only gates FUTURE housing/business
placement (#66/#67), which don't exist yet. Keeps this slice's integration surface to one new
module plus one new interact-mode, not a retrofit of what's already shipped.

**5. The real "positive or negative effect on the economy"** the request asks for becomes
mechanically real once #66/#67 land (a home/business can only go on its matching zone type — an
unzoned or wrong-zoned tile simply can't take one). This slice's own honest contribution is a
real, visible **zoning plan read-out** (counts per type) — not an invented score — surfaced
somewhere real users can check their own plan before building on it.

## Data model

`data/zoning.ts` (new, pure, localStorage-backed — same shape as `townBuilder.ts`):

```ts
export type ZoneType = "residential" | "commercial" | "sidewalk" | "transit";
export interface ZonedTile { x: number; y: number; type: ZoneType }

export function zonedTiles(spaceId): ZonedTile[];
export function zoneTypeAt(spaceId, x, y): ZoneType | null;
export function isTileZonable(spaceId, x, y): boolean;   // isPlacementBlocked, nothing else yet
export function armedZoneType(spaceId): ZoneType | null;
export function armZoneType(spaceId, type): void;         // free — no treasury check
export function clearArmedZone(spaceId): void;
export function zoneTileAt(spaceId, x, y, type): ZonedTile | null; // overwrites any existing tag
export function zoneCounts(spaceId): Record<ZoneType, number>;
```

## Interaction + rendering

A second, parallel "armed mode" in `ExteriorScene.handleInteract()`, checked alongside (not
merged with) the existing armed-item check from town-builder — kept separate rather than forcing
a shared abstraction between two conceptually different actions (placing a thing vs. tagging a
tile), matching this session's own precedent (`walkSoumayaPath` vs. `walkPath`). Zoned-but-unbuilt
tiles render as a subtle, low-alpha text glyph — a distinct SHAPE per type (🏠 residential, 🏪
commercial, ➰ sidewalk, 🚏 transit), never a color-only cue, consistent with every other marker in
this scene. A new "Zoning" section in the Hangar lets the player arm a zone type (free) the same
way the existing "Town Building" section already arms a purchasable item.

## Deferred, explicitly

Minimum contiguous zone shapes; moving buses/trains (only the stop marker exists); any automatic
rezoning; a "zoning score" beyond the honest per-type count read-out. All become real once #66/#67
actually place something on a zoned tile.
