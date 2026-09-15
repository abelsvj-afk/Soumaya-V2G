# Soumaya · Second Brain — Asset Credits

## Overworld pixel art

**`overworld/tiles.png`** — a hand-curated frame atlas (16x16 tiles) assembled from two Kenney
(kenney.nl) asset packs, both released under **CC0 1.0 (public domain)** — no attribution
legally required, credited here anyway as good practice:
- "Tiny Town" — ground (grass/path/flowers), and (task #74) a tree, a second tree, a bench, a
  fence post, and a mushroom — real Park decor, sourced the same way as the rest of this atlas
  (`github.com/shorepine/kenney`, `2d/Tiny Town/Tiles/tile_0004.png`/`0005`/`0081`/`0045`/`0029`).
- "Tiny Dungeon" — the player character, the per-NodeType creature sprites, and one attendant
  NPC sprite per building — no new sourcing needed, the pack already had enough distinct
  humanoid characters to give every building its own look.

(An earlier pass also drew each building from small modular wall/door/roof tiles in this same
atlas; real user feedback — "that's not appropriate... find already made building assets" —
replaced that with the complete building illustrations below. 5 of the now-unused wall/door/roof
frames were repainted with the real Park decor above (task #74) rather than staying blank; the
rest were left in place in `tiles.png` rather than renumbering the whole atlas, but nothing
references them anymore.)

Sourced via the community mirror https://github.com/shorepine/kenney (same CC0 assets,
reorganized for programmatic access) — **not** from any of the Pokémon reference repos named in
docs/overworld/pokemon-reference.md, whose tile/sprite graphics are Nintendo's copyrighted
assets and were consulted for architecture only, never for art.

**`overworld/buildings/*.png`** (`human-city.png`, `human-city2.png`, `human-city3.png`,
`human-city4.png`, `lighthouse.png`) — 5 complete, pre-made building illustrations (a house, an
arched hall, a round tower, a flagged tower, and a lighthouse), used one-per-building
(`buildingSprites.ts`) instead of assembling buildings from small kit tiles. From the "Old stone
buildings" pack (the Battle for Wesnoth "human city" set) — **CC0 (public domain)**, originally
on [OpenGameArt](https://opengameart.org/content/old-stone-buildings), sourced via the CC0
aggregator https://github.com/Tiddybub/2d-assets (its own `LICENSE` + each pack's `SOURCE.md`
confirm CC0). No attribution legally required; credited here as good practice.

**`overworld/buildings/inn.png`, `tavern.png`, `warehouse.png`** — 3 more complete, pre-made
building illustrations (backlog #78, giving the 3 real business types — Bakery/Tailor/Bookshop —
their own distinct silhouette instead of all three sharing `human-city2.png`). Same aggregator
and license as above — OpenGameArt "Inn" ([source](https://opengameart.org/content/inn)),
"Tavern" ([source](https://opengameart.org/content/tavern)), and "Warehouse"
([source](https://opengameart.org/content/warehouse)), all **CC0 (public domain)**, via
https://github.com/Tiddybub/2d-assets. Hand-picked from several candidate packs in the same
aggregator for visual consistency with the existing painterly stone/wood illustration style —
other candidates (a fisherman's stilt house, a hunter's tent) were checked and rejected for
being a different art style or too specifically themed to read as a generic building. Housing's
4 types still share one illustration (`human-city.png`) — no equally good additional CC0
home-style match was found in this pass; the type-glyph badge remains the distinguishing cue
there, same as before.

**`overworld/vehicles/wagon.png`, `overworld/decor/road-sign.png`, `overworld/decor/
crossroads-sign.png`** — a real horse-drawn covered wagon illustration plus two matching
wayfinding signs (`docs/overworld/city-builder-depth.md`, direct response to a request for a
transportation system "like city builder games"). Same aggregator/license family as every
building illustration above — OpenGameArt "Caravan" ([source](https://opengameart.org/content/
caravan)), "Road sign" ([source](https://opengameart.org/content/road-sign)), and "Crossroads
sign" ([source](https://opengameart.org/content/crossroads-sign)), all **CC0 (public domain)**,
via https://github.com/Tiddybub/2d-assets — the same author/style family as the caravan, so they
read as one cohesive set. Investigated first, not guessed: no dragon-carriage sprite (2D or
otherwise usable) and no animated horse-cart spritesheet exist in any CC0 source reachable from
this sandbox — the only dragon asset found (`oga-dragon`) is an unlit grey 3D clay render,
unusable without real texturing this session can't do blind, and Kenney's "RPG Urban Pack" (the
only pack with animated vehicle sprites) is modern-city car art, a real style clash with this
game's fantasy illustration mix. Per the user's own direction: ship the real wagon now; a dragon
carriage or further vehicle tiers stay explicitly deferred until real matching art exists.

## Overworld music

**`ambient-loop.mp3`, `interstellar.mp3`, `slow-tide.mp3`** — the same 3 tracks the old 3D
galaxy let a pilot switch between, reused as the Overworld's background music at the user's
explicit direction (`lib/music.ts`'s `MUSIC_TRACKS`, switchable via the ⏭️ button on the
canvas). These files predate the Overworld and have **no license/attribution documentation
anywhere in this repo or its history** — their original source is unknown. An earlier pass
generated a procedurally-synthesized replacement specifically to avoid that gap, but the user
asked for genuine pre-made tracks instead (a from-scratch synth loop "didn't sound like game
music" — fair) and, since this session's sandboxed network egress blocks every reachable
free-asset site (kenney.nl, opengameart.org, itch.io, freesound.org) it could otherwise source
from, pointed at these pre-existing files as the fallback. **Verify/retain their actual source
and license before relying on this for public/commercial distribution** — same caution as
`ship-engine-start.mp3` below.

## Removed (2026-09-15 audit cleanup)

The 3D galaxy this Overworld replaced (2026-09-11) left ~40MB of its own assets on disk with
zero code references anywhere — `*.glb` models (blackhole, dyson-sphere, star-center, sun,
aura-satellite, organic-spaceship, E45-fleet, soumaya-ship, space_station_3), `milkyway-eso.jpg`,
`ship-engine-start.mp3`/`ship-engine-loop.wav`, and the `draco/`/`basis/` glTF-loader libraries
those models needed. Confirmed via a repo-wide grep before deleting (dead weight, not a
functional gap — see `docs/overworld/gameplay-uiux-audit-2026-09-15.md`). Their own licensing
(several, including `blackhole.glb`'s real CC-BY-4.0 Sketchfab attribution, were the only
credited entries this section used to carry) is preserved in git history
(`git log -p -- packages/web/public/CREDITS.md`) if any of them are ever restored.

