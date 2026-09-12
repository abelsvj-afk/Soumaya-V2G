# Real housing/real-estate types (Stage 2.26, task #66)

> Per Rule #1. Direct answer to the user's SimCity framing: "we should ... give the NPCs
> homes ... our individual life is not identical to another" and "Hot zoning is how many homes
> there are? Where the homes can go." This is the first real estate layer — it gives zoning
> (#75) and the Hangar town-builder (#65) an actual mechanical consequence instead of a plan
> with nothing built on it yet.

## What already exists that this must reuse, not reinvent

- **`townBuilder.ts`** — the real arm-then-place interaction (buy from the Hangar, walk to a
  tile, press interact). Housing is a second, parallel armed-mode branch in
  `ExteriorScene.handleInteract()`, same shape as zoning's own parallel branch — not a rebuild.
- **`zoning.ts`** — a home can ONLY be built on tiles the player has already zoned
  `"residential"`. This is the literal mechanical answer to "hot zoning is how many homes there
  are" — zoning without this had no consequence yet; this closes that loop.
- **`townLedger.ts`** — a home costs real Town Treasury cents, same convention as Market items.
- **`npcDialogue.ts`'s `PROFILE_LIST`** — the town's real, fixed 20 society NPCs (2 per
  door-building). Gains one new export, `allSocietyNpcIds()` (stable declaration order), so
  housing has one real source of "who exists" instead of re-deriving it.
- **`buildingSprites.ts`** — COTTAGE is a real, already-loaded house illustration. Homes reuse
  it (matches Mayor's Hall's own "reuse existing art, footprint size does the differentiating"
  precedent) — no new art sourced this round (that's task #74).
- **`regionLayout.ts`'s `isPlacementBlocked`** — a home's footprint must clear the same real
  town geometry (buildings, objects, attendant posts, grass, player spawn) every other
  placement already respects. `DOOR_PLACES` itself is NOT touched — homes are dynamic,
  player-built, per-space state, not a new fixed place in the static layout.

## Resolved decisions

**1. A small catalog of 4 home types, sized by real capacity, not flavor text.**

| id | name | footprint | capacity | price |
|---|---|---|---|---|
| `cottage` | Cottage | 2x2 | 1 resident | $3.00 |
| `duplex` | Duplex | 3x2 | 2 residents | $5.00 |
| `house` | House | 3x3 | 3 residents | $7.50 |
| `apartment` | Apartment Block | 4x3 | 4 residents | $10.00 |

Capacity is the ONLY thing that produces "not identical" NPC living situations — an NPC
assigned to a `cottage` genuinely lives alone; one assigned to an `apartment` genuinely shares
with 3 others. Never an invented personality trait; a real, checkable number.

**2. Placement is gated on real zoning, not just open ground.** Every tile in the home's
footprint must be zoned `"residential"` (a stricter version of the same
`isPlacementBlocked`-clears check town-builder's 1x1 items use). A player who never zones
residential land literally cannot build a home — the exact "zoning has real consequences" the
request asked for.

**3. NPC-to-home assignment is deterministic and capacity-packed, never random.** Homes are
filled in the order they were built (their real placement order), each to its own real
capacity, walking through `allSocietyNpcIds()` in their one stable declaration order. The
first home built houses the first N npcIds; the next home houses the next N; and so on. A
town with fewer total capacity than 20 NPCs leaves the remainder honestly unhoused — never
padded or faked.

**4. No new visual behavior for the "Home" schedule state this round — deliberate, and stated
plainly.** `ExteriorScene`'s Home state already rests attendants visibly at their own building's
post (a real, deliberate reversal from earlier user feedback, docs/overworld/npc-economy.md).
Routing Home to instead pathfind to the NPC's own assigned home door is a natural next step
once homes exist, but this round does NOT touch that tween-driven state machine — it's the
most fragile part of this codebase (a real cross-tween conflict was already caught and fixed
here once, npc-autonomy.md). Shipping the real estate layer (buildable, zoned, assigned,
honestly reported) without touching working, verified NPC movement is the safer sequencing;
wiring actual home-going is tracked as a clearly-scoped follow-up, not silently dropped.

**5. Housing is reported honestly, never storytold.** A summary (`housingSummary`) shows real
counts only: how many of the 20 NPCs currently have a home, how many live alone, how many
share. No invented names for "family," no backstory — matches `MayorsHallOverlay`'s own "nothing
here is a score" convention.

## Data model

`data/housing.ts` (new, pure, localStorage-backed, same shape as `townBuilder.ts`/`zoning.ts`):

```ts
export interface HomeType { id; name; icon; width; height; capacity; priceCents }
export const HOME_TYPES: readonly HomeType[];
export interface PlacedHome { id; typeId; x0; y0; x1; y1; door: {x,y} }
export function placedHomes(spaceId): PlacedHome[];
export function armedHomeTypeId(spaceId): string | null;
export function armHomeType(spaceId, typeId): boolean;   // spends the treasury, same as armItem
export function clearArmedHome(spaceId): void;
export function canAffordHome(spaceId, type): boolean;
export function isFootprintFreeForHome(spaceId, x0, y0, type): boolean;
export function placeArmedHome(spaceId, x0, y0): PlacedHome | null;

export interface HomeResident { npcId: string; homeId: string }
export function assignResidents(spaceId): HomeResident[];
export function homeForNpc(spaceId, npcId): string | null;
export function residentsOfHome(spaceId, homeId): string[];
export interface HousingSummary { housed: number; total: number; livingAlone: number; sharing: number }
export function housingSummary(spaceId): HousingSummary;
```

`npcDialogue.ts` gains `export function allSocietyNpcIds(): readonly SocietyNpcId[]`.

`ExteriorScene.ts` gains a third parallel armed-mode branch in `handleInteract()` (anchored at
the faced tile as the footprint's top-left corner) plus `renderPlacedHomes`/`paintPlacedHome`/
`refreshPlacedHomes`, mirroring `renderPlacedItems`. Each placed home is drawn as the COTTAGE
illustration scaled to its own footprint, plus a small type-glyph badge at its door tile
(🏠/🏡/🏘️/🏢 — shape-distinct, never color-only) so the 4 types stay tellable apart even though
they share one base image.

`HangarOverlay.tsx` gains a "Housing" section (buy + arm, same shape as "Town Building").
`MayorsHallOverlay.tsx` gains a "Housing" summary section using `housingSummary`.

`OverworldRoot.tsx`: a `"home-placed"` scene event credits the Hangar with one real work hour
(`recordBuildingWork`, same as `"item-placed"`/`"tile-zoned"`), and `refresh()` calls a new
`refreshPlacedHomes()`.

## Deferred, explicitly

Routing the Home schedule state to actually walk to the assigned home (needs a careful, isolated
change to `applySocietyState`/`tickSociety`, tracked separately rather than risked here); any
NPC-authored "family" dialogue reacting to who they live with (belongs with task #59's
cross-building relationship work, which already owns NPC-to-NPC social data); any distinct art
per home type (task #74).
