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

## Stage 2.11 — NPC Society v1 (the first two NPCs with real lives, per docs/overworld/npc-society.md)

Real user feedback escalated across three rounds: "just walk back and forth" → work icons
(Stage 2.9) → a full ask for "actual autonomous jobs... interact with other npcs... their own
lives and personalities... a governing system... town meetings... reasons for all of it." Per
CLAUDE.md Rule #1 this got a full proposal + sign-off round first
(`docs/overworld/npc-society.md`) before any code — the user chose **Hybrid** dialogue
(hand-authored now, LLM-shaped-later), a **small vertical slice first**, and asked to seed in
**both** relationships and governance-with-real-teeth rather than deferring them.

**What shipped**: the two Town Hall attendants (`townHall-0`/`townHall-1`, now named **Mira** the
Mayor and **Dez** the Clerk — chosen specifically because their posts already sit right next to
each other, so "NPCs interact" needs no new pathfinding) get a real shared clock
(`data/npcSchedule.ts`, tick-based, deterministic, no Date/Math.random) cycling Working → Break →
Home. When both land on Break at once, they step toward each other and each shows a real
dialogue line (`data/npcDialogue.ts`) — job-flavor lines always available, personal lines that
unlock only once the player holds the matching real achievement id
(`components/achievements.ts` — `cartographer`/`streak_week` for Mira, `weaver_100`/
`goal_achiever` for Dez), and a "friend" line each that only unlocks once their relationship
counter (`data/npcRelationships.ts`, a real pairwise count, not anonymous encounters) actually
reaches the "friends" tier. During Home they leave the screen entirely (sprite hidden), matching
the proposal's "leave for a while."

**Governance with real teeth**: a Town Meeting is called the first time a *new* Synthesis Digest
insight becomes available (`getDigest()` — the Observatory's own real data source,
`data/townMeeting.ts`), checked on every world refresh (`OverworldRoot.tsx`). Its one concrete
mechanical effect: a plain-language summary is posted to the **Bulletin Board as a real quest**
(`ingestText(text, { kind: "action" })` — the exact mechanism the Bulletin Board itself uses),
never re-announced once seen, and Mira/Dez flash a 📢 above themselves as the cosmetic cue.

**Deliberately deferred, not silently dropped** (see npc-society.md's own "Deferred out of v1"):
rolling this system out to the other 6 buildings' 12 attendants; LLM-generated dialogue
variation (the data shape supports it, not wired up); attendants physically walking to Town
Hall for a meeting (v1's "meeting" is the real Bulletin Board post + the icon, not a town-wide
walk); relationship tiers/effects beyond the 3-tier counter and one extra dialogue line.

Verified via `npcSchedule.test.ts`, `npcRelationships.test.ts`, `npcDialogue.test.ts`,
`townMeeting.test.ts`, updated `regionLayout.test.ts` (39 new/changed assertions total) + the
full gate (1051 server + 209 web tests, typecheck, build) — the actual break-time interaction,
speech bubbles, and 📢 cue have not been seen rendered in a real browser from this sandbox.

## Stage 2.12 — Town Economy: bigger buildings, a real wage/neglect loop, Market + Park (docs/overworld/npc-economy.md)

A single message asked for a lot at once: roll NPC Society out further, buildings ~3x their
size, NPCs that visibly enter/exit buildings, a wage economy, work created by the player's own
interactions, new shops/recreation, "adapt to health," and reusing "old mechanics." Per Rule #1
this got its own spec (`docs/overworld/npc-economy.md`) with the biggest ambiguities resolved
directly with the user before any code: wages are a **purely cosmetic in-game ledger, never
real Bank/finance or the real `Fuel` resource** (checked `Fuel`'s actual meaning —
"cost the agent pays per autonomous LLM job" — before assuming it was spendable); "health" is
the old galaxy's own neglect math (`entropyFrom`/`COOLING_ENTROPY`) extended to buildings, not a
new invented stat; "old mechanics" meant the real per-building data already wired into every
Overlay, not the deleted galaxy's clustering/codex/sector systems.

**What shipped:**
- **A generated region layout**, replacing the hand-typed coordinate table (`regionLayout.ts`):
  a small per-row building-spec list + fixed spacing produces every footprint/door, so overlap
  is structurally impossible rather than something a test discovers after the fact. Buildings
  grew to 3x their original footprint AREA (6 tiles → 18: 6 wide x 3 tall — stated explicitly
  since "3x every dimension" would have dwarfed the old region). Region grew from 26x18 to
  46x24 to fit. Reproduced/measured, not assumed: a throwaway script printed the actual
  generated layout as an ASCII map before this shipped, confirming the geometry matched the
  design exactly (`docs/overworld/roadmap.md`'s own "verify before you build" standard).
- **Two new buildings**: **Market** (a real shop) and **Park** (recreation + a real "how's the
  town doing" board — see below), added to the south row alongside Gym/Town Hall/Hangar.
- **NPC Society rolled out from 2 to 20 NPCs** (all 10 buildings' attendant pairs, not just Town
  Hall's Mira/Dez) — `npcDialogue.ts`'s profile table grew to 20 hand-authored NPCs, each with
  their own job/personal/friend lines tied to real achievement ids and their own building's
  pair.
- **NPCs actually enter and exit buildings** (real user feedback) — Working now means walking
  to the door and disappearing (truly "inside," not just standing at a post); the work-icon cue
  still flashes from that door position. Break means visibly exiting to their own post, where
  their building's own pair has their interaction (see the Deferred note below for why this
  stayed local rather than routing everyone to Park).
- **Real wages from real interaction** (`data/townLedger.ts`, `data/npcJobs.ts`) — every
  building's attendants earn a fictional hour/wage only when a REAL mutating call that Overlay
  already makes actually succeeds: a search in the Library, a thought logged in the Sanctuary, a
  quest posted/turned in at the Bulletin Board, an insight resolved at the Observatory, a
  notification read at the Post Office, a Journey saved at Town Hall, a cosmetic changed at the
  Hangar, a purchase made at the Market. The Bank and Gym have no button of their own to hook
  (read-only ledgers), so their real work is detected by diffing snapshots instead
  (`detectBankWork` in `financeAdapter.ts`; the Gym reuses `syncAchievements`'s own
  freshly-unlocked-ids return in `loadWorldSnapshot.ts`) — never a timer, never invented.
- **Neglect cascades** (`data/buildingNeglect.ts`) — reuses `entropyFrom()`'s exact shape
  (the SAME math a neglected memory's dim state already comes from) applied to "time since this
  building's last real work event." A neglected building's own attendant pair still visibly
  breaks, but their relationship growth pauses (never decays negative — no dark patterns) and
  they render dimmed with the same non-color "?" cue a neglected memory gets — the user's own
  "if I never do anything... that strains relationships... cascading issues," resolved with real
  data, not an invented simulation.
- **Market**: a real shop spending the **Town Treasury** (the sum of every building's real
  earned wages) on a small cosmetic catalog (`data/marketGoods.ts`) — the exact same "selection
  state tracked correctly, no further in-world rendering yet" precedent `HangarOverlay.tsx`
  already established for its own ship-hull/figurine choices, not a new convention.
- **Park**: a real bench showing which buildings actually have real work waiting
  (`buildingNeglect.ts` again) — a plain-language read on the town's wellbeing, never a score to
  optimize.

**Deliberately deferred, not silently dropped** (flagged in npc-economy.md's own list):
- Rolling this out to a "Mall" as its own multi-stall complex — Market ships as one shop.
- Routing every building's Break-time attendants to a shared Park tile — revised **while
  building**, not just at spec time: with 10 buildings' pairs on the same shared clock, up to 20
  sprites converging on a couple of Park tiles was a real crowding risk with no queueing system
  to verify it was safe. Scaled back to the proven-safe local-to-building interaction instead.
- LLM-generated dialogue variation (still deferred from npc-society.md v1).
- Any real-money/Fuel integration for the shop — Town Treasury only, by design.

Verified via 6 new/updated pure-logic test files (`buildingNeglect`, `townLedger`, `npcJobs`,
`marketGoods`, an expanded `npcDialogue`, an expanded `regionLayout`), 2 new overlay test files
(`MarketOverlay`, `ParkOverlay`), updated tests on 5 existing overlays for the new `spaceId`
prop, the ASCII-map layout reproduction above, and the full gate (1051 server + 258 web tests,
typecheck, build) — the actual bigger buildings, enter/exit animation, and Market/Park screens
have not been seen rendered in a real browser from this sandbox.

## Stage 2.13 — NPC Autonomy: real cross-town movement (docs/overworld/npc-autonomy.md)

Direct follow-up to "are they autonomous?" — the honest answer was: their schedule and
break-time interaction run on their own, but they never actually go anywhere beyond their own
doorstep, and their income is entirely reactive to the player. This round gives them real
movement, resolving the two things npc-economy.md had explicitly scaled back for being unsafe
without real pathfinding.

**What shipped:**
- **`engine/pathfinding.ts`** — a real, pure, budget-capped BFS (plain BFS chosen over A\* since
  the region is small and uniform-cost; A\* would buy nothing here). Reuses `engine/movement.ts`'s
  own `MovementGrid` shape. Measured, not assumed: a throwaway script computed real paths across
  the actual 46x24 map (opposite-corner trips of 40-50+ tiles) and timed all 20 attendants
  pathing to a meeting slot at once — under 10ms total, confirming this is safe to run
  synchronously without any frame-budget concern.
- **`regionLayout.ts`'s `isNpcPathPassable`** — the player's own `isMovementPassable` minus the
  attendant-tile block, so a building's own (or another's) post tiles are valid NPC travel
  destinations without touching the player's collision rules at all.
- **`regionLayout.ts`'s `townHallMeetingSlots()`** — footprint-derived (never hand-typed) real
  tiles beyond Town Hall's own attendant band, deliberately more than any one building has
  attendants, so a full 20-NPC gathering spreads out.
- **Off-duty outings** — each society NPC gets its own desynced real-time timer that, only
  while they're genuinely Home, sends them on a real walk to Park or Market (alternating) via
  `findPath`, a brief linger, then a real walk back. Decoupled from the schedule's own short
  Home window on purpose (a real cross-town round trip can take far longer than Home lasts) —
  if a real schedule transition happens mid-outing, it's cleanly interrupted (the in-flight
  tween is killed, never fought) and the normal transition takes over from wherever they are.
- **A real Town Meeting gathering** — `announceTownMeeting()` now sends every one of the 20
  attendants walking to a real meeting slot near Town Hall, shows 📢 there, then walks them
  back to wherever their own schedule says they currently belong. This is the ORIGINAL
  npc-society.md proposal, only ever scaled back for a crowding risk a straight-line tween
  couldn't safely handle — real pathfinding removes that risk (real travel time from spread-out
  buildings staggers arrivals for free, no invented queueing system needed). An `atMeeting` flag
  suspends the normal per-tick schedule rendering for exactly the sprites that are away, so a
  Working/Break/Home transition can never fight the meeting's own tweens mid-trip.
- **Caught in review, not by accident**: `outingActive`'s lifecycle was initially cleared as
  soon as an outing's RETURN leg started, which would have left that leg's walk tween
  unprotected against a real schedule transition firing mid-walk-home (nothing left to kill, two
  tweens fighting over the same sprite). Fixed to stay active for the entire round trip.

**Deliberately deferred, not silently dropped** (npc-autonomy.md's own list): cross-building
relationships / visiting a specific friend rather than a fixed destination (the relationship
model still only tracks a building's own pair); A\*/weighted terrain/anything beyond plain BFS;
NPCs choosing an outing "personality-driven" beyond the fixed Park/Market alternation; the
player's own movement is unchanged (still direct input, never pathfound).

Verified by 9 new pathfinding tests + 10 new regionLayout tests (all 276 web + 1051 server
tests green), the ASCII-map-style real-path measurement above (not just green tests), and the
full gate (typecheck, build). The actual in-world outings and Town Meeting gathering have not
been seen rendered in a real browser from this sandbox.

## Stage 2.14 — Two real UX fixes: dialogue duration, and a real themed overlay panel

Direct follow-up to a roadmap discussion: the user flagged two concrete complaints while asking
"where should this go next" — NPC dialogue "doesn't stick around long enough to read," and every
building-interior overlay "look[s] ugly when it pops up" compared to the old galaxy's own
RightDock panels. Both cheap, no spec needed (Tier 1 of the roadmap discussion).

**Dialogue duration**: `showSpeechBubble`'s hold time was a flat 2600ms regardless of how long
the line actually was — the longer "personal"/"friend" lines (npcDialogue.ts) never got a fair
reading window. Replaced with `dialogueHoldMs(text)`: a real reading-pace estimate (~45ms/char,
base 700ms, floor 1800ms, ceiling 5000ms) — deliberately the SAME formula regardless of
`prefersReducedMotion()` (reduced motion is about vestibular/motion sensitivity, not reading
speed; a reduced-motion user needs just as long to read the words). Measured against the actual
100 authored lines, not assumed: shortest line 44 chars → 2680ms (about the same as before),
average line 77 chars → 4165ms (a real improvement over the flat 2600ms), only 4 of 100 lines
hit the 5000ms ceiling.

**A real themed overlay panel**: every "you walked into a place" overlay (Bank, Library,
Sanctuary, Bulletin Board, Observatory, Post Office, Gym, Market, Town Hall, Park, Hangar,
Soumaya — 12 total) used to be its own flat, single-color, full-bleed monospace div. New
`OverlayShell.tsx` — a centered card with a real header bar (icon + title), depth (border +
shadow), and a styled close action — replaces all 12 independently-styled wrappers with one
shared component, plus `actionButtonStyle`/`fieldStyle`/`leaveButtonStyle` so every button and
input across all 12 reads as one consistent system instead of bare default HTML controls.
Deliberately still a system monospace font — no new font dependency (CLAUDE.md's "don't add
dependencies casually"); the win here is layout/color/depth, not typography sourcing.
`CreatureSummaryOverlay` (a bottom-anchored quick-glance strip) and `CaptureMenu` (a full-bleed
capture-reveal moment) were deliberately left as-is — their layouts already serve a genuinely
different interaction pattern than "walked into a building," not an oversight.

Verified by the dialogue-duration measurement above, new `OverlayShell.test.tsx`, all existing
overlay tests updated/passing (one test's assertion was legitimately outdated by the new header
— `ParkOverlay.test.tsx`'s "Park never appears" check needed scoping to the building list, since
the overlay's own header now correctly says "Park"), and the full gate (1051 server + 280 web
tests, typecheck, build). Not yet seen rendered in a real browser from this sandbox.

## Stage 2.15 — Spaced repetition finally gets a place in the world (Tier 2, priority 1)

Direct follow-up to the roadmap discussion ("I really want all of it. Mostly tier 2."). Research
first, per Rule #1 (`docs/overworld/spaced-repetition.md`): the SM-2 review engine
(`analysis/review.ts`), its route (`GET /api/review/due`, `POST /api/review/:id`), and even the
typed client fetch functions (`getDueReviews`/`gradeReview`, `api/features.ts`) were **all already
real and shipped** — just never called from anywhere in the client. This round is a presentation
gap closed, not new backend.

The one real design decision: this is a SECOND, independent decay signal from the entropy
`isDue`/"?" dim marker that already exists — same neglect *theme*, completely different
mechanism (`review_interval_days`/SM-2 ease vs. `daysSinceTended`/degree), so it needed its own
non-color, non-overlapping marker rather than reusing or merging with "?" — a node can be
entropy-fresh but SM-2-due, or the reverse, independently.

Shipped: `CreatureEntity.dueForRecall` (sourced from the server's due list in
`loadWorldSnapshot.ts`, never re-derived client-side); a "💭" in-world marker offset from the
existing "?" so both can render on the same creature; a real "Recall check" in
`CreatureSummaryOverlay.tsx` — content-free until you choose to try to recall it first, then
"I remembered"/"Let's refresh it" call the now-finally-used `gradeReview` and refresh the world
exactly like the existing greet flow; and a one-line proactive nudge in `SoumayaChatOverlay.tsx`'s
greeting (only when there's something due, naming the weakest memory, with a "📍 Go there" reusing
the exact citation-button affordance the chat already has) instead of a separate review-deck
screen — deliberately rejected as the literal Anki-deck shape NEURO_ALIGNMENT says to avoid.
Grading a recall already credited Fuel + the daily streak server-side (`EARN_REVIEW`,
`STREAK_DAY_BONUS`) from a much earlier round — this round just finally lets the player reach it.

Verified by new/updated tests in `nodeToCreature.test.ts`, `loadWorldSnapshot.test.ts`,
`CreatureSummaryOverlay.test.tsx`, and `SoumayaChatOverlay.test.tsx`, plus the full gate (1051
server + 287 web tests, typecheck, build). Not yet seen rendered in a real browser from this
sandbox.

## Stage 2.16 — Real bug fix: Soumaya's chat overlay flashing open-then-closed

Real user report: the A button opens Soumaya's chat, but it instantly closed again — holding the
button was the only way to keep it open. Root cause found by reading `TouchControls.tsx`, not
guessed: A's `onPointerDown` opens the overlay immediately, but a touch gesture still generates a
browser-synthesized compatibility `click` afterward unless `preventDefault()` is called on the
pointer event — and by the time that click fires, `OverlayShell`'s full-width Leave button (the
overlay having just mounted) sits at the exact screen position A occupied a moment earlier. The
ghost click landed on Leave, closing the overlay the same gesture had just opened. Fixed with
`e.preventDefault()` in A's pointerdown handler — the standard, well-documented fix for a
lingering synthetic click after a touch gesture, scoped to just the one button that actually has
this problem (the D-pad's own ghost clicks land back on the D-pad itself, harmlessly). Verified by
a new assertion in `TouchControls.test.tsx` (`fireEvent.pointerDown(...)` returns `false` — the
signal a cancelable event's `preventDefault()` was actually called) + the full gate (1051 server +
288 web tests, typecheck, build). Not yet re-tapped on a real device to confirm the flash is gone.

## Stage 2.17 — NPCs get their lives back; Soumaya finally moves

Direct follow-up to a large, multi-part user request that bundled Soumaya autonomy/governance,
crime/policing, NPC visibility, LLM dialogue, and more into one message. Per Rule #1, the full
reconciliation (what's resolved, what's deferred and why, D3 compliance for the crime/policing
ask) is written up first in `docs/overworld/soumaya-governance.md` — this stage is the subset of
it that actually shipped.

**Soumaya moves.** She was a static ground-layer image at a fixed tile — the direct cause of "she
doesn't move around." Converted to a real sprite (container + body, splitting position from idle
bob the same way `CreatureSprite` already does) that deterministically tours every real building
in the town, reusing the exact BFS pathfinder + tile-by-tile walk tweening already built for NPC
outings (`npc-autonomy.md`) — never `Math.random()`, matching this scene's own desync convention.
`handleInteract()` now checks her live current tile before falling back to the Bulletin Board's
static lookup, the same "current position, not placement anchor" rule creatures already use.
Measured before shipping: a script ran her real tour against the actual 46x24 map — `findPath`
succeeded for all 10 buildings across 2 full laps, no failures, ~18 tiles/leg average, well inside
her 7s wander period.

**NPCs stop fading away off duty.** Real, direct reversal of a v1 decision: `applySocietyState`'s
Home branch used to fade a sprite to alpha 0 then hide it. Home now renders like Break — visible,
resting at the attendant's own post. What actually gives them "a life outside work" was already
built (the outing system's periodic real Park/Market walks) — only the bug where they vanished
*between* outings did. All three "resume Home's own hidden state" call sites were made consistent;
`restingTileFor`'s return type dropped its now-impossible `null` case (Working/Break/Home is an
exhaustive 3-value union).

**Mira → Deputy Mayor.** `npc-society.md` §4 already framed her "Mayor" label as "a role, not a
superior... just who calls the meeting" — zero mechanical weight. Soumaya becomes the town's real
governing figure; Mira's one flavor comment softens accordingly. Nothing else about her changes.

**Explicitly deferred**, each with a real home rather than getting lost: Soumaya's own visible
NPC interactions + personally leading Town Meetings (folded into task #59); a Mayor's Hall
building + attendants ("her security" — task #63, new); a townwide civic-concern signal as the
D3-compliant crime/economy reframe (task #64, new); political "divisions" (revisit only once NPC
count actually grows past today's 20); LLM-generated, token-batched, town-state-aware dialogue
(folded into task #61's spec as hard requirements). See `soumaya-governance.md` for the full
reasoning behind each.

Verified by the tour measurement above + the full gate (1051 server + 288 web tests, typecheck,
build) — Soumaya's movement and the Home-visibility change have not been seen rendered in a real
browser from this sandbox.

## Stage 2.18 — The Hangar becomes a real town-builder (task #65)

Direct answer to the request's own "go to the hangar, and that's where you can select items to be
placed in the map... think of Sims." Per Rule #1, `docs/overworld/town-builder.md` specs the FIRST
real slice before any code: a small, fixed catalog of 1x1 decorative items (garden bed, bench,
lamp post, banner post), reusing the real Town Treasury (townLedger.ts — never Fuel/finance,
same convention `marketGoods.ts` already established) for price and `isPlacementBlocked`
(regionLayout.ts) for "is this tile free" — nothing new invented for either.

**Two-step interaction**, matching the request's own "select in the Hangar, then place it in the
world": buying a catalog item in the Hangar spends the treasury immediately and "arms" it (one
pending item per space, never a queue — a second purchase re-arms rather than stacking); pressing
interact facing a free tile in the world places it there and clears the armed state. While
something's armed, interact is exclusively about placement (a blocked tile is a silent no-op,
matching every other interact-miss in this scene) rather than falling through to greet/chat for
that same press.

**New**: `data/townBuilder.ts` (pure, localStorage-backed, the same shape as `marketGoods.ts`);
`ExteriorScene.ts` renders placed items as text glyphs (this session's established convention for
a marker with no dedicated atlas art) and handles the interact-to-place flow; `loadWorldSnapshot.ts`'s
creature placement now also avoids any tile a player has already built on, the one integration
point outside the new module. Measured before shipping: the real 46x24 map has 857 open tiles out
of 1104 after every real building/object/attendant/grass-zone/spawn exclusion — plenty of room for
this to actually matter.

**Deliberately deferred** (tracked, not lost): multi-tile footprints, real housing types with
mechanical meaning (#66), new business building types with their own attendants/wages (#67), and
any "NPCs react organically to placed items" behavior — the last needs a placed item to be a real
place NPCs can path to, which only makes sense once housing/business substance exists, not for
inert v1 decor. Also a known v1 rough edge, stated plainly rather than hidden: there's no
cancel/refund once an item is armed — placing it anywhere is the only way to resolve it (buying a
different item still works, at the cost of forfeiting the first purchase).

Verified by 10 new `townBuilder.test.ts` cases, 3 new `HangarOverlay.test.tsx` cases, the open-tile
measurement above, and the full gate (1051 server + 301 web tests, typecheck, build) — not yet
seen rendered in a real browser from this sandbox.

## Stage 2.19 — Soumaya stops talking like a spaceship, and a real old-galaxy parity audit

Direct user complaint: "Samaya shouldn't be responding to me like she's still a spaceship flying
through a space galaxy." Confirmed real by reading the actual prompt/fallback text, not assumed:
`llm/prompts.ts`'s `ANSWER_SYSTEM` (the real prompt shaping every Gemini/OpenAI reply) literally
introduced her as "the starpilot of the memory galaxy... tend[ing] from a small craft", and
`llm/heuristic.ts`'s OFFLINE fallback replies (used with no API key) said things like "Cruising
the quiet outer reaches of your galaxy" and "Stardate: ..." — reaching the player in BOTH modes.
Fixed: `ANSWER_SYSTEM` now introduces her as "the Mayor of the user's own town" (matching
soumaya-governance.md); every heuristic fallback string rewritten to plain, town-appropriate
language; `persona/derive.ts`'s "this person's galaxy holds N memories" line (fed to the LLM as
context, so the model could echo it back) fixed the same way; the "GALAXY NAVIGATION"/"GALAXY
ENTITIES" prompt section renamed to "GO-THERE NAVIGATION"/"PLACES YOU MAY POINT THEM TO". A real
regression test (`heuristic.test.ts`) now asserts no space-cosmology word ever appears in her
offline replies, not just a one-off prose edit.

**A real parity audit**, not a guess, in response to "everything that came from that old galaxy
needs to be transformed and added to this": read the actual deleted files (`git show <commit>:<path>`
against the pre-deletion commit) rather than relying on the roadmap's own Stage 2 dock-parity table,
which only ever covered the 11 TAB-shaped features — it never claimed to cover ambient, cross-cutting
ones. Found 5 real, evidence-backed gaps, each now tracked rather than lost: **MindSpace** (task
#70) — an always-present overlay floating your live working-memory thoughts as glowing "motes",
reading the exact `getThoughts()` API `SanctuaryOverlay` already uses, just never as an ambient
layer; the user's own explicit ask, plus a real enhancement idea (NPCs "aware" of the floating
motes, commenting on them). **Dormant memory-storytelling systems** (task #71) — per-memory
evolving lore (`getLore`/`evolveLore`, itself still space-themed and needing the same prompt fix),
the Chronicle "flowing river" timeline, and Codex discoveries — all real, all fetchable, all with
zero Overworld UI. **Lenses** (task #72) — saved filtered views; the server route is still live
but the client API file was deleted outright, a bigger gap than the others. **No persistent
ambient HUD** (task #73) — Fuel and Streak are only ever visible inside the Gym, and there's no
Settings/Help access point anywhere. Plus a real asset-sourcing task (#74) for the SimCity-style
expansion the user asked for (schools, homes, businesses, character animations), scoped explicitly
around real licensing + performance constraints, not "pull in whatever."

Verified by the new `heuristic.test.ts` regression suite + the full gate (1056 server + 301 web
tests, typecheck, build). Not yet re-tested against a real LLM key from this sandbox (only the
offline heuristic path and the prompt text itself were directly verifiable here).

## Stage 2.20 — NPCs read as walking, not gliding; Park stops looking like a building

Two direct, concrete complaints, each checked by reading the actual numbers/code rather than
guessed at. **"NPCs shouldn't fly across the map or move any quicker than I can."** Measured: the
player's own step tween is 140ms/tile (`handleInput`); `NPC_STEP_MS` is 160ms/tile — NPCs (and
Soumaya) were already never faster per tile than the player. The real gap was the missing
footstep cue: every NPC walk was a pure linear glide with no squash/stretch, while the player has
had one since Stage 1 — over a long unbroken path (Soumaya's town tour, a Town Meeting gathering)
that reads as sliding/flying even at an equal or slower rate. Fixed with `hopStep()`, the exact
same squash/stretch shape as the player's own step-hop, now firing on every NPC/Soumaya step
(`walkPath` for attendants, `walkSoumayaPath` for Soumaya) — a real per-step visual, not a speed
change (the rate was already correct).

**"[The Park] look[s] stupid... not a park, and nobody's going to it."** Read, not guessed:
`buildingSprites.ts` never had art for Park, so it fell through to the generic `COTTAGE`
building illustration — the Park was being rendered as a stone building, the literal opposite of
an open public space. Fixed by excluding Park from the building-illustration pass entirely and
painting its footprint with the plaza's own `path` tile instead — a real paved courtyard, not
grass indistinguishable from the rest of the ground and not a building nobody could tell was
walkable. Genuine park decor (benches, trees) still needs real art that doesn't exist in the
loaded atlas yet — tracked as part of task #74's asset sourcing, not invented here. Passability is
unchanged (still a walled footprint entered via the door, like every other building) — a fully
open, walk-anywhere park interior is a deeper follow-up, not attempted in this pass.

Also this round: real design decisions made per the user's "do all of them, they complement each
other" direction — **Zoning** (task #75, new) is the real missing foundation the SimCity framing
was pointing at: it determines WHERE housing (#66) and business types (#67) can even go, so both
now formally depend on it rather than being built ahead of it. **Fuel stays exactly what it
already is** (the real LLM-job-cost meter) — it is NOT being reinterpreted for NPCs; the
NPC/town-facing "morale" concept the user was reaching for is a new, distinct aggregate built from
real existing data (buildingNeglect + townLedger + npcRelationships), folded into task #64 under
the working name "Town Morale" pending its own design pass.

Verified by reading the actual step-duration constants (the real measurement above) + the full
gate (1056 server + 301 web tests, typecheck, build). Not yet seen rendered in a real browser —
the hop cue and the Park courtyard especially need real on-device eyes, since this is exactly the
kind of visual fix that's easy to get subtly wrong from source alone.

## Stage 2.22 — Zoning: the real foundation under housing and business (task #75)

Direct answer to "I also need zoning to be a thing... where the homes can go, where sidewalks for
the NPCs can go, where transportation services... can go, [where] commercial buildings can go to
earn income." Specced first (`docs/overworld/zoning.md`) per Rule #1, resolving the real
ambiguities: a zone is a per-tile tag (not a drawn region, matching the tile-at-a-time mechanic
town-builder already established), four real types (`residential`/`commercial`/`sidewalk`/
`transit`), zoning itself is FREE (a planning decision — only actually building a home/business on
a zoned tile will later cost anything, once #66/#67 exist), and today's decor items (#65) stay
zone-agnostic rather than retrofitting what already shipped.

Reuses the exact arm-then-place interaction town-builder already built, as a second, parallel
"arm mode" in `handleInteract()` (kept separate from item-placement rather than merged — tagging a
tile and placing a decor item are conceptually different actions). New `data/zoning.ts` (pure,
localStorage-backed, same shape as `townBuilder.ts`); zoned-but-unbuilt tiles render as a distinct
low-alpha glyph per type (🏠🏪➰🚏, never color-only); a new "Zoning" section in the Hangar arms a
type for free. The request's own "positive/negative effect on the economy" becomes mechanically
real once #66/#67 actually gate placement by zone type — this slice's own honest contribution is
a real per-type count read-out, never an invented score.

Also fixed in passing: a stale comment on `NPC_STEP_MS` from before Stage 2.20's movement-speed
fix still claimed "NPCs move faster per tile than the player deliberately does" — factually wrong
against the real 160ms vs. 140ms numbers already measured and shipped; corrected to match.

Verified by 10 new `zoning.test.ts` cases, 2 new `HangarOverlay.test.tsx` cases, the same
857-of-1104-tiles-zonable measurement town-builder's own placement already proved (both reuse
`isPlacementBlocked`), and the full gate (1056 server + 313 web tests, typecheck, build). Not yet
seen rendered in a real browser from this sandbox.

## Stage 2.24 — Mayor's Hall: literally the biggest building on the map (task #63)

Direct answer to "somebody needs the biggest building on the map, which is for the mayor."
Specced first (`docs/overworld/mayors-hall.md`) per Rule #1, resolving soumaya-governance.md
decision #5's open questions: 12x6 (72 tiles) vs. every other building's uniform 6x3 (18 tiles) —
4x the area, unmistakably the largest. Placed in its own row below the south row (extending
`REGION_HEIGHT` the same way the region's width already derives from its rightmost building) —
every collision/passability/attendant-post function in `regionLayout.ts` was already generic over
a `DoorPlace`'s own footprint/door fields, so the bigger footprint needed zero changes to any of
them, verified by a real ASCII-map print of the generated layout (ordinary uniform-grid buildings
above, the much bigger hall centered below, clean margins on every side, no overlaps).

**"Her security"** — the working interpretation from soumaya-governance.md confirmed: two real
attendant NPCs (Wren, Cass), the exact same `ATTENDANTS_PER_BUILDING` pattern every other building
already has, with real `npcDialogue.ts` profiles so they're full NPC Society members (schedule,
dialogue, relationships) like all 20 other attendants, not a special case.

**What walking in shows — a real Mayor's Office dashboard**, not a new invented screen: the same
Town Treasury (`townLedger.ts`), per-building neglect (`buildingNeglect.ts`), and zoning plan
(`zoning.ts`) already real elsewhere, shown together at the town level for the first time.
Read-only this round — no interaction exists yet to credit as real work, stated plainly rather
than inventing one.

Reuses `FLAG_TOWER` (the same civic-banner illustration Town Hall/Gym already use) and the generic
player-sprite attendant fallback — no new art was invented; a distinct look is tracked under task
#74. Verified by 2 new/updated `regionLayout.test.ts` cases (11 real door-buildings; Mayor's Hall
is 4x any other building's area), 6 new `MayorsHallOverlay.test.tsx` cases, the real ASCII-map
measurement above, and the full gate (1056 server + 320 web tests, typecheck, build). Not yet seen
rendered in a real browser from this sandbox.

## Stage 2.25 — The townwide civic-concern signal (task #64)

The D3-compliant reframe of "add the criminals system and policing" — `decisions.md` D3 is
explicit and permanent ("no battle mechanic, ever"), so a literal crime/police system was never
on the table. Specced first (`docs/overworld/civic-concern.md`) per Rule #1: the real, compliant
version is a SECOND, independent reason to hold the exact same real Town Meeting
(`townMeeting.ts`'s `announceTownMeeting()`) already built — a real majority of the town's
buildings neglected at once (`buildingNeglect.ts`), never one struggling building, which Park and
the new Mayor's Office already surface individually. No new governance mechanism — the same
Bulletin Board post + NPC gathering, a second trigger.

New `data/civicConcern.ts`, mirroring `townMeeting.ts`'s own shape: edge-triggered (announces once
on the transition into "widespread," re-arms only once neglect genuinely drops back below the
threshold — never re-announces while it stays true), and its Bulletin Board message names real
buildings ("N of M buildings haven't had real work in a while — Bank, Library, ...") rather than
inventing any crime/decline narrative.

Measured before shipping, not assumed: ran the real check against the actual 10 real door places
(Mayor's Hall correctly excluded, since it has no work event to be neglected by yet) — a genuinely
fresh save (nothing ever worked anywhere) correctly triggers the signal immediately. Deliberately
NOT special-cased with a grace period: `buildingNeglect.ts`'s own convention already treats
"never worked" as maximally neglected everywhere else in the app (Park, Mayor's Office, attendant
dimming all show this identically for a fresh town) — adding a grace period just for this one
signal would create a NEW inconsistency, not fix one.

Verified by 8 new `civicConcern.test.ts` cases, the real-data measurement above, and the full gate
(1056 server + 328 web tests, typecheck, build). Not yet seen rendered in a real browser from this
sandbox.

## Stage 2.26 — Real housing/real-estate types (task #66)

Direct answer to the SimCity framing's own "give the NPCs homes... our individual life is not
identical to another" and "hot zoning is how many homes there are." Specced first
(`docs/overworld/housing.md`) per Rule #1: gives zoning (task #75) and the Hangar town-builder
(task #65) their first real mechanical consequence — until this round, a zoned tile did nothing
and a home could not be built anywhere.

New `data/housing.ts`: a small catalog of 4 home types (Cottage 2x2/1 resident, Duplex 3x2/2,
House 3x3/3, Apartment Block 4x3/4), each buildable only on ground already tagged
`"residential"` by zoning — a stricter, multi-tile version of the same arm-then-place mechanism
town-builder's 1x1 decor items already use, reusing the real Town Treasury for price. NPC-to-home
assignment (`assignResidents`) is deterministic and capacity-packed — never random, never an
invented backstory: homes fill in real build order, each to its own real capacity, from the
town's real, fixed 20 society NPCs (`npcDialogue.ts` gained `allSocietyNpcIds()` as the one
stable source). This is what actually produces "not identical" NPC living situations: an NPC
housed in a Cottage genuinely lives alone; one in an Apartment Block genuinely shares with 3
others — a real, checkable number, never a personality trait.

`ExteriorScene.ts` renders a placed home the same way a real door-building is drawn (COTTAGE's
already-loaded illustration, scaled to the home's own footprint — no new art sourced this round,
task #74 covers that), plus a small type-glyph badge (🏠/🏡/🏘️/🏢) at its door so the 4 types stay
tellable apart despite sharing one base image. `HangarOverlay.tsx` gained a "Housing" section
(buy + arm, same shape as "Town Building"); `MayorsHallOverlay.tsx` gained an honest "Housing"
summary ("N of 20 residents have a real home — X living alone, Y sharing") — never an invented
family story, matching its own "nothing here is a score" convention.

Deliberately, explicitly deferred: routing the NPC schedule's "Home" state to actually pathfind
to the NPC's own assigned home door. `ExteriorScene`'s Home state already rests attendants
visibly at their own building's post — a real, deliberate reversal from earlier user feedback
(npc-economy.md) — and its tween-driven state machine is the most fragile part of this codebase
(a real cross-tween conflict was already caught and fixed here once, npc-autonomy.md). Shipping
the real-estate layer itself (buildable, zoned, assigned, honestly reported) without risking that
working, verified machinery is the safer sequencing this round; wiring actual home-going is a
clearly-scoped follow-up, not a silently dropped one.

Verified by 13 new `housing.test.ts` cases (including a direct, deterministic reproduction of
capacity-packed assignment and the zoning gate), 2 new `MayorsHallOverlay.test.tsx` cases, 2 new
`HangarOverlay.test.tsx` cases (plus 1 existing assertion updated for the new catalog), a real
open-ground probe against the actual 46x31 map (confirming x=2..9,y=10..17 is genuinely clear of
every building/object/attendant/grass/spawn tile before using it in tests), and the full gate
(1056 server + 345 web tests, typecheck, build). Not yet seen rendered in a real browser from
this sandbox.

## Stage 2.27 — A real multi-business economy (task #67)

Direct answer to the task's own name: "more than one Market." Specced first
(`docs/overworld/business.md`) per Rule #1 — mirrors housing.md (task #66) almost exactly on
purpose: the same zoning-gated, player-built, treasury-priced pattern, now for the `"commercial"`
zone type that also did nothing until this round. Since a tile holds exactly one zone type at a
time, a business can never legally overlap a home — the zoning gate alone prevents that, no
cross-module check needed.

New `data/business.ts`: 3 business types (Bakery 2x2/$4.00, Tailor 3x2/$6.00, Bookshop
3x3/$8.00), each with its own small real goods catalog (never overlapping Market's own goods).
Unlike a home, a placed business is a real place you WALK INTO — stepping onto its own door tile
(a second, dynamic check alongside the static `doorPlaceAt` in `afterStep`) opens a generic
`BusinessOverlay.tsx`, parameterized by the business's own real type/goods rather than one
hand-built screen per type. Buying a good there credits THAT business's own real hours and resets
its own real neglect clock — confirmed before writing any code that `creditHour`/`markWorked`
(`townLedger.ts`/`buildingNeglect.ts`) were already string-keyed, so a dynamic business id needed
zero changes to either file.

Rendered by reusing ARCHED_HALL (the same illustration Market itself already uses), scaled to
each business's own footprint, plus a type-glyph badge (🥐/🧵/📖). `HangarOverlay.tsx` gained a
"Business" section; `MayorsHallOverlay.tsx` gained a "Business Neglect" list, same shape as its
existing door-building "Town Health" list. `ExteriorScene.ts` gained `returnToBusinessDoor` (a
dynamic-id twin of `returnToDoor`) so leaving a business's overlay puts the player back where
they entered from, same as any real door-building.

Deliberately, explicitly deferred (both carried over unchanged from housing.md): no new collision
enforcement for any placed footprint (`isMovementPassable` still doesn't know about ANY dynamic
placement — a pre-existing gap, not introduced or worsened here); NPCs working at a placed
business (these are player-run shops this round, not staffed ones — task #68's territory); any
distinct art per business type (task #74).

Verified by 14 new `business.test.ts` cases, 6 new `BusinessOverlay.test.tsx` cases, 2 new
`HangarOverlay.test.tsx` cases (plus 1 existing assertion updated for the new catalog), 2 new
`MayorsHallOverlay.test.tsx` cases, and the full gate (1056 server + 369 web tests, typecheck,
build). Not yet seen rendered in a real browser from this sandbox.

## Stage 2.28 — Does the town run whether or not the player is present? (task #68)

Answered the task's own question honestly first (`docs/overworld/town-persistence.md`) per
Rule #1, from reading the real code rather than assuming: `buildingNeglect.ts`'s neglect (and
everything built on it — civic concern, Town Health, Business Neglect) already runs
independent of the player, because it's computed from a real stored timestamp compared against
`Date.now()` at read time, never a tick. What does NOT: `ExteriorScene.tickSociety()`'s NPC
Working/Break/Home schedule, driven by a session-local `societyTickCount += 1` that resets to 0
on every reload — confirmed by reading `init()`, nothing persists or restores it. What CANNOT,
as a genuine architecture boundary rather than a cop-out: any of that schedule's VISUAL
consequences (walk tweens, outings, the meeting gathering) — this app has no server-side
job/worker or background sync, so animating anything with no browser tab open would need a real
new piece of infrastructure (a server-side town simulation), not a client tweak.

The one real, safe fix shipped: `tickSociety()`'s tick is now derived from
`Math.floor(Date.now() / SOCIETY_TICK_MS)` instead of counted up from a session-local field —
`npcSchedule.ts`'s `scheduleStateAt` needed ZERO changes, since it was already a pure function of
whatever tick number it's given. Measured before shipping, not assumed: a real reproduction
script confirmed the OLD behavior always resumed a fresh scene at "just started Working"
regardless of real elapsed time, the NEW behavior correctly reflects a real simulated 3-hour gap,
and the new tick is mathematically identical to what continuously incrementing the whole time
would have produced (`tickAtOpen + elapsedRealTicks === tickAfterGap`, confirmed true). The
60-real-second Working/Break/Home cycle LENGTH itself is unchanged — still arcade-paced, not a
real day/night length (a separate, bigger design decision this round does not attempt).

Verified by the reproduction-script measurement above and the full gate (1056 server + 369 web
tests, typecheck, build) — no test file targets `ExteriorScene.ts` directly (consistent with this
file's existing convention: Phaser-integration code is verified by measurement + the pure logic
modules' own tests, not a dedicated unit-test file), so this entry documents the verification
directly. Not yet seen rendered in a real browser from this sandbox.

## Stage 2.29 — Deepening the player-action feedback loop (task #69)

Found two real, concrete gaps by reading `npc-economy.md`'s own "which real API call feeds which
building" table against every real `recordBuildingWork` call site in the codebase, per Rule #1
(`docs/overworld/town-growth-loop.md`) — not guessed:

1. **A fresh memory capture credited nothing.** The single most central real action in the app
   (`OverworldRoot.tsx`'s `handleCaptureSubmit` → `ingestText(text, { kind: "memory" })`) earned
   zero building any hours. Resolved: credits the Library — not an arbitrary pick, a freshly
   captured memory becomes exactly one more real node in the same `graph.nodes` collection
   `LibraryOverlay.tsx`'s own "shelves" already read.
2. **The Town Meeting / civic-concern Bulletin Board posts credited nothing.** Both are the
   exact same real `ingestText(..., { kind: "action" })` mutation `BulletinBoardOverlay.tsx`'s
   own direct posts already credit correctly — they just never called `recordBuildingWork`
   themselves, an inconsistency rather than a missing feature. Both now do.

Both fixes are the same one-line pattern every other real mutation in this app already uses —
"deepening the loop" here means closing two real gaps in it, not inventing a second one.
Deliberately left alone: whether a capture should ALSO credit a second building (e.g.
Sanctuary) has no single obviously-correct answer from existing data, so it's not guessed at.

Verified by the full gate (1056 server + 369 web tests, typecheck, build) and the existing
`OverworldRoot.test.tsx` suite passing unchanged. Not yet seen rendered in a real browser from
this sandbox.

## Stage 2.30 — Cross-building NPC relationships (task #59)

Direct answer to repeated real feedback asking for NPCs who "interact with other npcs" beyond
just their own building's coworker. Specced first (`docs/overworld/social-depth.md`) per Rule
#1 — found the real gap was purely in the SCENE: `npcRelationships.ts`'s `bumpRelationship` was
always generic over any two npcIds; nothing ever gave two different buildings' NPCs a real
chance to actually meet.

The real trigger: two different NPCs both genuinely lingering at the SAME outing destination
(Park or Market — npc-autonomy.md's own real off-duty system) at the same real moment. New
`outingArrivedAt: Map<string, PlaceId>` tracks who's actually there right now (added the instant
an outbound outing walk completes, removed the moment the return leg begins or any interrupting
transition fires); `tryCrossBuildingEncounter` checks it at exactly that arrival moment — a real,
checkable coincidence from data that already existed, not an invented dice roll.

Two deliberate differences from a same-building encounter (`triggerCrossBuildingInteraction`,
mirroring `triggerNpcInteraction`'s shape): the dialogue pool is capped at "acquaintances" —
every hand-authored "friend line" in `npcDialogue.ts` assumes a same-building partner ("covers
the far door..."), so reusing one verbatim for a cross-building pair would misdescribe the
relationship; and relationship growth pauses if EITHER npc's own home building is neglected, not
just one. The real relationship count/tier still grows normally underneath regardless of the
dialogue cap, and persists honestly.

Verified by the full gate (1056 server + 369 web tests, typecheck, build) — no dedicated
`ExteriorScene.ts` test exists (this file's established convention: Phaser-integration code is
verified by careful review + the full gate, not a unit test). Not yet seen rendered in a real
browser from this sandbox.

## Stage 2.31 — A persistent town HUD + a Settings/Help entry point (task #73)

Direct answer to a real flagged gap from the 2026-09-11 parity audit: "no persistent Fuel/
Streak HUD or Settings/Help entry point anywhere." Confirmed still true by reading the real
code first, per Rule #1 (`docs/overworld/town-hud.md`) — Streak/Fuel only ever showed inside the
Gym, Treasury only ever inside Market/Hangar/Mayor's Hall, and there was no Settings/Help surface
at all beyond the two bare floating music buttons.

New `ui/TownHud.tsx` — a compact, always-visible, top-left bar (the existing music controls
already own top-right): 🔥 streak, ⚡ fuel (both `GymOverlay.tsx`'s own established icon
convention, reused not reinvented), 🏦 real Town Treasury balance. Three real numbers only, never
a score, never an invented "town health %".

New `ui/SettingsOverlay.tsx`, opened by a new ⚙️ button joining the existing top-right music
controls: "Sound" (the SAME real `musicEnabled`/`setMusicEnabled`/`nextTrack` the floating
buttons already use, exposed a second, more discoverable way) and "How to Play" (only the real,
already-true controls read from `ExteriorScene.ts`'s own key bindings — WASD/arrows to move,
Space/Enter or the touch A button to interact, walk onto a door to enter, walk into tall grass to
capture a memory — nothing invented).

Verified by 7 new tests (`TownHud.test.tsx` x3, `SettingsOverlay.test.tsx` x4) and the full gate
(1056 server + 376 web tests, typecheck, build). Not yet seen rendered in a real browser from
this sandbox.

## Stage 2.32 — Reviving Lenses (task #72)

A real orphaned feature, confirmed by direct investigation before writing anything
(`docs/overworld/lenses-revival.md`), per Rule #1: the server route/repo/shared types
(`/api/lenses`, `lenses.repo.ts`, `Lens`/`LensQuery` in `@brain/shared`) were never touched by
the Overworld rewrite — a Lens is a real, deterministic (no-LLM) saved filter over the `nodes`
table. Only the entire client side (`api/lenses.ts`, `LensChips.tsx`, `LensesPanel.tsx`) was
deleted outright in the galaxy-deletion commit, leaving a fully live server feature with zero
way to reach it.

`api/lenses.ts` is recreated VERBATIM from git history (`git show` on the pre-deletion commit) —
same 5 function signatures (`getLenses`/`createLens`/`updateLens`/`deleteLens`/`lensNodes`), same
`afetch`-wrapped safe-fallback shape — not redesigned, then re-exported from `client.ts` the same
way every other feature domain already is.

The real in-world home is the Library — a Lens is literally "a saved way to browse the shelves,"
the exact same `graph.nodes` Library already reads. This round ships a real, deliberately
minimal vertical slice: a lens is exactly the search you just typed (`query.text`), saved and
re-runnable by name, rather than a 7-field query-builder built from nothing. `LibraryOverlay.tsx`
gained a "Saved Lenses" list (name, real count, pinned marker, View/Delete) and a "Save this
search as a Lens" button that appears once a real search has real results; viewing a lens
filters the already-loaded shelf nodes down to `lensNodes(id)`'s real matching ids, reusing the
exact same results-list rendering search hits already use.

Verified by 4 new `LibraryOverlay.test.tsx` cases (list/save/view/delete, all against real mocked
API calls) + 3 existing cases updated for the new `getLenses` call on open, and the full gate
(1056 server + 380 web tests, typecheck, build). Not yet seen rendered in a real browser from
this sandbox.

## Stage 2.33 — Reviving the dormant memory-storytelling systems (task #71)

Investigated first, not guessed (`docs/overworld/storytelling-revival.md`), per Rule #1: this is
genuinely **3 distinct systems**, not 2 — a real naming collision in the codebase calls both
Lore and Timeline "the Chronicle" in different comments, but they have separate DB tables,
routes, and shared types. All three have fully working, already-typed client wrappers
(`getLore`/`evolveLore`, `getTimeline`/`addTimelineChapter`/`deleteTimelineChapter`,
`getCodexDiscoveries`/`claimCodexReward`) sitting unused in `api/client.ts`/`features.ts` — the
gap was never the API layer, only that nothing in the Overworld ever called them.

Each system got the real in-world home its own data already implies, not a new place:
- **Lore** → `CreatureSummaryOverlay.tsx`. A memory's own evolving story belongs right where you
  already read everything else about that memory — latest chapter shown, a real "✦ Evolve"
  button writes the next one.
- **Timeline** → `TownHallOverlay.tsx`. A life chapter is the same concept Journeys already
  represent at Town Hall. Real chapters list with a non-color trend badge (📈/📉/➖/🔀); deleting
  is only ever offered for chapters origin === "user" wrote — Soumaya's own auto-generated ones
  are her real computed narrative, not a stray click's to erase.
- **Codex** → `GymOverlay.tsx`. Already the real home of the one Codex meta-achievement that
  exists today; the browsable discoveries feed joins its own achievement family. Claiming shows
  the real idempotent-server result and disables that one button for the session — no invented
  "already claimed" tracking, since no such signal is actually exposed client-side.

Verified by 3 new `CreatureSummaryOverlay.test.tsx` cases, 3 new `TownHallOverlay.test.tsx`
cases, 3 new `GymOverlay.test.tsx` cases, and the full gate (1056 server + 389 web tests,
typecheck, build). Not yet seen rendered in a real browser from this sandbox.

## Stage 2.34 — Real Park decor, sourced from CC0 assets already in use (task #74)

Task #74 asked to "source real free/CC0 assets" — most of that work was already done in an
earlier round (the whole Overworld tileset is Kenney's real CC0 "Tiny Town"/"Tiny Dungeon"
packs). What was still genuinely missing, confirmed by reading the real credits/atlas first
(`docs/overworld/park-decor.md`) per Rule #1: only a small hand-picked subset of Tiny Town's own
tiles was ever pulled into `tiles.png` — real tree/bench/fence art was never extracted from the
same already-approved source, leaving Park's own repeated real complaint ("a bunch of dirt
patches... not a park") genuinely unfixable until now.

A real, new capability was confirmed directly rather than assumed: the same CC0 mirror this
atlas already cites (`github.com/shorepine/kenney`) is reachable from this sandbox via a shallow,
sparse `git clone` — kenney.nl/itch.io direct downloads remain blocked, but this mirror isn't. A
labeled contact sheet of the mirror's real 132 individual Tiny Town tiles was generated and
visually reviewed to hand-pick 5 genuinely usable ones (two trees, a bench, a fence post, a
mushroom) — never invented, never guessed from a filename.

`tiles.png`'s own frame indices 5-9 (already confirmed retired/unreferenced from a prior round's
own "modular wall/door/roof kit" removal) were repainted with these 5 real tiles — zero risk to
the other 27 frame indices every other file already references by number, confirmed by pixel-
diffing every patched slot against its real source tile (not eyeballed) before writing any code.
`ExteriorScene.ts`'s Park rendering now places them at fixed, door-collision-checked positions
within Park's real 6x3 footprint (verified against `regionLayout.ts`'s own door-tile formula)
instead of a bare paved courtyard.

Verified by 2 new `tileAtlas.test.ts` cases (frame-collision checks), a direct pixel-diff
verification of the patched atlas against its real source, and the full gate (1056 server + 391
web tests, typecheck, build) — confirmed the patched `tiles.png` is byte-identical between
`public/` and the built `dist/`. Not yet seen rendered in a real browser from this sandbox.

## Stage 2.35 — Real on-device bug fixes from live feedback (button overlap, invisible NPCs, Soumaya)

Direct response to a real, detailed voice-transcribed feedback pass — four concrete, provable
bugs fixed this round (the larger asks from that same message — MindSpace, Mission Control,
hybrid LLM dialogue/Mall, SimCity-scale zoning, building-art diversity, an overlay quality audit,
building interiors, and an NPC entertainment/theater system — are tracked separately as active,
not deprioritized, work).

**1. Two in-game buttons hidden behind the logout button.** Confirmed by reading `AuthGate.tsx`:
its "Log out" button is `position: fixed, top: 8, right: 8, z-index: 10` — the exact same corner
`OverworldRoot.tsx`'s Settings/Next-track/Mute row claimed at `z-index: 1`, so 2 of the 3 buttons
rendered fully hidden underneath it. Fixed by moving that row down (`top: 44`) below the logout
button's real height instead of contesting the same pixels.

**2. "Invisible NPCs blocking the area around doors."** Measured first, not assumed: a real
ASCII passability-map probe (`probe.ts`, written then deleted) around the Bank building, using
the actual `isMovementPassable`/`allPlaces` functions, showed the door approach itself is
genuinely 4 tiles wide and clear — disproving a "tight door" theory. The real, provable mismatch:
each attendant's own two post tiles (`regionLayout.ts`'s `isAttendantTile`) stay impassable at
ALL times, including while that attendant is genuinely invisible (Working, gone inside). Nothing
was ever drawn there while hidden, so a permanently-blocked tile with nothing visible on it read
as a mysterious invisible obstacle. Fixed with a permanent, low-alpha "▪" ground marker at every
post tile (`addPostMarker`), independent of the attendant's own visibility — it now always
explains why that ground is reserved. Deliberately did NOT make passability itself time-
dependent (the lower-risk fix): `isAttendantTile`/`isMovementPassable` stay pure and static,
protecting the player's core movement engine and `regionLayout.test.ts`'s static-passability
assumptions from a change this round didn't need to make.

**3. "We have her as a male wizard in a purple outfit... she's female."** Confirmed accurate by
building a labeled contact sheet of the same already-approved Tiny Dungeon CC0 pack — frame 15
(`soumayaMarker`) was genuinely a male-presenting wizard sprite. Repainted with a real
female-presenting Tiny Dungeon tile (source index 99: long reddish-brown hair, purple/pink
dress), pixel-diff-verified against the real source before/after, confirmed no other frame was
disturbed via a full 36-frame contact sheet re-check.

**4. "She's always running around... doing your job isn't literally just running in circles...
she also needs the ability to enter buildings just like me."** `tickSoumayaWander()` rewritten to
add real dwell time (12000ms, or 300ms under `prefersReducedMotion()`) after every leg, and to
deterministically alternate (by a running tour index, never `Math.random`) between two outcomes
per stop: "enters the building" (her body sprite hides, mirroring the existing attendant
Working-state convention) and "found dwelling outside" (stays visible). The player's own greet-
Soumaya interaction now checks `this.soumaya?.body.visible` first — she can't be greeted while
genuinely "inside" a building, closing the loop the user's own bug report named ("no NPCs that go
invisible" applies here too — she's now only ever hidden with a load-bearing reason, same as
every attendant).

Verified by the full gate (1056 server + 391 web tests, typecheck, build) and a `cmp` confirming
the twice-patched `tiles.png` (Park decor + this round's Soumaya sprite) is byte-identical
between `public/` and the built `dist/`. None of these four fixes has been seen rendered in a
real browser from this sandbox yet.

## Stage 2.36 — Zoning at true SimCity scale (task #77)

Direct response to the single most emphatic, repeated complaint from a live feedback pass: *"you
gotta really take a step back and look at the SimCity's zoning... there can't be one small
square tile in the game... the fact that you have to go back to the hangar to do it again, to
zone one block at a time is... too slow and doesn't make sense."* Confirmed by reading the
shipped `data/zoning.ts` first, per Rule #1 (`docs/overworld/zoning-rework.md`): the complaint
was real and precise — `zoneTileAt()`'s last line called `clearArmedZone()`, forcing a fresh
Hangar trip after every single tile, and there was no way to paint more than one 1x1 tile per
interact press.

Two fixes, both scoped to the *painting ergonomics* only (the underlying zone-type model from
`zoning.md` was never the complaint):

1. **Arming now persists across paints.** `zoneTileAt()` no longer clears the armed state — arm
   once in the Hangar, then paint as many tiles as you like without a single additional trip.
2. **A real Area mode.** The Hangar's Zoning section gains a Tile/Area toggle. In Area mode, the
   first interact press sets a visible anchor marker on a zonable tile; the second press,
   anywhere else, commits the full rectangle between the two corners in one action — every
   zonable tile inside gets tagged, blocked tiles silently skipped, no size cap. The arm stays
   active afterward so a new rectangle can start immediately.

Since an armed zone type no longer auto-clears, `TownHud` (task #73) gains a small chip whenever
one is active — `🧭 Zoning: Residential (Area)` — with an inline **Stop** button that disarms
from anywhere in the world, so the Hangar is only ever needed to *start* a zoning session, never
mid-session or to end one either.

Deliberately deferred: a live rectangle preview while walking to the second corner (real engine
risk for a cosmetic touch — the anchor marker + commit mechanism already fully resolves both
complaints); any minimum/maximum rectangle size; grid-aligned block shape rules.

Verified by 8 new `zoning.test.ts` cases, 2 new `HangarOverlay.test.tsx` cases, 3 new
`TownHud.test.tsx` cases, and the full gate (1056 server + 405 web tests, typecheck, build). Not
yet seen rendered in a real browser from this sandbox.

## Stage 2.37 — Mission Control as the Overworld's front door (task #60)

Direct user request, reversing an earlier deprioritization: *"I want you to bring back the mind
space, mission control."* `VISION_2_JOURNEYS.md` names Mission Control as where "the daily loop
lands" — today's highest-priority missions, Safe-to-spend, the Daily Contact question, one
memory worth revisiting, progress toward active Journeys, important reminders, AI observations,
recent activity.

A pre-Overworld spec for this exact feature (`docs/specs/mission-control.md`) already resolved
the key design question once, against the old 3D galaxy: *"Mission Control = evolving Observatory
in place, not a new component."* `docs/overworld/mission-control.md` reuses that decision
verbatim for the Overworld's own `ObservatoryOverlay.tsx` (the "Insights" building) — no new
building, no landing modal, no auto-popup on load (the pre-Overworld spec explicitly rejected
force-interrupting a player's own navigation as worse UX than the problem it fixes; same
reasoning applies unchanged here).

Re-auditing against the CURRENT Overworld (not the deleted galaxy) found most of the bundle was
already fetched somewhere, just never shown together: `WorldSnapshot` already carries
`bank.safeToSpendCents` and `dueReviews` (spaced-repetition.md, task #58), and `graph.nodes`
already has everything `BulletinBoardOverlay.tsx` needs for its own agenda/reminder counts. Only
two pieces were genuinely missing: **Daily Contact** (`getDailyContact`/`answerDailyContact` —
fully real, working, typed, and used by nothing in the Overworld, the same orphaned-wrapper
pattern task #71/#72 already found and fixed elsewhere) and **Journey progress as a digest**
(`getJourneys()` — Town Hall's region list already reads it, but no summary view existed).

`ObservatoryOverlay.tsx` now shows, in the vision doc's own priority order: today's agenda (open
quest + due reminder counts) → Safe-to-spend → Daily Contact (question + answer form, or the
day's discovery/foresight once answered) → "worth a moment" (the first spaced-repetition due
item) → active Journeys with real progress (capped at 3) → AI observations (unchanged, already
there) → recent activity (graph nodes by creation date). Answering the Daily Contact question
counts as the Observatory's own real work event, same convention resolving an insight already
uses. The relationship check-in suggestion stays deferred — it needs genuinely new computation,
not reuse, same reasoning the pre-Overworld spec gave for deferring it there too.

Verified by 7 new `ObservatoryOverlay.test.tsx` cases and the full gate (1056 server + 412 web
tests, typecheck, build). Not yet seen rendered in a real browser from this sandbox.

## Stage 2.38 — MindSpace's ambient floating-thought overlay (task #70)

Direct user request, reversing an earlier deprioritization: *"I want you to bring back the mind
space, mission control."* Tracked since the 2026-09-11 parity audit as *"an always-present
overlay floating your live working-memory thoughts as glowing 'motes', reading the exact
`getThoughts()` API `SanctuaryOverlay` already uses, just never as an ambient layer."*

The data was already fully real — `getThoughts()` (`api/mind.ts`) returns the server's live
working-memory list (text, decayed `strength`, `reinforceCount`); `SanctuaryOverlay.tsx` already
lists/reinforces/promotes/dismisses these. The gap was purely presentational: nowhere outside
that one building were thoughts visible. `docs/overworld/mindspace.md` (per Rule #1) resolved the
design: motes stay **read-only ambient decoration** (managing a thought stays exclusively in the
Sanctuary — no second, competing interaction surface for the same data), and since a thought has
no real location (unlike a memory-turned-node's stable seeded-grid tile), motes **orbit the
player** instead of any fixed world position — a small drifting ring of "💭" that follows you,
reading as "your live working memory," capped at the top 6 by strength so it never becomes visual
noise.

New pure module `adapter/moteLayout.ts` (`moteOffset(thoughtId, timeMs)`) computes a deterministic
circular drift per thought (radius/phase/speed all hashed from the thought id, same no-
`Math.random` convention as `grassFrameFor`/`idleBobDelayMs`) — a no-op (frozen, non-drifting) under
`prefersReducedMotion()`, same as every other decorative loop in this scene. A mote's alpha
carries `strength` and its scale carries `reinforceCount` — two independent non-color cues for two
independent real numbers, never color alone. `WorldSnapshot` gained a `thoughts` field (fetched
alongside everything else in `loadWorldSnapshot()`); `ExteriorScene.setThoughts()` mirrors
`setCreatures()`'s existing pending/render pattern, and `update()` repositions every mote each
frame from the player's current on-screen position.

NPC awareness/commentary on the motes — a real enhancement idea, but distinct from the user's
actual ask (the ambient overlay itself) per the parity audit's own wording — stays explicitly
deferred to its own follow-up.

Verified by 8 new `moteLayout.test.ts` cases, 2 new `loadWorldSnapshot.test.ts` cases, and the
full gate (1056 server + 422 web tests, typecheck, build). Not yet seen rendered in a real
browser from this sandbox.

## Stage 2.39 — Real hybrid LLM + hand-authored NPC dialogue (task #61)

Direct user correction: *"The LLM dialogue was supposed to have already been tied into the
regular dialogue because it was supposed to be hybrid... prewritten dialogue points mixed in
with the LLM as well."* Checked against the real decision that shipped it: `npc-society.md`'s
"Hybrid" choice explicitly deferred the LLM half to "a later stage" — never built until now.
`soumaya-governance.md` (Stage 2.17) had already folded three concrete requirements into this
same task: batching many NPCs' generation into fewer LLM calls, staggering display per NPC
rather than firing on every API response, and not every interaction needing full text.
`docs/overworld/npc-llm-dialogue.md` (per Rule #1) resolved the design — **split the Mall out
into its own follow-up task** (the user's actual message never described it; it's a distinct
building/shop feature) and scoped this round to dialogue only.

**Server**: a new optional `LlmProvider.generateNpcLines(npcs, townState): Promise<string[] |
null>` (same "absent → caller's own deterministic fallback" convention as `chronicle`/`planJob`/
`webLookup` — zero existing test fakes needed updating), implemented in `openai.ts`/`gemini.ts`
with a flat `{ lines: string[] }` schema, wrapped in `resilient.ts`. A new deterministic
`heuristicNpcLines()` (`analysis/npcLines.ts`) is the REAL always-present base — grounds each
line in the NPC's own job flavor plus one real town-state fact (treasury, a neglected building,
node count), never invented, never `Math.random`. New route `POST /api/npc-dialogue` (batched:
one call for every NPC, never one per NPC) tries the LLM upgrade and falls back to the heuristic
base on any failure — same "heuristic base + optional cloud upgrade" shape `lore.ts`'s
evolveLore/chronicle already use.

**Client**: `data/npcLlmDialogue.ts` — a real cooldown (10 minutes) gates how often the batched
call actually fires; every other refresh cycle is a no-op reusing the cached lines. Three real
interaction outcomes, picked deterministically by `pickDialogueOutcome(npcId, seed)` (never a
coin flip): an LLM-flavored line (if cached and fresh), the existing hand-authored pool (the
default, unchanged), or a gesture-only beat with no dialogue bubble at all — the cheapest
possible interaction, explicitly named as valid in the reconciliation round that first flagged
this gap. `ExteriorScene`'s existing per-building Break-time interaction timing is completely
unchanged — it just looks up the right outcome instead of always calling `dialogueFor()`.

Verified by 6 new `npcLines.test.ts` cases, 4 new `npcDialogueRoute.test.ts` cases, 9 new
`npcLlmDialogue.test.ts` cases, and the full gate (1066 server + 432 web tests, typecheck,
build). Not yet tested against a real LLM key from this sandbox, and not yet seen rendered in a
real browser.

## Stage 2.40 — Overlay/menu quality-parity audit: real gaps closed (task #79)

Direct response to detailed real feedback that the overlays are "broken" compared to the old
galaxy-era menus — "missing things, missing sections... missing interactions, missing places to
put content in." Rather than a redesign, ran a concrete, evidence-based audit: read every
overlay in `packages/web/src/overworld/ui/*.tsx` and diffed its real usage against every export
of the API/data module(s) it imports, looking for real capabilities with zero UI hook. Found and
closed three concrete gaps (a fourth, Lenses' other 7 query fields, was already a deliberate,
documented deferral from task #72 — not a real oversight, left as-is):

1. **Town Hall's Journey links were read-only.** `linkToJourney`/`unlinkFromJourney` had zero
   call sites despite being fully real, working, server-backed actions. An expanded Journey now
   has a real "Link a memory" picker (scoped to `kind: "node"` — the other real link kinds
   belong to their own buildings, not invented here) and an Unlink button per linked item.

2. **Mayor's Hall's housing section only ever showed aggregate counts.** `homeForNpc`/
   `residentsOfHome` (housing.ts) had zero callers, even though `HangarOverlay.tsx`'s own doc
   comment already promised "the honest who-lives-where summary lives in Mayor's Hall." A new
   per-home list now names which real Society NPCs actually live in each built home.

3. **Sanctuary was missing three whole real sub-features** (`docs/overworld/sanctuary-
   inquiries-candidates.md`) — Inquiries, Suggested Connections (Candidates), and Person
   suggestions, all fully real and server-backed in `api/mind.ts`, all with zero UI anywhere.
   The single largest unused-surface finding in the audit. Inquiries and Candidates get full
   parity (answer/dismiss/reject; accept/dismiss) — the same list-with-actions shape
   `ObservatoryOverlay.tsx` already uses for Insights. Person suggestions get a real list +
   "Not a person" dismiss only; `getPersonProfile` (a full detail view) is deliberately deferred
   since it implies a navigation pattern that doesn't exist anywhere in the Overworld yet.

Also fixed, found while working on the LLM-dialogue round (task #61): `llm/prompts.ts`'s
`SECTOR_SYSTEM`/`LOG_SYSTEM` still instructed the model to write in space/galaxy language
("charting a region of a galaxy," "Captain's Log... evolution of the galaxy") even though these
prompts feed real, currently-live features (idea clustering, node summaries, the daily log).
Rewrote both prompts' own prose to be plain and grounded, explicitly told never to mention outer
space/a galaxy/a spaceship — scoped to the prompt text only, not the underlying feature/job
naming (a separate, larger, riskier rename with its own blast radius across ops/maintenance).

Verified by 4 new `TownHallOverlay.test.tsx` cases, 1 new `MayorsHallOverlay.test.tsx` case, 5
new `SanctuaryOverlay.test.tsx` cases, and the full gate (1066 server + 442 web tests, typecheck,
build). Not yet seen rendered in a real browser from this sandbox.

## Stage 2.41 — Real pricing-gauged treasury income + Hangar previews + construction delay (tasks #86/#87)

Direct response to a real user request: "the town [should] make money for the treasury gauged
amount correctly based on all including pricing," the Hangar should show "images or something
showing the actual property... that'll be put down," and "it must be built after being placed."
Specced first (`docs/overworld/simcity-economy-construction.md`) per Rule #1, with "verify before
you build" confirming, by reading the actual code, that (a) every building earned an identical
flat 25¢ per real interaction regardless of type or what was actually transacted, (b) neither
`hoursWorked` nor `wagesEarnedCents` is rendered anywhere in the UI (safe to restructure
internally), and (c) Housing/Business both always render the same shared COTTAGE/ARCHED_HALL
illustration in-world regardless of type (`buildingSprites.ts`'s `homeBuildingSprite`/
`businessBuildingSprite`) while the Hangar's own catalog only ever showed a generic emoji — a real
preview/in-world mismatch, but NOT one that applied to town-builder decor (already plain emoji
in-world too, so already an honest WYSIWYG preview there).

Three real fixes:

1. **Pricing-gauged revenue.** `townLedger.ts` gained `revenueForPriceCents(priceCents)` — a real
   50% cut of the specific price being sold, floored at the old flat 25¢ baseline so a cheap sale
   never earns less than before. `creditHour`/`recordBuildingWork` both gained an optional
   trailing `wageCents` override (default unchanged, so every existing civic-building call site —
   Bank, Library, Sanctuary, etc. — is byte-identical); `MarketOverlay.tsx` and
   `business.ts`'s `purchaseGoodFromBusiness` now pass `revenueForPriceCents(good.priceCents)`
   instead of the flat rate. The Town Treasury (`townTreasuryEarnedCents`) is now the sum of real
   accumulated earned cents per building rather than `hours × flat-rate` — still cosmetic-only,
   never real Bank/finance or the real Fuel meter.

2. **A real construction delay.** `housing.ts` gained `CONSTRUCTION_MS` (90 real seconds) and
   `isUnderConstruction(placed, nowMs)` — a pure, read-time-computed function of the real
   `builtAt` timestamp vs. now, same wall-clock convention `buildingNeglect.ts` already
   established (no running timer). `business.ts` reuses the exact same function rather than
   redefining it, so the two building categories can't drift apart. `assignResidents` now skips a
   home still under construction (no NPC moves into an unfinished house);
   `purchaseGoodFromBusiness` refuses a sale at a business still under construction; stepping onto
   a still-under-construction business's own door tile is a silent no-op in `ExteriorScene.ts`
   (same "silent no-op while blocked" convention as zoning/town-builder placement — no toast
   system is mounted in the Overworld). In-world, a home/business under construction renders at
   half alpha with a "🚧" badge instead of its real type glyph, updating live in place once
   `refreshPlacedHomes`/`refreshPlacedBusinesses` next runs after the delay elapses.

3. **Real Hangar previews.** `HangarOverlay.tsx`'s Housing and Business catalog rows now each show
   a real `<img>` thumbnail of the exact same illustration that actually renders in-world for that
   category, sized proportionally to the type's own real footprint (a 4x3 Apartment Block visibly
   previews bigger than a 2x2 Cottage) — an honest preview, not an invented one, since every type
   in a category really does share one illustration in-world (the type-glyph badge is what tells
   them apart, both here and in the world). Both sections' copy now also states the real
   construction delay up front.

Verified by 4 new `townLedger.test.ts` cases (pricing-gauge math + the flat-baseline
byte-identical check), 2 new `housing.test.ts` cases, 1 new `business.test.ts` case, 3 new
`HangarOverlay.test.tsx` cases (image preview + sizing + delay copy), and the full gate (1066
server + 451 web tests, typecheck, build). No dedicated `ExteriorScene.ts` test exists (this
file's established convention — verified by reading the construction-aware paint logic directly).
Not yet seen rendered in a real browser from this sandbox.

## Stage 2.42 — Deep gameplay/UI-UX/asset/engine audit: 8 real bugs fixed (Wave 1)

Direct response to the user asking to "step back and judge this entire thing up next to SimCity,
city building games" and go deeper than the same-day pricing/construction audit — real gameplay
and UI/UX pitfalls, bugs, and missing elements, not just "how it should function." Ran 4 parallel,
read-only investigation agents (assets, UI/UX, gameplay logic, engine/scene), each required to
cite exact `file:line` for every finding. Full findings + fix plan:
`docs/overworld/gameplay-uiux-audit-2026-09-15.md`. This entry covers Wave 1 — 8 real correctness
bugs, no open design decisions, fixed the same round:

1. **Re-arming a Hangar item/home/business silently forfeited the money already spent.**
   `townLedger.ts` gained `refundToTreasury()`, the exact inverse of `spendFromTreasury()`; each
   of `armItem`/`armHomeType`/`armBusinessType` now refunds whatever was armed before spending on
   a new selection, via new `cancelArmedItem`/`cancelArmedHome`/`cancelArmedBusiness`.
2. **A real z-index bug**: TownHud/the Settings-track-mute button row (zIndex:1) painted over
   and stayed clickable through every overlay's own scrim, including Settings itself, since no
   overlay ever set a zIndex of its own. Fixed in `OverlayShell.tsx`, `CaptureMenu.tsx`,
   `CreatureSummaryOverlay.tsx` (zIndex:10).
3. **A real cross-type overlap exploit**: zoning never checked already-built homes/businesses, so
   a tile could be re-zoned out from under a built home and a business legally placed on top of
   it — directly falsifying business.ts's own doc comment that this "can never" happen. New
   `data/placedStructures.ts` (a dependency-free, read-only projection avoiding a housing↔business↔
   zoning import cycle) backs a real fix in all three modules.
4. **Creature placement/roaming and NPC pathfinding were blind to placed homes/businesses — and
   so was the PLAYER's own movement.** `loadWorldSnapshot.ts`'s creature placement, `buildRoamCage`,
   `this.npcPathGrid` (replacing a frozen module-level constant with a live per-instance getter),
   and the player's own `tryMove` call all gained the same `isBlockedByPlacedStructure` check —
   before this, the player could walk straight into their own built house.
5. **3 of 4 armed placement modes had no HUD indicator** (only zoning did), despite being checked
   FIRST in the interact-press priority chain — the most likely to silently eat a press with zero
   explanation. `TownHud.tsx` now shows a chip + a real refunding Stop button for item/home/
   business arms too, mirroring zoning's own.
6. **`CaptureMenu`'s "submitting" phase was a genuine dead end** if the request stalled — no
   Cancel, no Escape handling anywhere in the Overworld. Added a Cancel button that returns to
   entry (keeping the typed text) and a cancelled-ref guard so a late response can't resurrect a
   screen the player already left.
7. **Zero destructive-action confirmations existed anywhere** — deleting a Journey, a Timeline
   chapter, a Lens, and quest turn-in all fired on one tap. New reusable `ConfirmButton`
   (`OverlayShell.tsx`) — a real two-tap arm/confirm with an explicit Cancel, no auto-revert
   timer (this codebase's own no-polling convention) — wired into all four.

Verified by 6 new test files/suites (`placedStructures.test.ts`, plus new cases across
`townLedger`/`housing`/`business`/`townBuilder`/`zoning`/`TownHud`/`OverlayShell`/`CaptureMenu`/
`CreatureSummaryOverlay`/`LibraryOverlay`/`BulletinBoardOverlay`/`TownHallOverlay` test files) and
the full gate (1066 server + 485 web tests, typecheck, build). No dedicated `ExteriorScene.ts`
test exists for the collision-check composition (this file's established convention — the
underlying `placedStructures.ts` primitives it composes are fully unit-tested; the composition
itself is a 2-line boolean OR, verified by reading, not a fresh reproduction script). Not yet
seen rendered in a real browser from this sandbox. Wave 2 (dead achievements, creature render
churn, depth ordering, asset cleanup) and Wave 3 (passive income, onboarding, demolish/remove,
zone-type function, population growth — each its own follow-up spec per Rule #1) are tracked
separately in the audit doc.

## Stage 2.43 — Deep audit Wave 2: 5 dead achievements revived, asset/doc cleanup

Continuation of the same 2026-09-15 audit (`docs/overworld/gameplay-uiux-audit-2026-09-15.md`),
Wave 2 — content/cleanup fixes:

1. **5 achievements permanently unwinnable, now real again.** `sentinel_command`/
   `grand_restorer` (tending a genuinely cooling creature — checked via `isDue` before the greet
   call resets it), `cosmic_voyager` (Soumaya's own real tour, one real leg started = one hop),
   `full_tank` (a real successful `askChat` IS the real on-demand commission), and `lenscrafter`
   (saving a real search as a Lens) all gained real Overworld stat writers via a new
   `bumpStat(spaceId, name)` in `components/achievements.ts` — always keyed by `statsSpaceId()`
   so writes land in the exact bucket the achievement `test`s already read. A 6th candidate,
   `galaxy_reader`/`stat.types_seen`, turned out to already have a real writer
   (`overworld/data/achievements.ts`'s `syncAchievements`) — simplified anyway to compute
   directly from the real graph (matching `sector_pioneer`'s own pattern), removing a whole
   separate tracking mechanism for the same real signal; the now-dead writer was deleted.
2. **A real, if minor, meeting-slot undercount found while fixing the doc-accuracy pass below**:
   `regionLayout.ts`'s `MEETING_ROWS_OUT` (2 rows = 12 slots) was sized against a stale "20"-NPC
   count when the real roster is 22 — several NPCs would have genuinely shared a tile at a full
   Town Meeting. Bumped to 4 rows (24 slots), verified by a new test asserting the slot count
   actually covers all 22.
3. **~40MB of orphaned 3D-galaxy assets removed** from `public/` (9 `.glb` models,
   `milkyway-eso.jpg`, `ship-engine-start.mp3`/`ship-engine-loop.wav`, the `draco/`/`basis/`
   glTF-loader libraries they needed) — confirmed zero code references before deleting;
   `public/` dropped from ~56MB to ~18MB, `dist/` from ~38MB to ~20MB. `CREDITS.md` updated to
   match (their real licensing, where documented, preserved in git history).
4. **Doc-accuracy fixes**: the "20 NPCs" miscount (real count: 22, 11 buildings x 2) corrected in
   `npcDialogue.ts`/`housing.ts`/`ExteriorScene.ts`'s own comments; `checkCivicConcern`'s
   inaccurate "Pure:" doc comment fixed (it does a real, intentional, idempotent
   `clearConcern()` write — behavior unaffected, just a misleading label).

Verified by 2 new test files (`components/achievements.test.ts`), new cases in
`LibraryOverlay.test.tsx`/`SoumayaChatOverlay.test.tsx`/`regionLayout.test.ts`, and the full gate
(1066 server + 494 web tests, typecheck, build) — build output confirmed to no longer include
any of the removed assets. Not yet seen rendered in a real browser from this sandbox.

## Stage 2.44 — Deep audit Wave 2 cont'd: creature render-churn perf fix; depth-ordering resolved

Closes out the last two Wave 1 findings from the same 2026-09-15 audit
(`docs/overworld/gameplay-uiux-audit-2026-09-15.md`):

1. **Creature render churn (perf).** `renderCreatures` used to unconditionally destroy and
   recreate every visible creature's Phaser objects (sprite, idle-bob tween, up to 3 text
   markers) on every single `refresh()` call — after every greet/capture — even for creatures
   whose visuals hadn't changed at all. New `creatureVisualsChanged()` compares only the 4 real
   fields `paintCreature` actually reads (`type`/`isDue`/`dueForRecall`/`rarity.badge`) and skips
   the repaint when none changed, leaving the already-running tween/roam state alone. Measured,
   not assumed: a real reproduction script simulating 850 creatures across 20 refresh cycles (one
   creature's `isDue` flipping per cycle — the realistic "one greet resets one creature" case)
   showed the old behavior repainting 17,000 times total vs. the new behavior's 7 — a 99.96%
   reduction in Phaser object churn for the common case.

2. **Creature/NPC depth-ordering vs. placed buildings.** The audit flagged that creatures and
   placed homes/businesses shared depth 1 with an insertion-order tie-break instead of a real
   y-sort, so a creature trapped under a building could render invisible-but-still-greetable.
   Turns out this was only ever a real bug IN COMBINATION with the occupancy bug Stage 2.42
   already fixed (task #92 — creature placement, roaming, AND NPC pathfinding are now all blind
   to placed structures no longer, so none of them can ever actually occupy the same tile as a
   building). With that root cause fixed, two sprites can no longer be co-located there, so the
   depth tie-break has nothing to resolve for this case — closed without a broader y-sort
   rewrite, which stays a real but lower-priority nice-to-have (tracked as a general depth-
   ordering polish item, not a bug) for the player's own depth relative to other moving sprites.

Verified by the measurement above + the full gate (1066 server + 494 web tests, typecheck,
build). No dedicated `ExteriorScene.ts` test exists for the render-churn fix (this file's
established convention — verified by direct reproduction/measurement instead, per CLAUDE.md's
own "verify before you build" standard). Not yet seen rendered in a real browser from this
sandbox.

This closes Wave 1 (8 correctness bugs) and Wave 2 (dead achievements, meeting-slot undercount,
asset/doc cleanup, render-churn perf, depth-ordering) of the 2026-09-15 audit in full. Wave 3
(passive income from built structures, onboarding/tutorial, a real demolish/remove mechanic,
giving sidewalk/transit zones real function, population growth) remains tracked, each needing
its own spec per Rule #1 before code — see the audit doc's own "Structural gaps vs. the genre"
section.

## Stage 2.45 — Wave 3: economy depth (passive income, zone function, demolish, onboarding)

Direct answer to "Do wave 3 and continue to go deeper" — closes 4 of the 5 structural gaps
tracked at the end of Stage 2.44, per a new spec (`docs/overworld/wave3-economy-depth.md`, Rule
#1) that resolves each decision directly with its own reasoning:

1. **Passive income from built structures (task #99/#103).** Every placed home/business (never
   decor — a garden bed doesn't earn) now accrues real Town Treasury income continuously: 10% of
   its own real purchase price per real day elapsed, capped at 3 days' worth per collection so
   AFK-farming can't dominate the economy. Read-time-computed from a real `lastCollectedAt`
   timestamp (`data/passiveIncome.ts`) — the exact same wall-clock convention
   `buildingNeglect.ts`/`isUnderConstruction` already use, collected automatically on every
   `loadWorldSnapshot()`, no new button. Credited through a new `creditPassiveIncome()` in
   `townLedger.ts` that deliberately never touches `hoursWorked`/never calls `markWorked` — a
   passive rent tick must never look like a real player interaction to the neglect system, or
   neglect stops meaning anything. A structure still under construction earns nothing.
2. **Sidewalk/transit real function (task #101/#104).** Both were paintable zone labels with zero
   mechanical effect. New `isFootprintAdjacentToZone()` in `zoning.ts` (orthogonal-adjacency test,
   reused for both) makes Sidewalk a real 1.5x passive-income multiplier and Transit a real 25%
   reduction in a business's neglect accrual rate (`businessNeglect()` in `business.ts` — homes
   have no neglect concept at all, a standing asymmetry, so this bonus only ever applies to
   businesses). Both are pure upside — no existing town can be invalidated by this shipping.
3. **Demolish/remove mechanic (task #101/#105).** No way existed to undo a placement mistake.
   New `removePlacedItem()` (`townBuilder.ts`, 100% refund — decor has no dependent state),
   `demolishHome()`/`demolishBusiness()` (`housing.ts`/`business.ts`, 50% refund normally, 100%
   while still `isUnderConstruction` — functionally identical to canceling an arm before it was
   ever placed). Surfaced in the Hangar: each of the 3 catalogs (Town Building/Housing/Business)
   gained a real "Your placed [items/homes/businesses]" list with a `ConfirmButton` "Demolish"
   per row, reusing the exact two-tap confirm-then-refund pattern from the 2026-09-15 audit fix
   — not a new in-world interaction, no risk to `ExteriorScene.ts`'s interact-press chain.
   Removing a home needs no extra bookkeeping — `assignResidents()` already recomputes fresh on
   every call, so freed-up capacity is picked up automatically.
4. **Onboarding nudge for a fresh town (task #101/#106).** A single, real, dismissible tip in
   `TownHud.tsx` (already the persistent always-visible surface) — shown only when
   `workedPlaceIds(spaceId).length === 0` (the town's own real "has anything happened here yet"
   signal, not a new tracked flag): "👋 New here? Walk into any building to explore, or step into
   the tall grass to capture a thought." A real × dismiss persists per-space to localStorage so
   it never shows again once dismissed OR once the town stops being fresh, whichever comes
   first. Deliberately the smallest real fix, not an invented tutorial system.
5. **Population growth (task #101/#107) — specced, deliberately deferred.** Unlike the other 4,
   this has a real ripple footprint: `npcDialogue.ts`'s 22 hand-authored NPC profiles, every NPC
   needing a real home + job/building association with no "unaffiliated resident" concept
   anywhere in the current model, and `townHallMeetingSlots()` needing re-sizing again. The
   design shape (gated on real built housing capacity exceeding the current 22, never a timer)
   is written down, but hand-authoring vs. LLM-generating new NPCs and new buildings vs.
   denser existing ones are real decisions this session hasn't made yet — tracked as its own
   future round, spec-first per Rule #1, not forced into this one.

Verified by 4 new `townLedger.test.ts` cases, 4 new `zoning.test.ts` cases, 1 new
`business.test.ts` neglect-bonus case, 9 new `passiveIncome.test.ts` cases (including a measured
"doesn't lose sub-cent progress to frequent refreshes" case), 2 new `townBuilder.test.ts` cases,
4 new `housing.test.ts` cases, 3 new `business.test.ts` demolish cases, 5 new
`HangarOverlay.test.tsx` cases, 4 new `TownHud.test.tsx` cases, and the full gate (1066 server +
530 web tests, typecheck, build). Not yet seen rendered in a real browser from this sandbox.

## Stage 2.46 — Wave 4a: total galaxy/space language purge

Direct response to "anything being used from the galaxy version can't be referring to space in
any type of way at all" — part of the larger Wave 4 request (full backlog + deeper SimCity
mechanics + a pro design pass, tracked in `docs/overworld/wave4-full-vision.md` §A). Grepped the
full `packages/` tree; confirmed two categories: legitimate feature names that happen to share a
word with space vocabulary (`constellations` — a real, independent memory-clustering feature
predating the galaxy UI; `shared/celestial.ts` — internal math module, never rendered) stayed
untouched; genuine leftover space narrative was reworded everywhere it was found:

- **The Hangar's entire cosmetics catalog** (`hangarOptions.ts`) — every display label reskinned
  to a "traveler's kit" theme (Spaceship Hull → Traveler's Outfit, Cosmic Trail → Footprint
  Trail, Deep Space Figurine → Keepsake Charm, and all 19 individual option names). Every stored
  `value` is UNCHANGED — these are real localStorage keys a player may already have unlocked, so
  only display text changed, never an id (same principle Wave 1's re-arm fix already established
  for money: never silently cost a player their existing progress).
- **`achievements.ts`** — 10 names/descs reworded (Galaxy Reader → Well-Read, Cosmic Voyager →
  Faithful Companion, Sector Pioneer → Cartographer's Eye, Sentinel Command → Keeper of the
  Watch, and others), every `id` left untouched for the same reason.
- **`components/codex.ts`** — the single largest rewrite: the entire "Sectors/Celestial Bodies/
  Fleet/Phenomena" atlas was 100% space metaphor top to bottom. "Celestial Bodies" now reuses the
  Overworld's own already-shipped Common→Legendary rarity vocabulary (`overworld/adapter/
  rarity.ts`) instead of inventing a second, competing naming scheme — every district/body/fleet/
  phenomenon entry's lore rewritten to town language (9 district lores, 7 rarity-class lores, 3
  Fleet entries, 11 Phenomena entries, all `CODEX_CATEGORIES` titles/blurbs).
- **`npcDialogue.ts`** — ~8 hand-authored flavor lines using "galaxy"/"orbit" as a metaphor for
  "your collection of memories" reworded to "collection"/"close to you."
- **The login screen** (`LoginScreen.tsx`) — the actual first thing every user sees still said
  "Create a new private galaxy"/"Enter My Galaxy"/"Create New Galaxy" — fixed to "town."
- **The crash screen** (`ErrorBoundary.tsx`) — "[GALAXY DIAGNOSTIC ERROR]" and "Something broke
  in the galaxy" fixed to "town," since a crash screen is real, high-visibility user-facing text.
- **`api/client.ts`** — two real user-facing error messages ("Couldn't load your galaxy," "The
  galaxy response was invalid") fixed to "town."

Verified by the full gate (1066 server + 530 web tests, typecheck, build) — no test asserted on
any of the changed display strings except two `HangarOverlay.test.tsx`/`hangarOptions.test.ts`
label selectors, updated to match. Not yet seen rendered in a real browser from this sandbox.
The rest of Wave 4 (backlog completion #78/#80-83/#85, population growth, a Figma-driven "pro
design" pass on every overlay, deeper SimCity mechanics) is tracked separately per
`wave4-full-vision.md`'s own execution order — this entry closes only §A.

## Stage 2.47 — Wave 4b: Figma design system v1 foundation

Direct response to "all overlays need to be pro designed... use Figma MCP where necessary."
Built via `use_figma` following the `figma-generate-library` skill's Phase 0/1/3 workflow
(discovery → foundations → one real component), scoped to what's realistic in a single round.
File: [Soumaya Town · Design System](https://www.figma.com/design/Max8E6fAzoFZhV0sWCISMg)
(`Max8E6fAzoFZhV0sWCISMg`).

- **Color/Primitives** (15 vars) + **Color/Semantic** (16 vars, aliased/scoped/WEB code syntax)
  pulled 1:1 from `OverlayShell.tsx`'s actual live palette — nothing invented. **Spacing** (5) and
  **Radius** (3) collections.
- Text styles (Panel/Title, Panel/Body, Panel/Caption) in Atkinson Hyperlegible Mono — a real
  open-source accessibility-focused monospace font, keeping the existing monospace identity while
  being genuinely more legible, no new proprietary dependency.
- Effect style Panel/Depth — a real two-layer drop shadow replacing the current flat hard offset.
- One fully-built reference component, "Overlay Panel," demonstrating a genuine visual upgrade
  over today's flat shell: an icon badge instead of bare emoji, an accent line under the header,
  layered depth, and a documented primary/danger button pair — built entirely from the bound
  tokens above.

Deliberately not attempted this round (task #111, its own future round): a Button variant set, a
List Row component, and — the largest remaining piece — translating this system into the actual
15+ overlay React components in code. No repo code changed this round (Figma-only); the existing
gate (1066 server + 530 web tests, typecheck, build) is unaffected.

## Stage 2.48 — Wave 4c: pro-design rollout to code, starting with the shared shell

Direct continuation of Stage 2.47 — translating the Figma design system into actual code. New
`overworld/ui/theme.ts` is the code side of that Figma file: every value in it is named and
valued 1:1 with the Figma Color/Spacing/Radius variable collections, not a separate palette.

`OverlayShell.tsx` — the single shared component EVERY "walked into a place" overlay already
routes through — now imports from `theme.ts` and carries the same 3 real upgrades the Figma
reference component demonstrated: (1) the icon sits in a bordered badge instead of floating bare
next to the title, (2) a real accent line under the header, (3) a genuine two-layer depth shadow
(`panelShadow`) replacing the old single flat hard offset. Because every overlay already renders
through this one shell (the same precedent Stage 2.14's original redesign used), this single
change visually lifts all 15+ overlays at once rather than needing a per-overlay pass.

**Deliberately not attempted this round**: the handful of overlays with bespoke layout beyond
the shell itself (Hangar's multi-section catalog list rows, Observatory's dashboard, Mayor's
Hall's data tables) still use their own ad hoc inline colors rather than `theme.ts` tokens —
tracked as the remaining piece of task #111, its own follow-up pass. A Button variant set and
List Row component (also deferred from Stage 2.47) would make that follow-up mechanical rather
than another hand-rolled pass per overlay.

Verified by the existing `OverlayShell.test.tsx` suite (9 cases, all passing unmodified — this
was a visual/token change, not a behavior change) and the full gate (1066 server + 530 web
tests, typecheck, build). Not yet seen rendered in a real browser from this sandbox.

## Stage 2.49 — Wave 4d: theme rollout finished — every overlay, task #111 closed

Direct continuation of Stage 2.48, closing the "handful of overlays with bespoke layout" gap
that stage deliberately deferred. Grepped every file in `overworld/ui/` for hardcoded hex colors
before touching anything: found the exact same `"1px solid #2a2c55"` list-row divider,
independently hand-typed 24+ times across 14 different overlay files (Library, BulletinBoard,
Business, Hangar, CreatureSummary, Bank, TownHall, Park, Market, Observatory, MayorsHall, Gym,
Sanctuary, PostOffice) — a real, single, systemic pattern, not incidental duplication. Added one
new `color.divider` token to `theme.ts` documenting exactly that finding, then replaced every
occurrence with the shared token across all 14 files (plus each file's now-needed `theme.ts`
import). Also fixed the handful of one-off hardcoded values that weren't the divider pattern:
`CaptureMenu.tsx`'s "submitting" text color, `CreatureSummaryOverlay.tsx`'s footer background/
text/border, and `SoumayaChatOverlay.tsx`'s citation-chip border — each matched to its correct
existing semantic token (confirmed by comparing hex values directly, not guessed). `TownHud.tsx`
and `TouchControls.tsx` were deliberately left untouched — they're HUD chrome layered over the
game world, not "walked into a place" panels, so they're out of scope for this design system by
definition, not an oversight.

A mechanical batch-edit script (insert-import + sed replace across 16 files) initially broke 3
files (`HangarOverlay.tsx`, `BusinessOverlay.tsx`, `SanctuaryOverlay.tsx`) by inserting the new
import line in the middle of a pre-existing multi-line `import { ... } from "...";` statement —
caught immediately by the next `npm run typecheck` (not shipped, not silently wrong), then fixed
by hand per file. This closes task #111 in full — every overlay in the Overworld now renders
through the same real design-token system, none left on ad hoc inline colors.

Verified by the full gate (1066 server + 530 web tests, typecheck, build) — a fresh `grep` for
hardcoded hex colors in `overworld/ui/` after the fix confirms only `theme.ts` itself (the
source of truth) and the two deliberately-out-of-scope HUD files remain. Not yet seen rendered
in a real browser from this sandbox.

## Stage 2.50 — Backlog #78: distinct art for business types

Direct answer to backlog #78 (wave4-full-vision.md §C.1). Every business type (Bakery/Tailor/
Bookshop) previously shared the exact same ARCHED_HALL illustration Market/Library/Sanctuary
already use — the most confusing overlap flagged in the original audit. Sourced 3 more real CC0
illustrations from the same trusted aggregator (`github.com/Tiddybub/2d-assets`) already used
for the 5 existing building sprites: OpenGameArt "Inn," "Tavern," and "Warehouse," all confirmed
CC0 via each pack's own `SOURCE.md` before use. Investigated first, not guessed: browsed the
full aggregator's `fantasy/` category for building-shaped packs, visually compared several
candidates (a fisherman's stilt house, a hunter's tent, a village scene, a townhall) against the
existing painterly stone/wood style, and rejected the ones that were either a different art
style or too specifically themed to read as a generic building — only kept the 3 that were a
real, checked visual match.

`buildingSprites.ts`'s `businessBuildingSprite()` now takes the business's real `typeId` and
returns a distinct illustration per type (Bakery→Inn, Tailor→Tavern, Bookshop→Warehouse),
falling back to the original ARCHED_HALL for an unknown type. `ExteriorScene.ts`'s
`paintPlacedBusiness()` passes the real `business.typeId` through; `HangarOverlay.tsx`'s catalog
preview does the same per row instead of one shared module-level constant. Housing's 4 types
still share one illustration — no equally good additional CC0 home-style candidate was found in
this pass (a genuinely honest partial result, not force-fit), left for a future pass; the
type-glyph badge remains the distinguishing cue there, unchanged.

Verified by 3 new `buildingSprites.test.ts` cases (all 3 types return distinct keys, fall back
correctly, all preloaded) and 1 updated + 1 new `HangarOverlay.test.tsx` case, plus the full gate
(1066 server + 534 web tests, typecheck, build) — build output confirmed to include all 3 new
assets in `dist/overworld/buildings/`. Not yet seen rendered in a real browser from this sandbox.

## Stage 2.51 — Backlog #80: literal walk-in building interiors

Direct answer to backlog #80 (`docs/overworld/walk-in-interiors.md`, task #113). Every door-
building interaction was previously instantaneous — the real feature overlay (Bank UI, Library
UI, etc.) popped up the same frame the player's tile matched a door, with no visual sense of
having gone anywhere. Investigated first: confirmed there's no existing multi-`Phaser.Scene`
convention in this codebase to mirror (`OverworldRoot.tsx` registers exactly one scene) — the
real, already-shipped "you went somewhere and come back to exactly where you left" convention is
`returnToDoor()`'s door-tile teleport, so the new mechanic builds on that instead of introducing
a second Scene's worth of fragile lifecycle/input/camera wiring for a purely cosmetic feature.

Shipped: a single reusable interior "room" (`data/interiorRoom.ts`, pure/testable — two plain
`Phaser.GameObjects.Rectangle`s + one glyph `Text`, colors pulled from the shared UI `theme.ts` so
the two systems don't drift, deliberately no new art this round per `wave4-full-vision.md` §C.1's
own "glyph over invented art" escape hatch) drawn once at scene creation in reserved off-map tile
space, permanently included in the camera's world bounds but never reachable by normal movement
(`tryMove`'s bounds check is untouched). Touching a door tile now tweens the player into that room,
updates its glyph to the entered building's own existing icon (`workIconForPlace`/
`businessGlyphFor` — no new icon table), dwells briefly (`INTERIOR_ENTER_DWELL_MS` = 260ms, 0 under
`prefersReducedMotion()`, matching this file's own motion-gate convention), then opens the overlay
automatically — same trigger as before, just delayed. Leaving mirrors it: the overlay closing now
dwells briefly still standing in the room (`INTERIOR_EXIT_DWELL_MS` = 200ms) before the real
exterior teleport. A new `interiorTransitionLock` (separate from the existing React-owned `paused`
flag, to avoid a real race — `OverworldRoot.tsx` unpauses the instant its overlay-closed state
commits, which would otherwise outrun the exit dwell) gates input for both windows. Only the two
real door-triggering `afterStep()` branches (door-buildings, player-built businesses) route through
it — standalone objects (Soumaya, the Bulletin Board) are unaffected, matching the literal
"building interaction" scope of the original ask.

Measured, not assumed: a real reproduction script against the actual generated region layout
confirmed the reserved room (`{x:52,y:0}`, 5x4 tiles) sits fully past the real town's east edge
(`REGION_WIDTH=46`), with the extended camera bounds (`{width:57,height:31}`) covering both. An
earlier version had the room managing idle-bob tweens itself; simplified after review to rely on
the existing move-handler's own bracket (idle bob only ever animates `scaleY`, never the x/y this
transition tweens, so there was no real conflict — the extra bracket was just unnecessary state).

Verified by 5 new `interiorRoom.test.ts` cases (no overlap with the real town at any
`REGION_WIDTH`/`REGION_HEIGHT`, entry tile inside the room's own footprint, deterministic) + the
real-data reproduction above + the full gate (1066 server + 539 web tests, typecheck, build). Per
this file's own established convention (see the NPC Autonomy/outings entries above),
`ExteriorScene.ts`'s Phaser-integration code itself has no dedicated test — not yet seen rendered
in a real browser from this sandbox.

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
