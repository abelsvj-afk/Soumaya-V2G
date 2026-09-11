# Overworld — Pokémon Reference Notes

> Internal reference, not a spec. Written before substantial overworld code, per the build
> brief's "Repository-use rule." Records what we studied, what we're borrowing **conceptually**,
> what we're implementing differently, and the hard boundary around Soumaya's domain model.
> Read alongside [idea.md](./idea.md) / [architecture.md](./architecture.md).

## Repositories studied

- **rh-hideout/pokeemerald-expansion** — primary GBA overworld reference. A C decompilation-based
  engine with data-driven maps: each map is a folder under `data/maps/<MAPNAME>/` holding a
  `map.json` (header: dimensions, tileset refs, map-section id, weather, battle scene, connections
  list, object-event list, warp-event list, coord-event/bg-event lists) plus a `scripts.pory`
  (event scripts in a small bytecode-compiled scripting language). Global tables in
  `src/data/maps/` wire map groups/ids together; `src/event_object_movement.c` drives NPC/object
  movement types; `src/field_control_avatar.c` + `src/field_player_avatar.c` drive player
  movement, collision, and warp-triggering; wild encounters are declared per map in
  `src/data/wild_encounters.json` against `src/wild_encounter.c`.
- **huderlem/porymap** — the visual editor for exactly that data model: layered tile painting
  (background/collision+elevation as a separate "metatile attributes" layer, not extra bitmaps),
  a warp/object/trigger placement UI, and a map-connections UI for stitching maps edge-to-edge
  into a continuous walkable world. We are not using Porymap itself (no `.pory`/`.json` map-bank
  toolchain in a web/TS stack) — its value here is purely conceptual: it confirms the *shape* of
  a sane authoring model (discrete maps + connections + collision layer + event layer) that we
  should mirror in our own tile-editor-free, code/data-authored equivalent.
- **pret/pokeemerald** — historical/canonical reference for the same conventions
  pokeemerald-expansion builds on (map groups, warp IDs, object-event templates, the
  metatile-attribute collision/elevation model). Used only to sanity-check that
  pokeemerald-expansion's patterns are the real, load-bearing GBA conventions and not a
  fork-specific reinvention.
- **mgba-emu/mgba** — not used for this phase. Flagged as a future option for
  emulator-driven visual-regression testing if we ever ship actual GBA-style assets through a
  ROM-adjacent pipeline; irrelevant to a Phaser/web renderer, so not adopted now.

## Borrowed conceptually (patterns we mirror)

1. **Discrete maps stitched by connections**, not one giant continuous tilemap. Each Journey
   (region) and each building interior is its own map; a `connections` list on the map data says
   which map lies north/south/east/west (or which door leads where), matching pokeemerald's
   `connections` + warp-event model. This keeps memory/render cost bounded and matches how
   Journeys are already discrete units in the domain model.
2. **A collision + "passability" layer separate from the visual tile layer.** GBA metatiles carry
   a behavior byte (collision, elevation, encounter-triggering surface) independent of which
   graphic is drawn. We mirror this with a parallel `passable: boolean` (and later `triggersEncounter:
   boolean` for "tall grass" free-thought zones) grid per map, not baked into sprite choice.
2b. **Warp events** as the sole way to change maps (walking off a map edge via a connection, or
   stepping on a door/staircase tile) — no free-floating teleports, so the player's mental model of
   "where am I" stays spatially continuous, same as the GBA games.
3. **Object events as data, not code**: NPCs/creatures/interactables are declared as
   `{ id, position, spriteKey, kind, scriptRef }` entries per map, not hand-placed imperative
   code — mirrors pokeemerald's object-event templates and keeps the adapter layer (API data →
   world entities) a pure data transform.
4. **A small, declarative interaction-script model** for "walk up + talk," matching the spirit of
   `.pory` scripts (a scoped, replayable definition of "what happens when you interact with X") —
   implemented as plain TypeScript handler functions keyed by entity kind, not a bytecode DSL;
   GBA needed a compact bytecode language for ROM-size reasons that don't apply to a web app.
5. **Map-section/region identity distinct from the visible map** (GBA's `region_map_section_id`,
   used for the Pokédex-style world map + location name banner) — we mirror this as each map
   carrying a `journeyId`, so the region/world-map screen and the "you are entering X" banner can
   be derived from data already on the map, not hand-maintained separately.

## Implemented differently (and why)

- **No bytecode scripting engine.** GBA used `.pory`→bytecode because the target was a ROM with
  no filesystem/interpreter. We're a TypeScript web app; interaction logic is plain async
  functions dispatched from data, which is strictly more debuggable and testable (`npx tsx` /
  vitest) than reproducing a mini VM.
- **No manual tile-by-tile map authoring tool.** Porymap's role (hand-painting hundreds of
  official maps) doesn't apply — our "maps" are largely **procedurally laid out from live API
  data** (a Journey's nodes become creature spawn points on a generated or hand-designed-template
  region map), so map content is data-driven at runtime, not asset-authored per map. Building
  interiors (Bank, Library, etc.) *are* small hand-authored fixed layouts, closer to Porymap's
  model, but are still expressed as plain TS/JSON, not a `.pory`/binary map format.
- **No battle system, no encounter RNG combat.** Per the brief and the user's explicit choice,
  there is no combat mechanic at all — "wild encounters" conceptually become capture-flow triggers
  only (walking into a free-thought zone opens the capture menu), never a battle.
- **No save-state/cartridge model.** Persistence is the existing Soumaya API + SQLite per
  `space_id`, not a save file — "your world" is just today's graph rendered spatially; there is no
  separate overworld save format to keep in sync.
- **World size is bounded by real data, not authored by hand at GBA scale.** A region's shape
  responds to how many nodes/edges a Journey actually has, so the world doesn't need (and can't
  have) hundreds of hand-placed maps up front — it starts with a handful of building interiors
  plus one generated-layout exterior map per Journey.

## Domain boundary (must never blur)

| Layer | Owns | Never touches |
|---|---|---|
| `packages/shared` | Node/Edge/Journey/Finance/Insight types, zod schemas, `celestial.ts` mass/decay math | Any rendering concept — no tile coords, sprite keys, or map ids belong here |
| `packages/server` | API routes, repositories, ingestion, LLM/embedding provider seams, `space_id` scoping | Never returns tile/pixel/sprite data — only domain data (as today) |
| **Overworld presentation layer (new)** | Tile maps, sprites, collision, the adapter that turns API responses into world entities, all Phaser/rendering code, input handling | Never invents new domain fields client-side; if the game needs a fact the API doesn't expose (e.g. "days since last visited"), that's a **shared/server change requested explicitly**, not inferred in the renderer |

**Never change in `packages/shared`:** the wire types themselves, `celestial.ts`'s mass/decay
formulas, zod schemas' field semantics — the overworld reads what these already produce
(`importance`, `degree`, `emotionalWeight`, `mass`, `classify()` tier, and whatever
recency/decay signal the vertical-slice spec identifies) and maps tiers → rarity/sprite, it does
not redefine them.

**Never change in `packages/server`:** route contracts, `space_id` scoping, auth/space
middleware, rate limiting, the offline/heuristic fallback behavior. The overworld is a pure
consumer of the existing `api/client.ts`-shaped contract; if a genuinely new read is needed
(e.g., a lightweight "last reviewed at" timestamp per node) it goes through the same
validate → delegate → json pattern as every other route, proposed as an explicit, additive,
backward-compatible change — never inferred or faked client-side.
