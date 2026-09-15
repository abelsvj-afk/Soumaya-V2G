# City-builder depth: zoom, doors, building-type ground art, roads, vehicle transit

Direct answer to a real, detailed multi-part request: camera zoom to see the whole town like a
city-builder, highlighted doors, ground art matching each building's own type (a parking lot for
a business, the way zoomed-in city-builder games show it), real roads with NPC-width sidewalks,
and a transportation system (starting with the real horse-drawn covered wagon sourced this
round) that travels the roads with genuine tweened movement — never an instant teleport. Resolved
here, per Rule #1, before any of it is coded; this round ships the two self-contained,
independently-valuable pieces (camera zoom, door highlighting) and specs the rest for the
following rounds so they can go straight to code.

## Asset research (done this round)

Same trusted CC0 aggregator every existing building/tile in this game already comes from
(`github.com/Tiddybub/2d-assets`, OpenGameArt originals, `public/CREDITS.md`'s own convention).
Searched exhaustively for "horse-drawn carriage," "dragon-drawn carriage," and general
cart/wagon/vehicle assets:

- **Found and shipped this round**: a real covered wagon illustration (`oga-caravan`, OpenGameArt
  "Caravan," CC0) — painterly/isometric style, the same rough visual family as the 8 illustrated
  buildings already in `buildingSprites.ts` (not a pixel-tile — those are ALSO illustrations, not
  16x16 tiles, so this fits the precedent exactly). Plus two matching signage pieces from the same
  author/style family: `oga-road-sign` and `oga-crossroads-sign` — real wayfinding signs for road
  decor. All three copied to `public/overworld/vehicles/wagon.png` and
  `public/overworld/decor/{road-sign,crossroads-sign}.png`; `CREDITS.md` gets the same sourcing
  writeup as every prior asset pass.
- **Not found, not invented**: no dragon-carriage sprite (2D or otherwise usable) and no animated
  horse-pulling-cart spritesheet exist in any reachable CC0 source — confirmed by direct
  investigation (catalog search across 1101 packs, visual inspection of every carriage/vehicle-
  adjacent hit), not assumed. The one dragon asset found (`oga-dragon`) is an unlit grey 3D clay
  render, unusable in a 2D game without real texturing work this session can't do blind. Per the
  user's own resolution: ship the real wagon now; a dragon carriage or further vehicle tiers are
  explicitly deferred until real matching art exists, not built as a compromise now.
- **Roads themselves need no new art**: `tileAtlas.ts` already has an unused-beyond-Park `path`
  ground frame (`TileFrame.path`, index 3, real Tiny Town CC0 tile) — the exact flat dirt-path
  look already established in-world. Reused directly for road tiles rather than importing the
  differently-styled `medieval-rts`/Kenney "RPG Urban Pack" road art (checked and rejected: the
  RPG Urban Pack's modern car/parking-lot art is a real style clash with this game's fantasy
  pixel-tile + painterly-building mix, the same "different art style" rejection reasoning already
  applied to prior asset passes this session).

## A. Camera zoom (this round)

`ExteriorScene.ts`'s camera is currently fixed at `setZoom` default (1x), following the player
with `RESIZE`-mode bounds already covering the whole `worldBoundsTiles()` region (backlog #80).
Real, minimal addition: a zoom level state (`this.zoomLevel`, clamped `[0.4, 1]`), changed by a
new input (mouse wheel `wheel` event already available via `this.input.on("wheel", ...)`, plus a
touch pinch gesture is deferred — real pinch-to-zoom needs two-pointer tracking this round
doesn't have infrastructure for; a simple on-screen +/- zoom button pair covers touch instead,
next to the existing Settings/Next-track/Mute row). `cameras.main.setZoom()` applied directly —
Phaser already re-clamps the camera's followed position to its `setBounds` rectangle at any zoom,
confirmed by reading `Phaser.Cameras.Scene2D.Camera`'s own bounds-clamping code path (it operates
on the camera's effective viewport in world space, zoom-aware). No new engine state beyond the
clamped zoom number; `prefersReducedMotion()` gates only the transition tween between zoom steps
(the zoom level itself isn't decorative motion, so it's never disabled outright, matching how this
file treats camera pans like `flyToNode` — instant under reduced motion, animated otherwise).

## B. Door highlighting (this round)

Every door tile already renders as part of a building's illustration with no distinct marker —
confirmed by reading `drawGround()`; the door is only findable by walking up and triggering it.
Real fix: a small always-visible door pictograph (`addDoorMarker()`, reusing the same
`Phaser.GameObjects.Text` convention as every other in-world marker in this file, not new art) —
non-color-only by construction (a door glyph, not a color highlight, matching CLAUDE.md's
non-negotiable rule), gently pulsing in scale so it reads as "the way in" against the building
illustration behind it — a static no-op under `prefersReducedMotion()`.

Applied to the 12 static door-places only. A player-built business's door tile already carries
its own real badge (the type-glyph or 🚧, `paintPlacedBusiness()`) at the exact same position — a
second marker there would visually collide with, not complement, an already-real marker, so
placed businesses are deliberately left as they are; the existing badge already answers "where's
the door" for them.

## C. Per-building-type ground art (next round)

Decision: NOT new sourced art (the only style-matching source found is signage/vehicles, not
parking-lot textures) — reuse the EXISTING ground tile vocabulary (`grassA`/`grassB`/`path`/
`grassZone` frames) painted as a small themed apron around a business's footprint, keyed by the
business's own real `typeId` (a bakery gets a `path`-tinted loading apron, matching "you can see
what it does when you zoom in" without inventing new art assets). A `parking lot` reads as a
gravel/packed-earth rectangle — the existing `path` frame IS that color/texture already, just
needs to be painted in a small apron shape (not the whole footprint) adjacent to a business's
door, reusing zoning's own `isFootprintAdjacentToZone` adjacency math (already built,
`data/zoning.ts`) rather than inventing new geometry.

## D. Roads + NPC-width sidewalks (next round)

Zoning already has `sidewalk`/`transit` zone types with a real (if narrow) mechanical effect
(passive-income multiplier / neglect reduction, Wave 3) but no VISUAL road surface distinct from
a generic zone glyph. Decision: a real "road" is a `transit`-zoned tile painted with the
`TileFrame.path` ground tile (see §A asset note) instead of the generic zone glyph, and a real
"sidewalk" is a `sidewalk`-zoned tile painted as a lighter, narrower strip — both already exactly
one tile wide (`TILE_SIZE` = 32px, the same size every NPC/player sprite already occupies per
tile), so "sized to our NPCs" is already true by construction once painted distinctly; no new
geometry system needed, this is a rendering upgrade to an already-real zone type.

## E. Vehicle transit system (next round)

The wagon travels between two or more real in-world points using the SAME real, already-shipped
BFS pathfinder (`engine/pathfinding.ts`) and tween-based step movement NPC outings already use
(`docs/overworld/npc-autonomy.md`) — never an instant teleport, matching the explicit "properly
walk or wagon across the map... not instantly transport" requirement. First real slice: a single
wagon making a real round trip between two real door-buildings on a real timer (mirrors an
NPC outing's own shape exactly), preferring `transit`-zoned road tiles when the real pathfinder's
cost function can weight them (a genuinely real "prefers roads" behavior, not just any open tile)
— the weighted-pathfinding piece needs its own follow-up spec once §D's road tiles exist to route
through, since routing preference is meaningless before there's a real road tile to prefer.

## Verification

Camera zoom is Phaser-integration code (per this file's established convention, no dedicated
`ExteriorScene.ts` test — verified by the same measurement discipline as every camera-affecting
change this session, plus manual bounds-math review since Phaser's own zoom-bounds clamping is
documented behavior, not something this sandbox can screenshot). Door highlighting's marker
placement is measured against the real `allPlaces()`/`placedBusinesses()` data the same way every
other in-world marker in this file already is. Both pieces are honestly flagged unconfirmed
on-device in `CLAUDE.md`, matching every other Phaser-visual entry this session.
