# Overworld — Architecture (Phase 5)

> Grounded in a direct survey of the current codebase (not assumed). Scoped to Stage 1 (the
> vertical slice); later stages extend this without changing its shape.

## System overview

The overworld is a new source tree, `packages/web/src/overworld/`, added alongside the existing
`graph/` (3D galaxy) code (D1/D6 in [decisions.md](./decisions.md)). It is a **pure consumer** of
the existing `packages/server` API via the existing `packages/web/src/api/client.ts` — no new
routes, no new shared types, for Stage 1 (confirmed possible per D8/D9: the entropy/tend loop and
the Money/`sky` data already exist exactly in the shape needed).

```
packages/web/src/
  api/            ← unchanged, reused as-is (getGraph, tendNode, ingestText, finance.*, journeys.*, ...)
  graph/          ← unchanged for now (3D galaxy; deleted in a later, separate stage per D1)
  overworld/      ← NEW
    engine/       Phaser game instance bootstrap, scene manager, input (keyboard + touch D-pad/AB)
    adapter/      GraphData/MoneyStar/Journey → world-entity mappers (pure functions, unit-tested)
    scenes/       ExteriorScene (Money region, Stage 1), BankInteriorScene, (later: more regions)
    entities/     Player, Creature (memory), NPC, DoorWarp — data + sprite-key definitions
    ui/           DialogueBox, CaptureMenu, D-pad/AB touch controls (React overlay OR Phaser DOM
                  layer — decided in favor of a thin React overlay so it can reuse existing
                  dialogue/box styling conventions; Phaser owns only the tile-grid canvas)
    OverworldRoot.tsx   ← the single component App.tsx mounts (D1 staging: conditionally, next to
                          Graph3D+RightDock, until Stage-1 parity is proven)
  App.tsx         ← minimally touched: adds the OverworldRoot mount point behind a flag for the
                    additive phase; nothing about auth/space flow changes
```

## The adapter layer (the seam that keeps the backend "never knowing it's feeding a Pokémon
client")

Pure, unit-testable functions, each taking real API response shapes and returning plain world-
entity data (no Phaser objects inside — Phaser scenes consume the output, they don't produce it):

- `nodeToCreature(node: GraphNode): CreatureEntity` — `classify(node.mass)` → rarity tier (D7's
  7-tier table), `node.entropy` → dim/vivid render state + `isDue = entropy > COOLING_ENTROPY`,
  `node.celestialTitle ?? node.label` → display name, `node.kind`/`type` → sprite-key lookup
  table (with a defined fallback sprite for any unmapped type, per "tolerate unsorted gracefully").
- `moneyStarToBankObject(star: MoneyStar): BankLedgerRow` — direct field mapping
  (`state` → icon+label per D9's non-color rule), no reinterpretation of the finance math.
- `journeyToRegionMeta(journey: Journey): RegionTheme` — `color`/`icon` → palette seed (Stage 1
  only needs this for the single Money region's theming; multi-region theming is Stage 2+).
- Placement: Stage 1 lays out creature spawn points **deterministically from stable node ids**
  (a seeded pseudo-random grid placement, same id → same tile every session) rather than a hand-
  authored per-node layout — this is what "the world must tolerate unsorted gracefully" requires
  in practice: a node with no Journey still gets a valid, stable spot (in Stage 1, an "uncharted"
  strip at the region's edge; the brief's own suggested treatment).

## Data flow for the two Stage-1 loops

**Capture**: tall-grass tile trigger → `CaptureMenu` (React overlay) → existing `ingestText()` →
on success, refetch graph (existing `getGraph()`), adapter turns the new node into a
`CreatureEntity`, scene spawns it with a reveal animation → dialogue box shows name/type/rarity.

**Greet/revisit**: scene tick reads each visible creature's `entropy` (already present on the
`GraphNode` from the last `getGraph()` response — no per-frame API calls) → render dim state per
FR10 → on interact, call existing `tendNode(id)` → on success, refetch graph (or optimistically
mark that node "tended" pending confirmation, then reconcile on next refresh — decided: **optimistic
UI with reconciliation**, matching the existing app's pattern of optimistic UI elsewhere, e.g.
Fuel/streak polling) → creature visibly brightens.

## Engine & rendering

- **Phaser 3** (D5), single `Phaser.Game` instance owned by `OverworldRoot.tsx`, mounted into a
  canvas `<div>` sized to its container (mobile-first responsive, matches the artifact/web
  responsive rules already in house style).
- **Tilemaps**: Stage 1 hand-authors the Bank interior and a small fixed exterior template as
  plain JSON (Phaser's Tiled-JSON tilemap format, authored by hand or a tiny script — no Tiled
  binary dependency required for a map this small); creature/NPC placement is data (adapter
  output), not baked into the tilemap.
- **Collision**: a `passable: boolean` grid layer parallel to the visual tile layer (mirrors the
  GBA metatile-attribute pattern from `pokemon-reference.md`). Implemented as pure functions in
  `engine/movement.ts` (`tryMove`/`completeMove`, no Phaser import) driving a manual tile-to-tile
  tween — not Phaser's arcade-physics tilemap collider, since grid movement has no physics body to
  collide and keeping the rule Phaser-free is what makes it directly unit-testable (see
  `engine/movement.test.ts`) without a browser/WebGL context.
- **Camera**: Phaser `Camera.startFollow(player)`, grid-snapped movement (tween one tile per
  input, ignore input mid-tween) so there's no analog drift to fight with `prefers-reduced-motion`.
- **Sprites**: 16×16 or 32×32, ≤4 colors per sprite as an aesthetic target (not a hard technical
  constraint the way it was on real GBA hardware) — placeholder/programmer-art sprites are
  acceptable for Stage 1 (asset production is explicitly out of scope for this design package;
  see `ASSETS_NEEDED.md` convention already used elsewhere in the repo).

## Touch controls

A React-rendered overlay (`ui/TouchControls.tsx`) — D-pad (4-way) + A/B buttons — dispatches the
same input events the keyboard handler does into the Phaser scene via a small typed event bus
(`overworld/engine/input.ts`), so scenes never care which input source fired. Shown only when
`pointer: coarse`/no keyboard detected, consistent with the existing mobile-first posture of the
rest of the app.

## Accessibility hooks (built in, not retrofitted)

- A single `useReducedMotion()`-style check (mirrors whatever convention the galaxy code already
  uses, if any — confirmed during implementation) gates: camera pan smoothing (instant cut
  instead), idle-sprite bob/breathing animation (frozen single frame instead), any screen-shake
  (never implemented at all, brief non-negotiable).
- Every rarity tier and every urgency state ships with a paired non-color marker from the first
  commit (D7, FR7) — verified in the component/unit tests, not left to visual QA alone.

## Test plan (per the "verify before you build" house rule)

Given this sandbox cannot reliably eyeball a running Phaser canvas, verification leans on
reproduction/measurement, matching how `orbits.ts`/`celestial.ts` changes are already verified in
this repo:

1. **Adapter unit tests** (`overworld/adapter/*.test.ts`, vitest): feed real-shaped
   `GraphNode`/`MoneyStar`/`Journey` fixtures (including edge cases — `entropy` undefined,
   `mass` undefined, a node with no Journey) through each mapper and assert the exact output
   (rarity tier, dim-state boolean, sprite-key fallback for unknown `type`).
2. **Placement determinism test**: same fixture graph → same spawn-tile assignment across two
   runs (a stable-id seeded placement is a correctness requirement, not just a nicety — a
   creature that teleports to a new tile every refresh would break "walk up and greet").
3. **Dim-state threshold test**: `npx tsx` (or a vitest unit) feeding a range of synthetic
   `entropy` values through the render-state mapper and asserting the crossover exactly at
   `COOLING_ENTROPY` — the same "measure it, don't assume it" method already used for the
   galaxy's own entropy-driven visuals.
4. **Collision/movement test**: a small scripted scene test (no browser needed — Phaser's
   headless/logic layer, or a plain unit test against the passability-grid + tween-lock logic
   extracted as pure functions) asserting the player cannot move onto an impassable tile and a
   move is ignored mid-tween.
5. **Gate**: `npm run typecheck && npm test && npm run build -w @brain/web` green, per house rule,
   before any commit.
6. **Manual/on-device visual confirmation** is explicitly deferred (same caveat already logged
   throughout `CLAUDE.md`'s Pending Validation section for the galaxy) — flagged in the roadmap as
   a "needs on-device confirmation once deploy is possible" item, not silently assumed to look
   right.

## Open questions (none block Stage 1; flagged for Stage 2+)

- Whether `reviewStrength`/SM-2 review ever becomes a second in-world loop (e.g. a Sanctuary
  quiz-adjacent mechanic) — explicitly deferred, not part of the greet mechanic (D8).
- Exact tile size (16 vs 32) and target device pixel density — a Stage-1 implementation detail to
  settle against real placeholder art, not an architectural fork.
- Whether the region exterior layout is hand-authored-per-Journey or algorithmically generated
  from graph shape at scale (Stage 1 uses one fixed hand-authored template; revisit once more than
  one region exists).
