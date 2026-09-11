# Overworld — Roadmap (Phase 6/7)

> Stage 1 is this design package's original scope. Stages 2+ are named for continuity/planning —
> each gets re-checked against this package (and a short addendum if anything material changed)
> before it starts, per Rule #1 applied per-stage. The deletion step originally planned for a
> later "Stage 4" moved up to right after Stage 2, per the user's explicit 2026-09-11 direction
> (see decisions.md D1's update) — build every remaining area first, then remove the galaxy
> immediately, rather than waiting for associative paths/region travel too.

## Stage 1 — Vertical slice — SHIPPED 2026-09-11

1. [x] Engine shell: `Phaser.Game` bootstrap, scene manager, keyboard + touch input event bus,
   grid-snapped player movement + collision, camera follow. Shipped as `ProofScene.ts` against a
   static test map (no API calls) — the suggested first PR, committed separately.
2. [x] Adapter layer + unit tests: `nodeToCreature`, `moneyStarToBankRow`, `journeyToRegionTheme`,
   deterministic placement — proven against real API response fixtures before any scene wiring.
3. [x] Money region exterior scene (`ExteriorScene.ts`) wired to real `getGraph()`/
   `getMoneySky()`/`getFinanceSummary()` via `data/loadWorldSnapshot.ts` (loading/empty/error
   states — a failed refresh preserves the last-known world, never wipes it).
4. [x] Bank interior overlay (`BankOverlay.tsx`) — real ledger rows + safe-to-spend.
5. [x] Capture flow (`CaptureMenu.tsx`): tall-grass trigger → text entry → `ingestText` →
   "identifying species..." → reveal, with a real never-dead-end error/retry state.
6. [x] Greet/revisit loop (`greetCreature`): dim-state rendering from real `entropy` → interact
   → `tendNode` → refetch-and-reconcile (never a client-side "instant reset" — see
   architecture.md's note on why that would have re-derived the decay math ourselves).
7. [x] Accessibility: `prefers-reduced-motion` (instant camera snap + no tween) and non-color
   state pairing (dim "?" marker, rarity badges, Bank state icons) verified alongside each piece.
8. [x] Gate green; logged in `GEMINI_CHANGES.md`; committed to the designated branch.

## Stage 2 — Dock parity — SHIPPED 2026-09-11

Every remaining dock tab got a real in-world place, each wired to the SAME real API/localStorage
data the galaxy UI already reads/writes (never a new endpoint, never invented data):

| Dock tab | Overworld place | Component | Real data source |
|---|---|---|---|
| Details | Creature Summary screen (opens on any creature interact) | `CreatureSummaryOverlay.tsx` | `nodeToCreature` fields + `journeysFor("node", id)` |
| Browse | Library | `LibraryOverlay.tsx` | `graph.nodes` (shelves) + real `search()` |
| Mind | Sanctuary | `SanctuaryOverlay.tsx` | `api/mind.ts`: `getThoughts`/`getCognitive` + mutations |
| Agenda | Bulletin Board | `BulletinBoardOverlay.tsx` | action-kind nodes + `remindAt` nodes; `deleteNode`/`ackReminder`/`ingestText` |
| Insights | Observatory | `ObservatoryOverlay.tsx` | `getDigest()` / `resolveInsight()` |
| Soumaya | Partner NPC + chat | `SoumayaChatOverlay.tsx` | `askChat()`, with citation "📍 Go there" camera fly-to (pulled forward from Stage 3) |
| Inbox | Post Office | `PostOfficeOverlay.tsx` | `Toasts.ts`'s existing localStorage notification log |
| Progress | Gym / Trainer Card | `GymOverlay.tsx` | `getFuel`/`getStreak` + `data/achievements.ts` (ports App.tsx's unlock-diff so it fires even though App.tsx never mounts here) |
| Journeys | Town Hall (region/world map) | `TownHallOverlay.tsx` | `api/journeys.ts` full CRUD |
| Money | Bank | `BankOverlay.tsx` | `getMoneySky()`/`getFinanceSummary()` (Stage 1) |
| Hangar | Hangar | `HangarOverlay.tsx` | `data/hangarOptions.ts` — same localStorage keys/gates as `HangarPanel.tsx` |

Notable finds/decisions made while building this stage:
- **Progress parity gap caught and fixed**: achievement unlocking only ever happened inside an
  `App.tsx` effect, which never runs while the Overworld is mounted. `data/achievements.ts` ports
  that exact diff-and-persist logic (same `brain.achv.<spaceId>` key) so real play in the
  Overworld still earns badges, not just displays already-earned ones.
- **Graph fetch decoupled from the exterior's display cap**: Stage 1's `EXTERIOR_NODE_LIMIT`
  (60) would have under-counted achievements/Library results against a bigger real brain.
  Renamed to `GRAPH_FETCH_LIMIT` (300, matching `getGraph()`'s own default) — the full fetch backs
  achievements/Library accurately; the exterior's own tile-grid capacity still naturally caps how
  many creatures get a visible sprite (never an error).
- **The "Details" tab was missed on the first pass** of this stage's task breakdown and caught
  during the parity audit below — added as `CreatureSummaryOverlay.tsx`, which now fronts every
  creature interaction (stats + Journey membership + the Greet action), replacing the
  Stage-1 bare greet-only dialogue. `DialogueBox.tsx` (Stage 1's generic dialogue primitive) was
  deleted rather than left unused once nothing referenced it anymore.
- A real region-layout bug (the Bank door defined one tile outside its own building) was caught
  by the region-layout unit tests before ever running — see the Stage 2 commit message.

**Known Stage-2 simplifications, intentionally deferred, none blocking the parity criterion**
(a working equivalent exists for all 11 areas): per-node Journey membership is fetched on-demand
only when opening a creature's Summary (not prefetched for every creature — the exterior's
`uncharted` flag still defaults true for placement/theming purposes); Town Hall doesn't yet
support literal region travel (neither does today's `JourneysPanel` — that's Stage 3); the
Hangar's chosen ship/trail isn't visually applied anywhere yet (still the same static player
sprite regardless of Hangar selection — see Stage 2.5 below for what that sprite now is);
placeholder programmer-art throughout — **resolved in Stage 2.5.**

**Still needs on-device/browser confirmation** for the same reason as Stage 1 — this sandbox has
no live browser.

## Deletion — the 3D galaxy is retired — SHIPPED 2026-09-11

With every dock tab having a real Overworld equivalent, the staged replacement in decisions.md D1
completed: `App.tsx`, `packages/web/src/graph/*` (~65 files), `RightDock.tsx`, and ~75 panel
components it hosted are deleted; `main.tsx` mounts `overworld/AuthGate.tsx` unconditionally (the
`?overworld=1` opt-in is gone) — the Overworld is now the sole UI.

A precise dependency analysis (not a guess) drove the deletion, since a few `components/*` files
are genuinely depended on by the Overworld (`LoginScreen.tsx`, `Toasts.tsx`, `achievements.ts`,
`codex.ts`, `ErrorBoundary.tsx`) and had to be kept. Two real, would-have-shipped-broken issues
were caught before/during the deletion, not after:

1. **`OverworldRoot` had no login flow at all.** The space-auth gate (`currentSpace()` boot check
   → `LoginScreen` → the app) only ever lived in `App.tsx`. Deleting it without replacing that gate
   would have locked out every signed-out user. Built `AuthGate.tsx` to own this instead — same
   flow, plus a logout button, unit-tested before the deletion proceeded.
2. **`index.html`'s boot-failsafe watchdog would have false-positived on every load.** It waits for
   `window.__brainBooted()` to stand down its "stuck loading" recovery prompt; only `App.tsx` ever
   called it. Ported the exact same call (gated on the auth check resolving, not on the slower
   Overworld/Phaser load — matching the original's own comment about why) into `AuthGate.tsx`.

Also found via the same dependency analysis: `components/Toasts.tsx` (a genuine Overworld
dependency, via `PostOfficeOverlay`) imported `playSfx` from `graph/sfx.ts`, which imported
`prefersReducedMotion` from `graph/motion.ts` — deleting `graph/` wholesale would have broken the
build. Relocated both to `lib/` and updated the one real import site. While there, consolidated
the Overworld's own separate, simpler `engine/reducedMotion.ts` into the relocated
`lib/motion.ts` (the canonical implementation, with the in-app override + focus-calm nuance the
Overworld's copy didn't have) rather than maintain two divergent "is motion reduced" answers.

Also deleted as genuinely orphaned (verified, not assumed): `api/graph.ts` (+test — only
`App.tsx` used it), `api/lenses.ts` (nothing ever called it outside the deleted `LensesPanel`),
`hooks/*`, `utils/*`, and three now-dead `lib/*` files. Removed now-unused dependencies (`three`,
`react-force-graph-3d`, `mammoth`, `pdfjs-dist`) — the production bundle went from a >4MB initial
load (`index` + `Graph3D` + `pdf` + `mammoth` chunks) to ~206KB initial + one ~1.3MB lazy Overworld
chunk (Phaser), loaded only after login.

**Known gap, not silently dropped:** memory-attachment upload + PDF/docx text extraction
(`MemoryAttachments.tsx`, backed by the now-removed `mammoth`/`pdfjs-dist`) had no Overworld home
and wasn't one of the 11 dock tabs in scope for this parity pass — it's gone from the live app
until a future stage gives it one. `index.css` (128KB, largely galaxy-panel styling) was left
un-trimmed — safe to leave (dead CSS costs bytes, not correctness) but flagged as a real cleanup
opportunity for whoever next has the budget for a careful pass.

## Stage 2.5 — Real tile/sprite art, replacing flat-rectangle placeholders — SHIPPED 2026-09-11

Every "sprite" through Stage 2 was a flat `Phaser.GameObjects.Rectangle`/`Circle` with an emoji
glyph on top — no actual pixel art anywhere. Flagged directly by the user after the Stage 2
deploy ("just showing a bunch of square tiles") and traced to a real process gap: the brief had
named specific Pokémon reference repos and asked for MCP tooling to help build "Pokémon type
atmosphere," and neither was substantively used before this — only a shallow doc-level pass, no
sprite/tileset sourcing.

Fix: `packages/web/src/overworld/scenes/tileAtlas.ts` + `public/overworld/tiles.png`, a
hand-curated 25-frame, 16x16-tile atlas assembled from two Kenney (kenney.nl) packs — **CC0 /
public domain**, sourced via the community mirror github.com/shorepine/kenney, **not** from any
of the Pokémon reference repos (those contain Nintendo's actual copyrighted tile/sprite
graphics — safe to study architecturally, per the brief, never safe to extract art from; see
public/CREDITS.md for the full attribution):

- **"Tiny Town"** → grass (3 variants, deterministically varied per tile, never `Math.random`),
  the FR8 grass-zone's distinct texture, a cosmetic dirt-path "town square" patch, and building
  wall/door tiles (two alternating color families — tan/blue-gray — so the 8 buildings aren't
  all identical; each building's door tile is drawn from the same family as its walls so the
  doorway art lines up seamlessly).
- **"Tiny Dungeon"** → the player's sprite, a distinct "Soumaya" marker for her standalone object
  tile, and one creature sprite per `NodeType` (person/project/decision/company/meeting/daily/
  knowledge/concept/other) — swapped in via `creatureFrameForType()`, replacing the flat tinted
  circle. Rarity/dim-state rendering (badge shape + alpha + "?" marker) is unchanged — this pass
  only replaced the shapes being tinted, never the accessibility-critical logic drawing on top
  of them. An unmapped/future type (e.g. `moc`) falls back to the generic creature rather than
  erroring — tolerate-unsorted-gracefully, same as everywhere else in the adapter layer.

Every place still keeps its emoji glyph label overlaid on its tile — the new art is additive to
the existing non-color labeling, not a replacement for it. Verified via `tileAtlas.test.ts`
(determinism, fallback behavior) plus the full gate; the actual rendered look still needs
on-device/browser confirmation, same standing caveat as the rest of the Overworld (no live
browser in this sandbox). No water tiles or decorative trees were added this pass (not required
by the current region layout) — left as a follow-up if a later stage adds a water/forest area.

## Stage 2.6 — Motion & life: animation polish + a real Hangar/world tie-in — SHIPPED 2026-09-11

Continuing the "bring this world to life" direction right after Stage 2.5's real art landed:

- **Player**: a quick squash-and-recover ("hop") on every step tween, plus a slow idle
  "breathing" loop whenever standing still (stopped before each step so the two never fight —
  `startIdleBob`/`stopIdleBob` in `ExteriorScene.ts`).
- **Creatures**: a gentle idle bob per sprite, desynced per node id via a new deterministic
  `idleBobDelayMs()` (`tileAtlas.ts`, unit-tested) so the town doesn't bob in lockstep — a small
  "the world is alive" touch, not a gameplay/rarity signal.
- **Soumaya**: her standalone marker gets the same idle bob (she's a companion). The Bulletin
  Board deliberately does not — it's a signpost, not a character.
- **A real system finally reflected in-world**: the Hangar's "Cosmic Trail" cosmetic
  (`data/hangarOptions.ts`) previously had zero visual effect outside the deleted 3D galaxy
  (flagged in HangarOverlay.tsx's own comment). `ExteriorScene.ts` now reads the saved trail
  color and leaves a small fading dot of that color at each tile the player steps off of —
  `refreshTrailColor()` re-reads it the moment the Hangar overlay closes, so a newly-chosen
  trail shows up immediately, no reload. Ship hull + figurine choices still have no 2D
  equivalent to apply to (no per-hull sprite art) — still flagged, not silently dropped.
- Every new animation is a no-op under `prefersReducedMotion()` — motion trails and idle loops
  are exactly the kind of thing that guidance exists for.

Verified via new tests (`idleBobDelayMs` determinism/desync in `tileAtlas.test.ts`,
`trailColorHex` in `hangarOptions.test.ts`) + the full gate. Still needs on-device/browser
confirmation, same standing sandbox limitation as the rest of the Overworld.

## Stage 2.7 — First real on-device feedback: playability + readability + music — SHIPPED 2026-09-11

The user finally got a real phone screenshot of the live Stage 2.5/2.6 build through, and it
surfaced genuine bugs Stage 2.5/2.6 couldn't catch from this sandbox (no live browser):

1. **The Phaser game had no Scale Manager config at all** (`OverworldRoot.tsx`) — the canvas
   rendered at a hardcoded 832x576 CSS px regardless of the real screen size. On a phone
   narrower than that, only the map's left/top slice was ever visible, no matter where the
   player actually was — which is exactly what "I see buttons to move but it does nothing"
   looks like (the player was very often walking around outside the visible crop, or the
   camera's follow target was off in unseen canvas space). Fixed with `Phaser.Scale.FIT` +
   `CENTER_BOTH`, and gave the canvas's container div a real CSS box (`width:100%`,
   `aspect-ratio: 26/18`) for FIT to scale into with zero letterboxing. Also added
   `touch-action: none` to every `TouchControls` button, defensively, so a quick tap can't be
   swallowed by the browser's own scroll/zoom gesture handling on a now-properly-scrollable-if-
   unscaled page.
2. **Emoji-only building labels were illegible at 14px** ("buildings should have names on
   them, not emojis, unless the emoji is clear"). Replaced with a readable text nameplate
   (`place.label`, e.g. "Bank") floating just above each building's roofline / each standalone
   object's tile, dark background pill for contrast against varied tile art — dropped the
   glyph from the in-world label entirely rather than trying to judge which emoji count as
   "clear enough" case by case.
3. **"We need an infinite loop track for game music."** Every real CC0 music source this
   session tried (kenney.nl, opengameart.org, itch.io, freesound.org, plus a large GitHub-hosted
   CC0 corpus with no genre/mood tagging to search by) is either blocked by this sandbox's
   network egress policy or impractical to search blindly. First attempt generated an original
   loop procedurally (square-wave melody + triangle-wave bass) specifically to avoid reusing an
   undocumented asset — the user rejected it ("no music you made please... a free one from
   somewhere made for free games") and, once true CC0 sourcing proved unreachable from here,
   redirected to the pre-existing `public/ambient-loop.mp3` (left over from the deleted 3D
   galaxy) as the fallback. `lib/music.ts` (new) decodes and plays that file looped through a
   Web Audio `AudioBufferSourceNode`, ducking on `"brain-sfx-duck"` (an event `sfx.ts` has
   dispatched since before the galaxy deletion, whose listener died with the galaxy; this
   restores the behavior its own comment always promised). Starts on the first real
   `pointerdown`/`keydown` anywhere on the page (mirrors Phaser's own audio-unlock pattern,
   since browsers block audio until a genuine user gesture) and can be muted via a small 🔊/🔇
   button, top-right of the canvas. **`ambient-loop.mp3` has no license/attribution
   documentation anywhere in this repo** — flagged plainly in `public/CREDITS.md` rather than
   silently reused; verify its actual source before any public/commercial distribution.

Verified via new tests (`lib/music.test.ts` — preferences persistence, gapless-loop wiring,
duck behavior, graceful failure if fetch/decode fails) and the full gate. The Scale Manager fix
in particular still needs the thing that surfaced these bugs in the first place — a real
on-device look — to confirm it actually resolved the movement/visibility complaint; log any
remaining playability issues the same way (a screenshot beats another guess from this sandbox).

**Deferred pending clarification, then built**: "NPCs are autonomous pertaining to their
intended job" was ambiguous, so the user was asked rather than guessed at — they picked
per-building attendant NPCs, then asked for a few per building (not just one) plus creatures
that roam a bit too, within a bounded area rather than the whole map. See Stage 2.8 below.

## Stage 2.8 — Attendant NPCs + bounded creature roaming — SHIPPED 2026-09-11

Two door-buildings' worth of "the town feels staffed and alive," per the user's explicit
follow-up direction (a few NPCs per building, and creatures wandering a little, both confined to
small areas rather than free-roaming the whole map):

- **Attendant NPCs** — every door-building gets `ATTENDANTS_PER_BUILDING` (2) small NPCs pacing
  back and forth just outside it, each on its own row so their paths never cross
  (`regionLayout.ts`'s `attendantPosts()` — derived purely from each building's own footprint,
  never hand-authored, so it can't drift out of sync with where the building actually is).
  Reused already-sourced Tiny Dungeon (CC0) character art — no new asset sourcing needed, since
  the pack had exactly enough distinct humanoid sprites for one look per building
  (`tileAtlas.ts`'s `attendantFrameForPlace`). Attendant tiles block movement and creature
  placement, same as any other object. Purely decorative/not interactive — no dialogue, no
  role simulation — and the pacing loop is a no-op under `prefersReducedMotion()` (they still
  stand at their post, just don't pace).
- **Bounded creature roaming** — each creature now wanders within its own small "cage": its
  home tile plus whichever orthogonal neighbors are actually open ground
  (`ExteriorScene.ts`'s `buildRoamCage`, built from the same `isMovementPassable` collision
  check everything else already uses — never a separate ad-hoc rule). A creature's home tile
  (from `placement.ts`, unchanged) stays the fixed anchor used for cage-building and camera
  fly-to; a new `currentTile` tracks where it actually is right now for interact/greet
  hit-testing, so walking up to a mid-roam creature and pressing A still works. Desynced
  per-node timing (reusing `idleBobDelayMs`) so creatures don't all step in lockstep. No-op
  under reduced motion (creatures stay at home, no roaming) — same standing convention.

Verified via `regionLayout.test.ts` (attendant posts: in-bounds, block movement/placement,
never overlap a door/object/grass-zone/spawn tile, stay within their own building's width, and
no two posts anywhere collide) and the full gate (1051 server + 165 web tests, typecheck,
build). Still needs on-device confirmation like the rest of the Overworld.

## Stage 2.9 — A second round of real feedback: input, camera, art, NPC substance — SHIPPED 2026-09-11

Voice feedback after actually playing the Stage 2.7/2.8 build, in order of what it named:

1. **All 3 galaxy-era tracks, switchable** — the galaxy let a pilot switch between
   `ambient-loop.mp3`/`interstellar.mp3`/`slow-tide.mp3`; Stage 2.7 only ever played the first
   one. `lib/music.ts`'s new `MUSIC_TRACKS` + `nextTrack()`/`playCurrentTrack()` restore the
   switcher (a small ⏭️ button next to the mute button). Fixed a real bug surfaced by writing
   the switch-test properly rather than assuming it worked: `startMusicLoop()`'s "already
   playing this track" guard compared `currentUrl === url` *after* just having assigned
   `currentUrl = url` on the line above — always true, so switching tracks silently did
   nothing. Compare-then-assign now.
2. **Hold-to-move** — keyboard already moved continuously while a key was held (`update()`
   polls `key.isDown` every frame); `TouchControls` only ever fired one step per tap. Added
   `InputBus.heldDirection`, set/cleared by the D-pad's pointerdown/up/leave/cancel, which
   `update()` now polls exactly like keyboard state — holding the button moves continuously,
   tapping still gives one step.
3. **True mobile-first responsive camera** — `Phaser.Scale.FIT` locked the game into a fixed
   832x576 (26:18) landscape aspect that had to letterbox on a portrait phone ("built to turn
   your phone sideways... needs to adapt to whatever device"). Switched to `Phaser.Scale.RESIZE`:
   the canvas genuinely fills whatever box it's given (portrait, landscape, desktop), and
   `ExteriorScene.ts` resizes its camera's viewport to match on every change. The camera is now
   a *real scrolling viewport* onto the still-26x18-tile world — smaller than the world on
   almost every device — rather than a shrunk picture of the entire map. `TouchControls`'
   buttons got a semi-transparent style so they read as an overlay, not opaque tiles blocking
   the world underneath (a second piece of the same "buttons shouldn't block things behind
   them" feedback).
4. **Buildings looked hand-assembled** — the user's ask was explicit: use pre-made free assets,
   don't hand-compose primitives. Investigation found Tiny Town has no single "complete house"
   sprite to drop in whole — it's a modular kit by design, same as the wall/door tiles already
   in use — but it DOES include proper roof-gable tiles (63/67) nobody had used yet; buildings
   were capped with a flat wall row instead of an actual roof. Added `roofTan`/`roofBlue` to the
   atlas and a new pure `buildingTileFrame()` (tileAtlas.ts, unit-tested against real
   `regionLayout.ts` footprints) that decides wall/door/roof per tile from wherever the door
   *actually* is. That fix also caught and corrected a real latent bug: the old inline logic
   assumed the door was always on the footprint's bottom row, so the 3 south-row buildings
   (Gym/Town Hall/Hangar, whose doors face north/up and sit on the *top* row) were drawing
   plain wall tiles beside their doors instead of the tiles actually designed to sit there, and
   putting the wrong tiles on their true wall-only row. `buildingTileFrame`'s tests assert both
   orientations directly against `placeById("bank")`/`placeById("gym")`'s real footprints.
5. **NPCs need to "do work... pertaining to their field", not just pace** — attendants now
   flash a small role-specific icon above themselves on the same timer that used to only pace
   them (`tileAtlas.ts`'s `workIconForPlace` — 💰 Bank, 📖 Library, 🧘 Sanctuary, ✉️ Post Office,
   🔭 Observatory, 🏋️ Gym, 📜 Town Hall, 🔧 Hangar). The icon cue runs even under reduced
   motion (it's the actual "they're working" signal); only the walking half is skipped there,
   same as everywhere else motion is decorative in this scene.

Verified via new/updated tests (`InputBus` held-direction, `TouchControls` hold-to-move
pointer events, `music.ts` track-cycling + the fixed switch bug, `buildingTileFrame` against
real north-row/south-row footprints, `workIconForPlace`) and the full gate (1051 server + 179
web tests, typecheck, build). The camera/scaling rework in particular needs on-device
reconfirmation — it's a genuine architecture change, not just a config tweak, and this
sandbox still has no live browser to check it in.

## Stage 2.10 — Real building illustrations, replacing the roof-tile fix — SHIPPED 2026-09-11

Stage 2.9's roof fix (3 copies of one 16x16 gable tile across a building's width) was still a
hand-assembled kit, not "already made building assets" — exactly what the user asked NOT to do,
twice now. The actual fix: `buildingSprites.ts` gives each door-building one COMPLETE, pre-made
building illustration (a house/hall/tower/lighthouse), scaled to fill its 3x2-tile footprint,
loaded as its own standalone texture (`this.load.image`) rather than sliced from `tileAtlas.ts`'s
uniform 16x16 grid. Source: the "Old stone buildings" pack (Battle for Wesnoth's human-city set),
**CC0**, via the CC0 aggregator github.com/Tiddybub/2d-assets (its own LICENSE + each pack's
SOURCE.md confirm this — see public/CREDITS.md). Only 5 distinct buildings exist in the sourced
pack for 8 places, so some are intentionally reused (a round tower for Bank and Hangar, an
arched hall for Library and Sanctuary, a flagged tower for Gym and Town Hall) — every building
still keeps its own nameplate, attendant NPC, and glyph, so a shared silhouette is never the
only way to tell two buildings apart.

Removed as dead code once nothing referenced it anymore: the wall/door/roof tile-kit
(`WallFamily`, `wallFamilyForIndex`, `buildingTileFrame`) tileAtlas.ts/ExteriorScene.ts had built
up over the two previous passes. The retired tile frames were left in place in `tiles.png`
rather than renumbering the whole atlas over unused pixels.

**Known simplification, not a blocker**: the pre-made art's illustrated door is drawn at a fixed
spot in each image (usually bottom-center); for the 3 south-row buildings (Gym/Town Hall/Hangar,
whose *walkable* door tile is on the footprint's top row, per regionLayout.ts) the illustrated
door doesn't perfectly line up with where you actually step to enter. Every building's real
entrance is still unambiguous (nameplate + glyph + an attendant NPC standing right there), so
this is a minor illustrated-vs-walkable-tile mismatch, not a functional bug.

Verified via new `buildingSprites.test.ts` (every door-building resolves to a real, non-empty
sprite; the preload list covers every sprite actually in use; no duplicate texture keys) and the
full gate (1051 server + 179 web tests, typecheck, build).

## Stage 3 — Associative paths + region travel (post-deletion)

Glowing footpath rendering between related creatures (edge data → path tiles); literal
flying/sailing transition between multiple Journey regions using the Hangar-customized vehicle
(D4) — Town Hall's region list currently manages Journeys but can't yet travel between them,
since there's still only one physical region.

## Stage 4 — Day/night + weather tied to brain mood/entropy

## Explicitly not scheduled

Any battle/combat mechanic (D3, permanent). Multiplayer/shared worlds (permanent, privacy
non-negotiable). A hand-authored Tiled-binary map pipeline (Porymap-equivalent tooling) unless
Stage 3+ proves hand-authoring at scale is actually needed over data-driven layout.
