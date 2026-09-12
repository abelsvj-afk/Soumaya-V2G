# A real multi-business economy (Stage 2.27, task #67)

> Per Rule #1. Direct answer to "commercial buildings can go to earn income for also for work
> for the NPCs" and "I also don't want... [just one Market]" (the task's own name: "more than one
> Market"). Mirrors housing.md (task #66) almost exactly on purpose — the same real pattern
> (zoning-gated, player-built, treasury-priced) now applied to the OTHER zone type that, until
> this round, also did nothing: `"commercial"`.

## What already exists that this must reuse, not reinvent

- **`zoning.ts`** — a business can only be built on tiles zoned `"commercial"`, the exact same
  gate housing.md put under `"residential"`. Since a tile holds exactly one zone type at a time
  (re-zoning overwrites, zoning.ts's own rule), a home and a business can never legally target
  the same tile — the zoning gate alone prevents that overlap, no extra cross-check needed.
- **`housing.ts`'s own shape** (`HomeType`/`PlacedHome`/arm-then-place/`isFootprintFreeForHome`)
  — `business.ts` mirrors it field-for-field for a `BusinessType`/`PlacedBusiness`, the same
  proven, just-shipped pattern, not a new one invented from scratch.
- **`marketGoods.ts`'s `MarketGood` shape** — every business type gets its OWN small real goods
  catalog in the same `{id, name, icon, priceCents}` shape, spent from the same real Town
  Treasury (`townLedger.ts`).
- **`buildingNeglect.ts`/`townLedger.ts`'s `creditHour`/`markWorked`** — both are ALREADY
  string-keyed (`placeId: string`, not the closed `PlaceId` union), confirmed by reading the
  actual signatures before assuming a type change was needed. A placed business's own dynamic id
  (`business-<placedId>`) works as a key with zero changes to either file — a real interaction
  (buying a good there) credits THAT business's own hours and resets THAT business's own neglect
  clock, exactly like a static door-building's `recordBuildingWork` does, just without going
  through `npcJobs.ts`'s `PlaceId`-typed wrapper (which only exists for the 13 static places).
- **`buildingSprites.ts`'s ARCHED_HALL** — Market itself already reuses this "marketplace"
  illustration; every placed business reuses it too (same "no new art this round" convention as
  housing's COTTAGE reuse) — task #74 covers real art sourcing.

## Resolved decisions

**1. A small catalog of 3 business types, each with its own real goods.** Bakery (2x2, $4.00),
Tailor (3x2, $6.00), Bookshop (3x3, $8.00) — each with 3 small cosmetic goods of its own (never
overlapping Market's own catalog, so buying the same kind of thing twice is never possible by
accident). Buildable only on commercial-zoned ground.

**2. Entering a placed business is stepping onto its own door tile — not a facing-and-pressing-A
interact like town-builder/zoning/housing placement.** This matches how a real door-building
already works (`afterStep`'s `doorPlaceAt` check) rather than an `ObjectPlace`'s
approach-and-press-A. `afterStep` gains one more real check, `businessDoorAt`, right alongside
the static one — a second, dynamic door lookup, not a rework of the static one.

**3. A generic `BusinessOverlay`, not one hand-built screen per type.** Parameterized by the
placed business's own type + real goods catalog + real treasury balance — the same generic shape
`MarketOverlay` already has, just not hard-coded to `MARKET_GOODS`. Buying a good there credits
that business's own real hours/neglect (decision above), same as any other building's own real
interaction.

**4. Explicit, deliberate simplification carried over from housing.md: no new collision
enforcement for placed footprints.** `isMovementPassable` (regionLayout.ts) does not yet know
about ANY dynamic placement — a placed decor item, a placed home, and now a placed business are
all walkable-through today (this predates this round; town-builder's decor items were never
blocking either). Threading `spaceId` into the pure, space-agnostic movement/collision layer is a
real architecture change, not a small one, and is explicitly NOT attempted here — noted plainly,
same as housing.md's own NPC-pathing deferral, rather than silently left undocumented.

**5. Honest reporting, never a new score.** `MayorsHallOverlay` gains a small "Business Neglect"
list (same shape as its existing door-building "Town Health" list) over the town's real placed
businesses — real counts and real neglect state only, no invented performance metric.

## Data model

`data/business.ts` (new, pure, localStorage-backed, mirrors `housing.ts`):

```ts
export interface BusinessGood { id; name; icon; priceCents }
export interface BusinessType { id; name; icon; width; height; priceCents; goods: readonly BusinessGood[] }
export const BUSINESS_TYPES: readonly BusinessType[];
export interface PlacedBusiness { id; typeId; x0; y0; x1; y1; door: {x,y} }
export function placedBusinesses(spaceId): PlacedBusiness[];
export function armedBusinessTypeId(spaceId): string | null;
export function armBusinessType(spaceId, typeId): boolean;
export function clearArmedBusiness(spaceId): void;
export function canAffordBusiness(spaceId, type): boolean;
export function isFootprintFreeForBusiness(spaceId, x0, y0, type): boolean;
export function placeArmedBusiness(spaceId, x0, y0): PlacedBusiness | null;
export function businessDoorAt(spaceId, x, y): PlacedBusiness | null;
export function businessById(spaceId, id): PlacedBusiness | null;
export function ownedGoodIds(spaceId, businessId): Set<string>;
export function canAffordGood(spaceId, good): boolean;
export function purchaseGoodFromBusiness(spaceId, businessId, goodId): boolean; // credits real work
export function businessNeglect(spaceId, business): number; // wraps buildingNeglect, business-<id> key
```

`ExteriorScene.ts` gains a 4th parallel armed-mode branch (business placement), render/paint/
refresh methods mirroring homes (ARCHED_HALL illustration + type-glyph badge), and one more
`afterStep` check for `businessDoorAt`, emitting `"enter-business"` with the business's real id.

`OverworldRoot.tsx` gains a `{ kind: "business"; businessId: string }` overlay variant, an
`"enter-business"` listener that opens it, and a `refreshPlacedBusinesses()` call.

`HangarOverlay.tsx` gains a "Business" section (buy + arm, same shape as "Housing").
`MayorsHallOverlay.tsx` gains a "Business Neglect" section.

## Deferred, explicitly

Real collision blocking for any placed footprint (decision #4); NPCs working AT a placed
business (task #68's "town runs without the player" territory — these are player-run shops, not
staffed ones, this round); any distinct art per business type (task #74).
