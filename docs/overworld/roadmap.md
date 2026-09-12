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
