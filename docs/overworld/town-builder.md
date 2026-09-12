# Town Builder — the Hangar becomes a real placement system (Stage 2.18, task #65)

> Per Rule #1. Direct quote from the request this answers: "you're able to go to the hangar, and
> that's where you can select items to be placed in the map... more N pcs, more homes... more park
> pieces... think of Sims." This doc specs the FIRST real slice: the actual place-something-on-
> the-map mechanism. Multi-tile buildings (real housing types, new business types) are real,
> separate design problems layered on top of this — tracked as #66/#67, both blocked on this
> landing first, not attempted in the same pass.

## What already exists that this must reuse, not reinvent

- **A real spendable currency**: `townLedger.ts`'s Town Treasury (`treasuryBalanceCents`,
  `spendFromTreasury`) — real earned wages, never Fuel/finance. `marketGoods.ts` already spends
  it on a small cosmetic catalog with an identical "afford → spend → own" shape.
  Reused directly for the price of a placeable item.
- **A real "is this tile free" predicate**: `regionLayout.ts`'s exported `isPlacementBlocked` —
  already excludes building interiors, standalone objects, attendant patrol tiles, the grass
  zone, and the player spawn tile. Exactly the base check a placed item needs too.
- **A real "this was genuine work" event**: `recordBuildingWork(spaceId, "hangar")` — already
  fires on every Hangar cosmetic change; a placement is the same kind of event.
- **The achievement-gate pattern** `hangarOptions.ts` already uses for ships/figurines
  (`loadUnlocked`/memory-count thresholds) — reused for which catalog items are available, so
  nothing new is invented for "earning" the ability to place something.

## The interaction model

Two steps, matching the request's own "go to the Hangar to select, then place it in the world":

1. **Select + buy, in the Hangar.** A new "Town Building" section lists a small catalog of
   placeable items (v1: decorative only — see scope below). Buying one spends the real treasury
   immediately (same as a Market purchase) and "arms" it — stored as one pending
   `armedItemId` per space (never a queue; buying a second item while one is already armed just
   re-arms to the new one, matching a Pokémon-style "selected item from the bag," never stacking
   complexity into v1).
2. **Place it, in the world.** Pressing interact (A) while an item is armed AND the tile directly
   in front of the player is free (`isPlacementBlocked` plus: not already occupied by another
   placed item, not currently standing under a creature) places it there, persists it, and clears
   the armed state. Facing an occupied/blocked tile while armed is a silent no-op (tolerate
   gracefully, matching every other interact-miss in this scene) — no error toast, matching the
   no-dark-patterns rule.

This reuses the exact `events.emit("...")` → `OverworldRoot.tsx` handler → real mutation →
`scene.set...()` re-render round-trip every other real action in this scene already follows
(`greet-creature` → `greetCreature` → `refresh()` → `setCreatures`).

## Scope for this slice (v1) vs. deferred

**This slice**: a small, fixed catalog of **1x1, decorative-only** items (a garden bed, a bench, a
lamp post, a banner post — no interior, no attendants, no door). Proves the whole mechanism:
buy → arm → place → persist → render → block future creature placement on that tile → block future
player movement onto it, exactly like a real object.

**Deferred, explicitly**: multi-tile footprints, real housing types with any mechanical meaning
(#66), new business building types with their own attendants/wages/overlay (#67), and any "NPCs
react organically / gain a new destination" behavior for a placed item — the last one needs a
placed item to actually be a real place NPCs can path to, which only makes sense once a placed
item has NPC-relevant substance (housing/business), not for inert v1 decor.

## Data model

`data/townBuilder.ts` (new, pure, localStorage-backed — same convention as `marketGoods.ts`):

```ts
export interface PlaceableItem { id: string; name: string; icon: string; priceCents: number }
export interface PlacedItem { id: string; itemId: string; x: number; y: number }

export const PLACEABLE_ITEMS: readonly PlaceableItem[];
export function placedItems(spaceId): PlacedItem[];
export function isTileOccupiedByPlacedItem(spaceId, x, y): boolean;
export function armedItemId(spaceId): string | null;
export function armItem(spaceId, itemId): boolean;   // validates catalog id + affordability, spends treasury, arms
export function clearArmedItem(spaceId): void;
export function placeArmedItem(spaceId, x, y): PlacedItem | null; // validates tile is free, persists, clears armed
```

Creature placement (`loadWorldSnapshot.ts`'s `placeCreaturesOnGrid` call) gets its `isBlocked`
callback extended to also check `isTileOccupiedByPlacedItem`, so a creature can never be placed on
top of something the player already built — the one integration point outside the new module.

## Accessibility / motion

Placing an item is instant (no tween needed — it simply appears), so there is no
`prefers-reduced-motion` concern to design around here, unlike every other moving-sprite feature
this session.
