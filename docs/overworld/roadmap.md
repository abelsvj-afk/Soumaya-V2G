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
