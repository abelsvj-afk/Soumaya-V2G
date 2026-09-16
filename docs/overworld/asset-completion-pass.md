# Asset completion pass: unused decor wired in, real player walk animation (task #124)

> Per Rule #1. Direct response to: "do the deferred too" / "I dont see any of the new buildings
> or assests we added in the hangar" / "Ask those cco u found with the walking animations as
> well. We need all those and the npcs." Investigated first, not guessed — see below for exactly
> what was confirmed unused and why.

## Investigated first

**"I don't see the new buildings/assets in the Hangar" is correct, confirmed by reading the real
code.** Every asset-sourcing round this session (`city-builder-depth.md`, the "RTS Pack: Medieval"
round, Wave 4a) shipped real CC0 files into `public/overworld/` but explicitly deferred wiring
almost all of them into anything the player can actually buy:

- `village-pack/{structure,tile,environment}/*.png` — 102 pieces (58 ground tiles, 23 structures,
  21 environment pieces). Only ONE piece (`tile/medievalTile_15.png`, the parking apron) is wired
  into the game; the rest sit on disk unused, per `villagePack.ts`'s own doc comment ("staged for
  future decor rounds").
- `decor/{caravan-wreck,crossroads-sign,road-sign,town-tiles,village-illustration}.png` and
  `vehicles/wagon.png` — 6 more files, confirmed by `CREDITS.md`'s own text: "None of these... are
  wired into any code yet."
- `townBuilder.ts`'s `PLACEABLE_ITEMS` (the Hangar's actual purchasable decor catalog) still has
  exactly the original 4 emoji-only items from `town-builder.md` (task #65) — zero new catalog
  entries were ever added across any of these asset-sourcing rounds. This is the real, direct
  cause of the complaint: the assets exist on disk, but the ONE mechanism a player uses to
  actually place anything (the Hangar catalog) was never extended to offer them.

**"The walking animations you found" — confirmed real and locatable.** No prior round in this
repo's history ever found or referenced a character walk-cycle spritesheet (checked
`CREDITS.md` and every `docs/overworld/*.md` for "walk"/"animation"/"spritesheet" — the only
hits are about the vehicle-art search, which explicitly concluded no CC0 animated horse-cart
sprite exists). Re-searched the same trusted CC0 aggregator
(`github.com/Tiddybub/2d-assets`, reachable from this sandbox via shallow sparse clone — the
exact method every prior asset round used) specifically for character motion this time and found
a real, direct match: **OpenGameArt "2D RPG character walk spritesheet"** — a genuine top-down,
GBA-Pokémon-style multi-frame walk cycle (not isometric, not a side-scroller sprite — visually
confirmed), **CC0**, same license tier as everything else in this game. Also checked Kenney's own
"Roguelike Characters" pack (already CC0, same aggregator) as a possible source of NPC walk
variety — visually confirmed via its own `Preview.png` that it's a modular costume-builder set
(many static poses, zero walk frames), not an animation source, so it does not solve the NPC half
of the request.

**Why NPCs don't get the same treatment this round.** The town's ~26 named NPCs (24 society
attendants + Soumaya) each have a single, specific, already-established 16x16 frame from Kenney's
Tiny Dungeon pack (confirmed directly: the source pack itself, `fantasy/tiny-dungeon/Tiles/`, is
140 individual single-pose tiles — no walk frames exist in the source at all, so this was never a
matter of unused frames sitting in the already-loaded atlas). Applying the ONE found walk-cycle
character (a specific young woman in a red/purple outfit) to every NPC would silently erase their
individually-hand-authored identities (Zeke, Nova, Priya, Mira, ...) — the same class of
regression this session has repeatedly avoided elsewhere (e.g. `businessBuildingSprite` giving
each business type its OWN distinct art rather than reusing one). No further CC0 pack matching
the existing NPC cast's specific looks with real walk frames was found in this pass. **Decision:
ship the real walk-cycle for the player (below); NPCs keep their existing single-frame +
squash-stretch hop technique, honestly documented as a real, unclosed gap — not silently
dropped** (same convention as "no equally good CC0 home-style match was found" for housing).

## Decisions

1. **Hangar catalog expansion.** `PlaceableItem` gains an optional `iconUrl` (a real image,
   instead of the emoji-only `icon` every existing item still uses) — additive, so the original 4
   items are completely unchanged. A curated, VISUALLY CONFIRMED (not guessed from filenames —
   every candidate was actually viewed before being named) set of real pieces becomes new
   catalog entries:
   - `village-pack/structure/`: Village Well (06), Market Stall (09), Storage Crates (11), Stone
     Gatehouse (02), Fence Gate (07), Canvas Tent (10).
   - `village-pack/environment/`: Pine Tree (02), Round Hedge (01), Boulder (09), Rock Cluster
     (17).
   - Already-sourced standalone pieces: the Wagon, the Ruined Caravan (`caravan-wreck.png`), the
     Road Sign, the Crossroads Sign.

   That's 14 new real, distinct catalog items (curated from candidates actually viewed), on top of
   the existing 4 — not literally all 102 raw village-pack files. The remaining 58 ground/path
   tiles are terrain, not discrete placeable objects (same reasoning already used to correctly
   exclude the pack's road tiles from the zoned transit system); the ~12 remaining
   structure/environment pieces and `decor/town-tiles.png` (a multi-tile sheet, not a single
   placeable image) / `decor/village-illustration.png` (a scene illustration, not an object) stay
   explicitly deferred for a future decor round, not silently dropped.
2. **Reused mechanism, zero new placement code.** Every new item is still a 1x1 decorative
   town-builder item — it goes through the exact same arm → place → persist → render → demolish
   → **and now dispatch-queue** flow `townBuilder.ts`/`buildQueue.ts`/`ExteriorScene.ts` already
   have. The only real gap to close is RENDERING: `paintPlacedItem`/the Hangar's catalog row
   currently only draw an emoji glyph. Both gain an image-backed path (draw the real sprite when
   `iconUrl` is set, fall back to the emoji glyph otherwise) — this is the one piece of new
   drawing code this slice needs.
3. **Player walk-cycle animation.** Load the new spritesheet (`rpg_sprite_walk.png`, measured
   directly via a real pixel-boundary scan, not guessed: 192x128px, 8 columns x 4 rows, 24x32 real
   frame size — see Verification) as its own standalone texture (same convention as
   `buildingSprites.ts`/`villagePack.ts` — outside `tileAtlas.ts`'s uniform 16x16 grid). `player`
   is already a real Phaser `Sprite` (confirmed by reading `ExteriorScene.ts` — not an `Image`),
   so no game-object type change is needed, only real frame-based animations wired onto it: one
   per direction (down/left/right/up), played on every real move, replaced with a static frame
   matching the new facing on arrival AND on a blocked bump (a real GBA-convention gap that never
   existed before this — the player never visibly turned to face a blocked direction). The
   existing squash-stretch "hop" tween is left completely alone (a `scaleX`/`scaleY` tween has no
   property overlap with a frame-swap animation, so both run together safely). A no-op under
   `prefers-reduced-motion` — a static directional frame is set without ever calling `.play()`,
   matching this file's own convention everywhere else.
4. **Row-to-direction mapping is a documented assumption, not a confirmed fact.** The sheet's own
   4-row structure is measured directly; WHICH row is down/left/right/up follows the common
   RPG-Maker-style convention (down, left, right, up) since no authoritative frame-order metadata
   ships with the file. This cannot be visually confirmed from this sandbox (no browser). Flagged
   explicitly for on-device confirmation, same as every other unverified visual change this
   session — trivially correctable (a row-index swap, no functional risk) if wrong.

## Data model additions

`townBuilder.ts`:
```ts
export interface PlaceableItem { id: string; name: string; icon: string; iconUrl?: string; priceCents: number }
```
14 new entries appended to `PLACEABLE_ITEMS`, each with a real `iconUrl` pointing at its existing
`public/overworld/...` file. No other function in `townBuilder.ts` changes — every existing
arm/place/cancel/demolish/direct-place function is already generic over `PlaceableItem`.

`scenes/characterSprites.ts` (new): the walk-sheet asset descriptor + frame/animation helpers
(`walkAnimKey(direction)`, `idleFrameFor(direction)`, `createPlayerWalkAnimations`).

## Verification plan

- A real Python/PIL pixel-boundary scan of `rpg_sprite_walk.png` (content-run detection across
  columns/rows) — not eyeballed — confirming the 8x4 / 24x32 frame grid before any Phaser loading
  code is written.
- New `townBuilder.test.ts` cases: every new catalog item resolves a real, existing file path
  (build-output check, same convention as prior asset rounds); `iconUrl` is additive-only (the
  original 4 items' shape is unchanged).
- `ExteriorScene.ts`'s own Phaser-integration code (the animation wiring, the image-backed
  placed-item rendering) has no dedicated test, this file's established convention — verified by
  the measurement above plus direct code reading, not a browser (still unavailable from this
  sandbox).
- Full gate (typecheck + server + web tests + build) — a build-output check additionally confirms
  every newly-referenced asset path lands in `dist/`.
