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

**`overworld/village-pack/{tile,structure,environment}/*.png`** — the full "RTS Pack: Medieval"
by **Kenney** (kenney.nl/assets/medieval-rts), **CC0**, via https://github.com/Tiddybub/2d-assets
— the same author as the "Tiny Town"/"Tiny Dungeon" tiles already in `tiles.png`, so this is a
direct style match, not a new aesthetic. 102 individual 64x64 pieces (58 ground/path tiles, 23
buildings/structures — windmill, market stall, bench, well, tents — plus 24 tree/berry/crate
environment pieces), added in full per direct request ("add all those other assets... all of
them"). Only one piece is wired into the game so far: `tile/medievalTile_15.png`, a gravel/stone
tile, as a real parking-lot/loading apron painted just outside every player-built business's door
(`villagePack.ts`, `docs/overworld/city-builder-depth.md` §C). The rest — road-through-grass
tiles, the windmill/market stall/bench/well, trees/berries/crates — are staged for future decor
rounds, not yet placed anywhere. **The winding "path through grass" tiles are deliberately NOT
used for the zoned `transit`/road system**: visual inspection confirmed they're hand-painted,
organic vignettes meant for scattered placement (like Park's own tree/bench decor), not a
modular edge-to-edge autotile set — painting them systematically across every zoned road tile
would look visually broken at the seams. The existing single flat `TileFrame.path` ground tile
(already in `tiles.png`) remains the right choice for that use, per this doc's own §D.

**`overworld/decor/caravan-wreck.png`, `village-illustration.png`, `town-tiles.png`** — three more
real CC0 pieces from the same aggregator/investigation pass, added in full per the same direct
request. OpenGameArt "Caravan wreck" ([source](https://opengameart.org/content/caravan-wreck)) —
a broken-down wagon, a natural decorative pairing with the real wagon above. "Village"
([source](https://opengameart.org/content/village)) — a small illustrated village scene. "Town
Tiles" ([source](https://opengameart.org/content/town-tiles)) — a 16x16 pixel tile sheet. All
**CC0 (public domain)**. Asset completion pass (`docs/overworld/asset-completion-pass.md`, task
#124) wired `caravan-wreck.png` into the Hangar as a real "Ruined Caravan" decor item;
`village-illustration.png` (a scene illustration, not a single placeable object) and
`town-tiles.png` (a multi-tile sheet, not a single image) stay unwired — a genuinely different
shape than a discrete placeable, deferred for a future decor round rather than forced in.

**Asset completion pass (task #124) — the Hangar catalog expansion.** Direct response to real
feedback that the assets above existed on disk but were never actually purchasable anywhere.
Curated (every candidate visually reviewed before being named, never guessed from a filename) a
set of `overworld/village-pack/structure/*.png` and `overworld/village-pack/environment/*.png`
pieces into 10 new real Hangar decor items: a well (`medievalStructure_06.png`), a market stall
(`medievalStructure_09.png`), storage crates (`medievalStructure_11.png`), a stone gatehouse
(`medievalStructure_02.png`), a fence gate (`medievalStructure_07.png`), a canvas tent
(`medievalStructure_10.png`), a pine tree (`medievalEnvironment_02.png`), a round hedge
(`medievalEnvironment_01.png`), a boulder (`medievalEnvironment_09.png`), and a rock cluster
(`medievalEnvironment_17.png`) — plus the already-sourced `vehicles/wagon.png`,
`decor/caravan-wreck.png`, `decor/road-sign.png`, and `decor/crossroads-sign.png` above (4 more).
All already CC0 per their own entries above/below. The remaining ~12 structure/environment
pieces and all 58 ground/path tiles stay explicitly deferred (the tiles are terrain, not discrete
placeable objects, the same reasoning already used to exclude this pack's road tiles from the
zoned transit system).

**`overworld/characters/player-walk.png`** — a real top-down, GBA-Pokémon-style walk-cycle
spritesheet for the player character (asset completion pass, task #124, direct response to "the
cco u found with the walking animations... we need all those"). OpenGameArt "2D RPG character
walk spritesheet" ([source](https://opengameart.org/content/2d-rpg-character-walk-spritesheet)),
**CC0 (public domain)**, via the same trusted aggregator (`github.com/Tiddybub/2d-assets`) as
every other asset above. 192x128px, measured directly (a real pixel-content-boundary scan, not
guessed) as an 8-column x 4-row grid of 24x32px frames — one row per facing direction. Investigated
first for the town's existing NPCs too (Kenney's "Roguelike Characters" pack, same aggregator) —
confirmed via its own preview to be a modular costume-builder set with zero walk frames, not an
animation source, so it doesn't solve NPC motion. No CC0 pack matching each of the ~26 already-
individually-authored NPCs' own specific looks with real walk frames was found this pass — wiring
this sheet onto every NPC would have silently erased their distinct identities, so NPCs keep their
existing single-frame + squash-stretch technique; a real, honestly-documented gap, not a silent
drop.

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

