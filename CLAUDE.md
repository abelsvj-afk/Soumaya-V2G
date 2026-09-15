# CLAUDE.md

**MANDATORY — development process.** All substantive work follows the full
[`docs/AI_ENGINEERING_WORKFLOW.md`](./docs/AI_ENGINEERING_WORKFLOW.md) lifecycle —
**Rule #1: no code is written until the design/spec is complete.** ([`WORKFLOW.md`](./WORKFLOW.md)
is the lighter day-to-day loop derived from it.) This is standing policy; it does not need to be
re-stated each session.

**MANDATORY — post-MVP workflow.** [`docs/AI_ENGINEERING_WORKFLOW_POST_MVP.md`](./docs/AI_ENGINEERING_WORKFLOW_POST_MVP.md)
governs all work **once the current tools/functions build-out is complete** (Soumaya's tool-router
fleet + the neuro-aligned features). At that cutover it becomes the operating workflow: MVP Freeze →
repository/bug/quality/debt/dependency audits → architecture/refactor/security/testing/performance/
observability → AI validation (memory, prompts, retrieval, hallucination, cost) → product readiness
(UX, a11y, docs sync, beta, deployment, rollback, monitoring). Until the cutover, keep shipping under
the lighter loop above; do not prematurely freeze features.

**STATUS (2026-07-10): first post-MVP hardening cycle COMPLETE; freeze LIFTED.** All the phases above
ran once and shipped (see `docs/POST_MVP_AUDIT.md`, `POST_MVP_PHASE4/5/9/12*.md`). We are back in
**feature-growth mode** under the lighter loop, steered by the north-star docs below. Re-freeze and
re-run the post-MVP phases before the *next* major expansion — not per feature. Part 6 (Continuous
Ops: repo-health/KPIs/governance) is the standing rhythm going forward.

**MANDATORY — product north star.** We are building Soumaya toward the patterns in
[`docs/SECOND_BRAIN_BRIEFING.md`](./docs/SECOND_BRAIN_BRIEFING.md) (Obsidian "second brain"
adaptation; the research calls us "Sarmiah" — same product). The live gap analysis + staged growth
plan is [`docs/SECOND_BRAIN_ALIGNMENT.md`](./docs/SECOND_BRAIN_ALIGNMENT.md) — consult it when
planning new feature growth. The neuroscience cross-reference (what to build vs. skip, evidence-
graded) is [`docs/NEURO_ALIGNMENT.md`](./docs/NEURO_ALIGNMENT.md). **Core principle from it:
memory is made by *retrieval*, not storage** — the galaxy is the memory palace, but a spaced-
repetition + gentle active-recall layer (dimming stars = review cue; Soumaya nudges recall in her
own voice, never Anki decks) is the highest-leverage growth direction and a first-class staged feature.

**MANDATORY — Vision 2.0 (Journeys).** [`docs/VISION_2_JOURNEYS.md`](./docs/VISION_2_JOURNEYS.md) is the
user-authored, version-controlled **source of truth** for Soumaya's next era: everything ultimately
belongs to a **Journey** (a meaningful life chapter), Soumaya asks *"what Journey does this help?"*
instead of "where do I save this?", the daily loop lands in **Mission Control**, the galaxy is a
**Living Galaxy** that reflects life in motion, and money/tasks/memories/people all connect through
Journeys. **Consider every new feature against this doc — where it can serve a Journey, it should.**
Large pieces get their own spec first (per the workflow), but this governs *what* we build toward.

**MANDATORY — read before proposing new feature growth.** [`HONEST_ASSESSMENT.md`](./HONEST_ASSESSMENT.md)
is a dated, honest outside read on whether this product is actually worth using long-term (not a
status log — a frozen verdict, re-run periodically, entries appended not overwritten).
[`docs/OPTIMIZATION_ROADMAP.md`](./docs/OPTIMIZATION_ROADMAP.md) is the non-destructive fix plan for
what it found — **no tab removal, no rebuild; fix/consolidate/surface what's already built.** Weigh
any new feature idea against closing the roadmap's open problems before adding more surface area.

**MANDATORY**: Refer to [GEMINI_CHANGES.md](./GEMINI_CHANGES.md) for all modifications, asset additions, and infrastructure changes made by the second agent (Antigravity CLI / `agy`), to ensure continuity between agents. The second agent's own mandates + green/red zones live in [AGENTS.md](./AGENTS.md) (the file `agy` auto-loads).

Guidance for working in this repo. Read this before making changes.

## What this is

**Soumaya · Second Brain** — a personal knowledge graph you talk to. You dump raw
thoughts; the system extracts typed nodes + relationships, embeds them, and links
them associatively. **As of 2026-09-11 the presentation layer is the Soumaya
Overworld** — a 2D, GBA/SNES-era Pokémon-style top-down town where each memory is
a creature you walk up to, buildings are the former feature tabs, and a dimmed
creature is the retrieval-cue signal. The 3D galaxy this replaced (`react-force-
graph-3d`/three.js, kinematic orbits, `RightDock`'s panel tabs) has been **deleted
from the codebase** — see `docs/overworld/` for the full design package and
`docs/overworld/roadmap.md` for what shipped when. The domain model
(`packages/shared`, `packages/server`) is unchanged; only how it's presented.

Signature features: **associative auto-linking**, **synthesis digest** (surfaces
latent connections), **chat-with-your-brain** (GraphRAG with cited answers), and
the **Overworld UI**.

## Monorepo layout (npm workspaces)

- `packages/shared` — domain types + zod schemas + celestial mechanics (still the
  math backing creature rarity/dimming, even though nothing renders a literal
  galaxy anymore). The single source of truth shared by server and web. Changes
  here ripple both ways.
- `packages/server` — Express API, SQLite + sqlite-vec, ingestion pipeline, LLM
  providers, graph/synthesis/chat services. Runs TypeScript directly via `tsx`.
- `packages/web` — Vite + React + Phaser 3 Overworld client. Entry point is
  `main.tsx` → `overworld/AuthGate.tsx` (login) → `overworld/OverworldRoot.tsx`
  (the Phaser game + all in-world React overlays, lazy-loaded so Phaser stays out
  of the login screen's bundle).

## Commands

```bash
npm test            # all vitest suites (server). Keep green.
npm run typecheck   # tsc --noEmit across workspaces. Keep clean.
npm run build       # builds the web app
npm run dev         # local dev (server + web)
```

Always run `npm test` and `npm run typecheck` before committing. The web app must
`npm run build -w @brain/web` cleanly.

## Architecture conventions

- **Provider seams.** Embeddings (`embeddings/adapter.ts`) and LLM
  (`llm/adapter.ts`) are interfaces with swappable implementations. There is
  always a no-API-key fallback: `hash` embeddings and the `heuristic` LLM, so the
  app is fully functional offline. Never make a feature hard-depend on a cloud key.
- **Repositories** (`repositories/*.repo.ts`) own all SQL for an entity. Services
  compose repos; routes are thin and only validate + delegate.
- **Vectors** live in the `vec_nodes` vec0 table (`db/vec.ts`), joined on node id.
  Relational schema is in `db/schema.ts`; raw bootstrap + additive migrations are
  in `db/client.ts` (`migrateSchema` — use it for new columns so existing Fly
  volumes upgrade in place).
- **zod schemas** in `shared/schema.ts` are reused as Gemini `responseSchema` —
  keep them flat (deep schemas are fragile with the API).

## Celestial mass model (still the rarity/dimming physics, now for creatures not orbits)

`shared/celestial.ts` is unchanged by the Overworld rewrite — it's still the single
source of truth for a memory's significance and neglect:

- Each memory has an **importance** (0..1, rated by the LLM at ingestion; the
  heuristic provider scores it from weighty vocabulary + length).
- `deriveMass({ importance, degree, emotionalWeight })` blends significance,
  connectedness, and emotional charge into a **0..1 mass**.
- `classify(mass)` → 7 tiers: `asteroid | moon | planet | gas_giant | giant | star
  | supergiant` — the Overworld maps these 1:1 to creature rarity
  (`overworld/adapter/rarity.ts`; Common → Legendary), each with a non-color badge
  shape, never a color-only cue.
- `entropyFrom(daysSinceTended, degree)` / `COOLING_ENTROPY` (0.45) is the decay
  signal — a creature with `entropy >= COOLING_ENTROPY` renders visibly dimmed
  with a non-color "?" marker (`overworld/adapter/nodeToCreature.ts`); greeting it
  (`POST /nodes/:id/tend`) resets it. This is the app's single most important loop.
- The **graph service enriches nodes on read** with `degree`, `mass`, `val`,
  `celestial`, and `entropy` — never denormalize these into the table.
- There is no orbit/kinematic system anymore (`graph/orbits.ts` was deleted with
  the galaxy). Creature placement is a deterministic seeded grid layout
  (`overworld/adapter/placement.ts`) — same node id always lands on the same tile.

When adding signals that should affect gravity, fold them into `deriveMass` so
both the mass math and the Overworld's rarity/dimming rendering stay consistent.

## Multi-tenancy (private brains)

One deployment hosts many private "spaces" (brains). Every per-user table
(`nodes`, `edges`, `insights`, `agent_logs`, `daily_logs`) carries a `space_id`;
`settings` stays global (the shared deployment API budget). Auth is a lightweight
name + passcode (`auth/spaces.ts`, scrypt-hashed) — the returned random space id
is the client's bearer key, stored in localStorage and sent as the `x-space-id`
header. `requireSpace` (api/middleware.ts) validates it and stashes it on
`res.locals`; routes read it via `spaceOf(res)` and pass it to **space-scoped
repositories** (`new NodesRepo(handle, spaceId)`) and helpers — every repo/service
takes a `spaceId` defaulting to `DEFAULT_SPACE` ("legacy") so internal/test callers
still work. `knn(..., spaceId)` over-fetches then filters by space so vector search
never crosses brains. Pre-existing data lives under `legacy` and is claimed by the
**first** account to register. When adding a data table or query, scope it by
`space_id` the same way.

## Guardrails / middleware (server)

- `api/middleware.ts`: `securityHeaders` (nosniff / DENY framing / no-referrer)
  and a dependency-free in-memory `rateLimit` on `/api` (`RATE_LIMIT_MAX`, default
  120/min). `trust proxy` is set for correct client IPs behind Fly.
- `express.json({ limit: "1mb" })` caps body size.
- Every route validates its body with zod and returns 400 on bad input.
- Central error handler in `api/server.ts` catches async rejections (Express 5).
- Keep new routes to this pattern: validate → delegate to a service → json.

## Deployment

Single container (Fly.io): `Dockerfile` builds the web app, bakes the MiniLM
embedding model into the image, and the Express server serves both the API and the
static web (`WEB_DIR`). SQLite persists on a Fly volume at `/data`.

**How deploys actually happen (verified 2026-06-20):** GitHub Actions is **blocked on
this account** — runs `startup_failure` with 0 jobs (private-repo Actions minutes/
runner unavailable), so `.github/workflows/fly-deploy.yml` never ships anything. The
working path is a **manual `fly deploy --remote-only`** (run by `agy` from Termux, who
has the `FLY_API_TOKEN`; this sandbox has no flyctl/Fly network). The durable fix is to
reconnect **Fly's native GitHub auto-deploy** (Fly dashboard → app → GitHub), which
builds the Dockerfile on push without Actions. Either way: pushing alone does NOT deploy
right now — trigger a `fly deploy` (delegate to `agy`) after pushing branch changes you
want live. Migrations must be additive + idempotent so a deploy can never crash boot on
the existing volume (`migrateSchema`; covered by `migration.test.ts`).

LLM is optional — without a key the app runs in heuristic mode. To use a key:
`fly secrets set LLM_PROVIDER=gemini GEMINI_API_KEY=...` or
`fly secrets set LLM_PROVIDER=openai OPENAI_API_KEY=...` (defaults to the cheap
`gpt-4o-mini`; override with `OPENAI_MODEL`). Cloud providers degrade to the
heuristic automatically on credit/quota errors (see ResilientLlmProvider).

## Agent delegation (Claude ⇄ Antigravity CLI) — spend Claude's tokens wisely

There are two coding agents on this repo and **both have GitHub access**. Claude is the
architect/lead and the only one who signs off "Verified". The second agent is
**Antigravity CLI (`agy`)** — a Go-based, headless, low-memory terminal agent (runs well
on the user's **Termux/mobile** setup) with **async parallel subagents**, a **built-in
browser subagent** (headless Chrome over MCP) for real visual QA, research/doc-conversion
slash commands, and an **MCP bridge built to let Claude delegate heavy work to it** (with
model routing + session continuity + output truncation, so it does NOT eat Claude's
context). Its full rules are in [AGENTS.md](./AGENTS.md) (the file `agy` auto-loads).

**Core principle: don't burn Claude's tokens/context on anything that is green-zone for
`agy`.** If a task is mechanical, parallelizable, evidence-gathering, or file-dump-heavy,
delegate it and consume only the conclusion.

**Delegate to `agy` (default to this):**
- Bulk/mechanical, well-specified edits — rename a thing everywhere, apply one pattern
  across many `components/*` or `overworld/ui/*` overlay files, batch asset/CSS work.
- **Browser-based visual QA** — load the app, walk the Overworld town, screenshot, record
  a `.webm` walkthrough, run a UX/design review. ⚠️ **NOT available on the user's Termux
  (android-arm64 has no compatible headless Chrome — confirmed 2026-06-21, issue #10).** From
  this hosted sandbox you also can't reach the live site. So live pixel verification falls to the
  USER (or a desktop browser); for everything else, verify behavior by headless
  reproduction/measurement (see "Verify before you build"), not by eyeballing.
- **Research & doc ingestion** — web research with citations; URL/PDF/docx/image → Markdown.
- **Broad codebase exploration** that would otherwise dump many files into Claude's context.
- Long-running **gate/build** runs and routine git ops, especially from mobile.

**How to delegate:** (a) the **MCP bridge** — call `agy` as an MCP server (preferred; it
truncates output to protect Claude's context); or (b) **GitHub** — write a crisp,
self-contained issue/PR task and let `agy` pick it up, push to the deploy branch, and
report back. Always give it a tight spec + the gate + "stage, don't push, if you hit the
Red Zone."

**MCP bridge config:** the `agy-bridge` server is committed at repo root in
[`.mcp.json`](./.mcp.json) (runs `npx -y agy-bridge`), so any Claude Code session in this
repo can delegate to `agy`. It only works where `agy` itself is installed + authenticated
(e.g. the user's Termux/laptop) — in a stripped remote sandbox the bridge is inert, so fall
back to the GitHub hand-off there. Approve the server once when Claude Code prompts to trust
project MCP servers.

**Keep for Claude (do NOT delegate):** Red-Zone work — `packages/shared/*` types/zod,
`db/*` schema + migrations, `overworld/engine/*` and `overworld/adapter/placement.ts`
(the grid-movement/placement math — the Overworld's equivalent of what `orbits.ts` was),
`web/src/api/client.ts`, the token/USD/Fuel guards, `space_id` multi-tenancy scoping, route
contracts — plus architecture decisions,
ambiguous/underspecified features, security/data-integrity, and the **final audit +
"Verified by Claude" checkmark**. Review `agy`'s pushes before ticking that box.

Both agents share the **same gate**, the **same deploy branch**
(`claude/soumaya-second-brain-v1-m4z4hc`), and the **same change log** (`GEMINI_CHANGES.md`).

## Verify before you build (and before you claim it works)

The gate (`typecheck && test && build`) proves code *compiles*, not that it *behaves*. Two
standards, learned the hard way (shipping "the code should spread the bodies" fixes that didn't):

1. **Prove behavior by reproduction/measurement, not assertion.** Before changing logic — especially
   visual/spatial/numeric code you can't see rendered from here (`overworld/engine/movement.ts`,
   `overworld/adapter/placement.ts`, `shared/celestial.ts`, layout/mass math) — first *reproduce and
   measure* it: `npx tsx` a throwaway script or a unit test that feeds real or synthetic data through
   the actual functions and prints/asserts the numbers (e.g. `placeIdsOnGrid` over a real node-id list,
   asserting zero collisions and same-id-same-tile determinism — see `overworld/adapter/placement.test.ts`
   for the pattern). Decide the fix from the measured output, not from reading the code. State the
   measurement in your summary.
2. **Rule out delivery (stale deploy / PWA service-worker / cache) before re-editing correct code.** When
   "it didn't change," first confirm the new build is what's actually rendering (Actions is blocked → a
   `fly deploy` must run; the service worker can serve old cached JS even on a fresh server). Never "fix"
   code that measurement shows is already correct to chase a deploy/cache problem.

## Pending Validation

- **Backlog #81 — the Theater + Town Gazette (2026-09-15), not yet on-device confirmed** — a
  12th door-building, added to `regionLayout.ts`'s generated layout as one spec-list entry (the
  row-generation algorithm derives its own footprint/door/`REGION_WIDTH` growth). Two new
  hand-authored attendants (Marlowe, Odalys) join the roster. "Showings" are real, never
  invented: `data/theater.ts` picks the player's own top-4 memories by celestial tier, and
  `TheaterOverlay.tsx` shows each one's real evolving lore (`getLore`/`evolveLore`), with
  evolving a showing crediting real building work. The Town Gazette folds into the existing
  Bulletin Board — a headline pulled from the same real `getDigest()` synthesis output
  Observatory already surfaces, never a fabricated "new achievement" headline. A real regression
  surfaced and was fixed at the root, not routed around: growing `REGION_WIDTH` shifted Mayor's
  Hall's centered x-position enough that its own attendant band started landing on the south
  row's wall tiles (a latent bug that only avoided detection before by X-coordinate luck) —
  `SOUTH_ROW_BOTTOM`'s clearance now derives from `ATTENDANTS_PER_BUILDING` instead of a flat
  margin, confirmed via a real reproduction script (zero collisions across all 24 attendant
  posts). Verified by 5 new `theater.test.ts` cases, 6 new `TheaterOverlay.test.tsx` cases, 3 new
  Gazette cases, the collision-fix reproduction, and the full gate (1066 server + 552 web tests,
  typecheck, build). Not yet seen rendered in a real browser.

- **Backlog #80 — literal walk-in building interiors (2026-09-15), not yet on-device
  confirmed** — every door-building interaction used to be instantaneous (touch the door tile,
  the real feature overlay pops up the same frame, no visual sense of having gone anywhere).
  Investigated first (`docs/overworld/walk-in-interiors.md`): there's no existing multi-
  `Phaser.Scene` convention to mirror (only one scene is ever registered), so rather than build a
  second Scene's worth of lifecycle/input/camera wiring this sandbox can't visually verify, the
  new mechanic builds on the real convention that already exists — `returnToDoor()`'s door-tile
  teleport. A single reusable interior room (`data/interiorRoom.ts`, two plain rectangles + one
  glyph reusing each building's own existing icon, deliberately no new art this round) sits once
  in reserved off-map tile space, permanently in the camera's world bounds but unreachable by
  normal movement. Touching a door tile now tweens the player in, dwells briefly (260ms, 0 under
  `prefers-reduced-motion`), then opens the overlay automatically — same trigger as before, just
  delayed; leaving mirrors it with a 200ms dwell before the real exterior teleport. A new
  `interiorTransitionLock` (separate from the existing React-owned pause flag, to avoid a real
  race with React's own unpause outrunning the exit dwell) gates input for both windows. Measured
  against the real generated region layout: the reserved room sits fully past the real town's
  east edge with zero overlap, at every real `REGION_WIDTH`. Verified by 5 new
  `interiorRoom.test.ts` cases + the real-layout measurement + the full gate (1066 server + 539
  web tests, typecheck, build). `ExteriorScene.ts`'s own Phaser-integration code has no dedicated
  test (this file's established convention) — not yet seen rendered in a real browser.

- **Backlog #78 — distinct art for business types (2026-09-15), not yet on-device confirmed** —
  every business type (Bakery/Tailor/Bookshop) previously shared the exact same illustration
  Market/Library/Sanctuary already use — the most confusing art overlap the original audit
  flagged. Sourced 3 more real CC0 illustrations (OpenGameArt "Inn"/"Tavern"/"Warehouse", CC0
  confirmed per-pack) from the same trusted aggregator already used for the 5 existing building
  sprites — investigated first: browsed the aggregator's `fantasy/` category, visually compared
  several candidates against the existing painterly stone/wood style, rejected ones that were a
  different art style or too specifically themed. `businessBuildingSprite()` now takes the real
  business `typeId` and returns a distinct sprite per type (Bakery→Inn, Tailor→Tavern,
  Bookshop→Warehouse), wired through `ExteriorScene.ts` and `HangarOverlay.tsx`'s catalog
  preview. Housing's 4 types still share one illustration — no equally good CC0 home-style
  candidate found this pass, an honest partial result rather than a forced fit. Verified by 3
  new `buildingSprites.test.ts` cases, 1 updated + 1 new `HangarOverlay.test.tsx` case, and the
  full gate (1066 server + 534 web tests, typecheck, build) — build output confirmed to include
  all 3 new assets. Not yet seen rendered in a real browser from this sandbox.

- **Wave 4d — theme rollout finished, every overlay, task #111 closed (2026-09-15), not yet
  on-device confirmed** — direct continuation of Wave 4c, closing the "bespoke overlays still
  hardcoded" gap that round deliberately deferred. Grepped every file in `overworld/ui/` for
  hardcoded hex colors first: found the exact same `"1px solid #2a2c55"` list-row divider,
  independently hand-typed 24+ times across 14 overlay files — a real systemic pattern. Added
  one `color.divider` token to `theme.ts` and replaced every occurrence across all 14 files
  (plus the needed `theme.ts` import in each); also fixed the handful of true one-offs
  (`CaptureMenu.tsx`, `CreatureSummaryOverlay.tsx`, `SoumayaChatOverlay.tsx`) by matching each
  hardcoded hex to its correct existing semantic token. `TownHud.tsx`/`TouchControls.tsx`
  deliberately left untouched — HUD chrome over the game world, not "walked into a place"
  panels, out of scope by definition. A mechanical batch-edit script initially broke 3 files by
  inserting the new import mid-multi-line-import-statement — caught immediately by
  `npm run typecheck` (never shipped), fixed by hand. Every overlay in the Overworld now renders
  through the same real design-token system — task #111 fully closed. Verified by the full gate
  (1066 server + 530 web tests, typecheck, build) and a fresh post-fix grep confirming only
  `theme.ts` itself and the 2 deliberately-out-of-scope HUD files still have hardcoded hex.
  Not yet seen rendered in a real browser from this sandbox.

- **Wave 4c — pro-design rollout to code, starting with the shared shell (2026-09-15), not yet
  on-device confirmed** — direct continuation of Wave 4b, translating the Figma design system
  into actual code. New `overworld/ui/theme.ts` is the code side of that Figma file — every
  value named/valued 1:1 with its Color/Spacing/Radius variable collections. `OverlayShell.tsx`
  (the single shared component EVERY "walked into a place" overlay already routes through) now
  imports from `theme.ts` and carries the 3 real upgrades the Figma reference component
  demonstrated: an icon badge instead of a bare emoji, a real accent line under the header, and
  a genuine two-layer depth shadow replacing the old flat one. Because all 15+ overlays already
  share this one shell (same precedent Stage 2.14's original redesign used), this single change
  lifts all of them at once. Deliberately not attempted this round: the handful of overlays with
  bespoke layout beyond the shell (Hangar's catalog rows, Observatory's dashboard, Mayor's
  Hall's data tables) still use ad hoc inline colors — the remaining piece of task #111, its own
  follow-up pass. Verified by the existing `OverlayShell.test.tsx` suite (9 cases, unmodified —
  a visual/token change, not a behavior change) and the full gate (1066 server + 530 web tests,
  typecheck, build). Not yet seen rendered in a real browser from this sandbox.

- **Wave 4b — Figma design system v1 foundation (2026-09-15), not a code change, not yet applied
  to any overlay** — direct response to "all overlays need to be pro designed... use Figma MCP
  where necessary." Built via `use_figma` (Figma MCP) following the `figma-generate-library`
  skill's Phase 0/1/3 workflow. File: Soumaya Town · Design System
  (`https://www.figma.com/design/Max8E6fAzoFZhV0sWCISMg`). Shipped: Color/Primitives (15 vars) +
  Color/Semantic (16 vars, aliased/scoped/WEB code syntax) pulled 1:1 from `OverlayShell.tsx`'s
  real live palette; Spacing (5) + Radius (3) collections; Panel/Title-Body-Caption text styles
  in Atkinson Hyperlegible Mono (a real open-source accessibility-focused monospace, keeping the
  existing monospace identity while being genuinely more legible); a Panel/Depth effect style (a
  real two-layer shadow replacing the current flat one); and one fully-built reference component
  ("Overlay Panel") showing a genuine visual upgrade — icon badge, header accent line, layered
  depth, a documented primary/danger button pair — built entirely from the bound tokens, nothing
  hardcoded. Deliberately not attempted this round: a Button variant set, a List Row component,
  and translating this system into the actual 15+ overlay React components in code (task #111,
  its own future round). No repo source changed this round — the existing gate is unaffected.

- **Wave 4a — total galaxy/space language purge (2026-09-15), not yet on-device confirmed** —
  direct response to "anything being used from the galaxy version can't be referring to space in
  any type of way at all," the first slice of a much larger request (full backlog completion,
  deeper SimCity mechanics with "my spin," and a pro design pass on every overlay via Figma —
  all planned in `docs/overworld/wave4-full-vision.md`, per Rule #1). Grepped the full
  `packages/` tree and confirmed two categories: legitimate feature names sharing a word with
  space vocabulary (`constellations` — a real, independent memory-clustering feature predating
  the galaxy UI; `shared/celestial.ts` — internal math, never rendered) stayed untouched; real
  leftover space narrative was reworded everywhere found. Biggest finds: the Hangar's ENTIRE
  cosmetics catalog (`hangarOptions.ts` — "Spaceship Hull," "Cosmic Trail," "Deep Space
  Figurine," and all 19 individual option names, e.g. "Fusion Core Destroyer," "Dyson
  Megastructure") was still 100% unchanged space flavor text since the galaxy deletion, as was
  `components/codex.ts`'s entire in-game atlas (Sectors/Celestial Bodies/Fleet/Phenomena — 9
  district lores, 7 rarity-class lores, 3 Fleet entries, 11 Phenomena entries, all rewritten);
  the actual LOGIN SCREEN said "Create a new private galaxy"/"Enter My Galaxy"; the crash screen
  said "[GALAXY DIAGNOSTIC ERROR]"/"Something broke in the galaxy." Every stored achievement id
  and Hangar cosmetic value is UNCHANGED (only display text/labels/descs changed) so no
  existing player's unlocked progress silently re-locks — the same principle behind the Wave 1
  re-arm money-loss fix. "Celestial Bodies" now reuses the Overworld's own already-shipped
  Common→Legendary rarity vocabulary (`overworld/adapter/rarity.ts`) instead of inventing a
  second naming scheme. Verified by the full gate (1066 server + 530 web tests, typecheck,
  build) — the only test assertions touching changed strings were two label selectors in
  `HangarOverlay.test.tsx`, updated to match. Not yet seen rendered in a real browser. The rest
  of Wave 4 (backlog #78/#80-83/#85, population growth, the Figma design system + its rollout
  to every overlay, deeper SimCity mechanics) is tracked separately, each its own future round.

- **Wave 3 — economy depth: passive income, sidewalk/transit function, demolish, onboarding
  (2026-09-15), not yet on-device confirmed** — direct response to "Do wave 3 and continue to go
  deeper," closing 4 of the 5 structural gaps tracked at the end of Wave 2 (full account +
  reasoning in `docs/overworld/wave3-economy-depth.md`, per Rule #1). (1) Every placed home/
  business now accrues real passive Town Treasury income — 10% of its own real purchase price per
  real day elapsed, capped at 3 days, read-time-computed from a real `lastCollectedAt` timestamp
  (`data/passiveIncome.ts`) on every `loadWorldSnapshot()`, credited through a new
  `creditPassiveIncome()` that deliberately never touches `hoursWorked`/never triggers a neglect
  reset — a passive rent tick must never masquerade as a real interaction. (2) Sidewalk and
  Transit zoning, previously paintable labels with zero effect, now do something real: a new
  `isFootprintAdjacentToZone()` in `zoning.ts` makes Sidewalk a 1.5x passive-income multiplier and
  Transit a 25% reduction in a business's neglect accrual (homes have no neglect concept, so this
  only ever applies to businesses). (3) A real demolish mechanic — `removePlacedItem()` (100%
  refund), `demolishHome()`/`demolishBusiness()` (50% refund, 100% while still
  `isUnderConstruction`) — surfaced in the Hangar as a "Your placed [items/homes/businesses]" list
  per catalog with a `ConfirmButton` "Demolish" per row, reusing the exact two-tap confirm pattern
  from the 2026-09-15 audit fix. (4) A single dismissible onboarding tip in `TownHud.tsx`, shown
  only on a genuinely fresh town (`workedPlaceIds(spaceId).length === 0`), persisting its
  dismissal per-space to localStorage. (5) Population growth was specced but deliberately
  deferred — a real ripple footprint (22 hand-authored NPC profiles, no "unaffiliated resident"
  concept, meeting-slot re-sizing) means hand-authoring-vs-LLM-generating new NPCs is a real
  decision this session hasn't made yet; tracked as its own future round. Verified by 4 new
  `townLedger.test.ts` cases, 4 new `zoning.test.ts` cases, 1 new `business.test.ts` neglect-bonus
  case, 9 new `passiveIncome.test.ts` cases, 2 new `townBuilder.test.ts` cases, 4 new
  `housing.test.ts` cases, 3 new `business.test.ts` demolish cases, 5 new `HangarOverlay.test.tsx`
  cases, 4 new `TownHud.test.tsx` cases, and the full gate (1066 server + 530 web tests,
  typecheck, build). Not yet seen rendered in a real browser from this sandbox.

- **Deep audit Wave 2 finished — creature render-churn perf fix, depth-ordering resolved
  (2026-09-15), not yet on-device confirmed** — closes the last two findings from the same audit.
  (1) `renderCreatures` used to destroy+recreate every visible creature's Phaser objects on
  every `refresh()` even when nothing about that creature changed; new `creatureVisualsChanged()`
  skips the repaint when the 4 real fields that affect it are unchanged — measured via a real
  reproduction script: 17,000 repaints down to 7 across 20 simulated refresh cycles of 850
  creatures (99.96% reduction) for the realistic "one greet resets one creature" case. (2) The
  flagged creature/NPC-vs-building depth-ordering issue turned out to only be a real bug in
  combination with the occupancy gap the same audit's Wave 1 already fixed (task #92) — since
  creatures/NPCs can no longer occupy a placed structure's tile at all, there's nothing left for
  the depth tie-break to get wrong for this case; closed without a broader y-sort rewrite (which
  remains a real, lower-priority cosmetic polish item, not a bug). This closes Wave 1 (8
  correctness bugs) and Wave 2 (dead achievements, meeting-slot fix, asset/doc cleanup, this
  perf/depth pair) of the 2026-09-15 audit in full. Wave 3 (passive income, onboarding,
  demolish/remove, zone-type function, population growth) remains tracked, each needing its own
  spec per Rule #1 before code. Verified by the measurement above + the full gate (1066 server +
  494 web tests, typecheck, build). Not yet seen rendered in a real browser.

- **Deep audit Wave 2 — 5 dead achievements revived, asset/doc cleanup (2026-09-15), not yet
  on-device confirmed** — continuation of the same audit as the Wave 1 entry below. Confirmed
  and fixed 5 of the 6 candidate dead achievements: `sentinel_command`/`grand_restorer` (tending
  a genuinely cooling creature), `cosmic_voyager` (Soumaya's real tour), `full_tank` (a real
  successful chat ask), `lenscrafter` (saving a real search as a Lens) all had zero real stat
  writers — fixed with a new `bumpStat()` in `components/achievements.ts`, always keyed by
  `statsSpaceId()`. The 6th, `galaxy_reader`, turned out to already have a real writer
  (`overworld/data/achievements.ts`) — simplified anyway to compute directly from the graph,
  removing a redundant tracking mechanism, and the now-dead writer deleted. While fixing the
  "20 NPCs" doc-accuracy pass, found a real (if minor) correctness gap: `townHallMeetingSlots()`
  was sized against that stale 20-count (12 slots) when the real roster is 22 — bumped to 24
  slots. Removed ~40MB of orphaned 3D-galaxy assets from `public/` (9 `.glb` models, an image,
  2 audio files, the `draco`/`basis` glTF loaders) confirmed to have zero code references —
  `public/` dropped from ~56MB to ~18MB. Fixed the "20 NPCs" comment inaccuracy across 3 files
  and `checkCivicConcern`'s misleading "Pure:" doc comment. Verified by 2 new test
  files/cases and the full gate (1066 server + 494 web tests, typecheck, build) — build output
  confirmed to no longer include any removed asset. Not yet seen rendered in a real browser.

- **Deep gameplay/UI-UX/asset/engine audit — 8 real bugs fixed, Wave 1 (2026-09-15), not yet
  on-device confirmed** — direct response to being asked to judge the whole Overworld against
  SimCity/city-builder peers and go deeper than the same-day economy audit: real gameplay/UI-UX
  pitfalls, bugs, and missing elements, not just design talk. Ran 4 parallel read-only
  investigation agents (assets, UI/UX, gameplay logic, engine/scene), each required to cite exact
  `file:line`. Full findings + fix plan saved to
  `docs/overworld/gameplay-uiux-audit-2026-09-15.md`. Wave 1 (this entry) fixed 8 real bugs with
  no open design decisions: (1) re-arming a Hangar item/home/business silently forfeited the
  money already spent — `townLedger.ts` gained a real `refundToTreasury()`, wired into all three
  arm functions; (2) a real z-index bug where TownHud/the Settings button row painted over and
  stayed clickable through every overlay including Settings itself; (3) a real cross-type overlap
  exploit — zoning never checked already-built homes/businesses, so a business could legally be
  placed on top of an existing home via re-zoning, directly falsifying business.ts's own doc
  comment; (4) creature placement/roaming, NPC pathfinding, AND the player's own movement were all
  blind to placed homes/businesses — the player could walk straight into their own built house;
  (5) 3 of 4 armed placement modes (item/home/business) had no HUD indicator, despite being
  checked FIRST in the interact-press priority chain — TownHud now shows a chip + refunding Stop
  button for all 4 arm modes; (6) CaptureMenu's "submitting" phase was a genuine dead end with no
  Cancel and no Escape handling anywhere in the app; (7) zero destructive-action confirmations
  existed anywhere — a new reusable `ConfirmButton` (two-tap arm/confirm, explicit Cancel, no
  auto-revert timer) is now wired into Journey delete, Timeline chapter delete, Lens delete, and
  quest turn-in. Also confirmed via the asset audit: no broken/404 asset reference exists
  anywhere, but real-in-world art is aggressively reused (5 building PNGs for 17 place/type
  slots, creature art never varies by rarity, 3 buildings' NPC attendants fall back to literally
  the player's own sprite) and ~40MB of orphaned 3D-galaxy assets remain on disk. Verified by 6
  new test files/suites and the full gate (1066 server + 485 web tests, typecheck, build). Wave 2
  (dead achievements, creature render-churn perf, depth ordering, asset cleanup) and Wave 3
  (passive income, onboarding, demolish/remove, zone-type function, population growth) are
  tracked separately, each getting its own follow-up spec per Rule #1 before Wave 3 code. Not yet
  seen rendered in a real browser from this sandbox.

- **Real pricing-gauged treasury income + Hangar previews + a real construction delay
  (2026-09-15), not yet on-device confirmed** — direct answer to a real request: "the town
  [should] make money for the treasury gauged amount correctly based on all including pricing,"
  the Hangar should show "images or something showing the actual property... that'll be put
  down," and "it must be built after being placed." Specced first
  (`docs/overworld/simcity-economy-construction.md`) per Rule #1. Verified before building, not
  guessed: every building earned an identical flat 25¢ per interaction regardless of type or
  price (confirmed by reading `townLedger.ts`); neither `hoursWorked` nor `wagesEarnedCents` is
  rendered anywhere (safe to restructure internally); Housing/Business both always render the
  same shared COTTAGE/ARCHED_HALL illustration in-world regardless of type
  (`buildingSprites.ts`), so the Hangar's generic-emoji catalog really was a mismatch — but
  town-builder decor items were already honest (plain emoji in-world too), so no fix needed
  there. Shipped: (1) `townLedger.ts`'s new `revenueForPriceCents(priceCents)` — a real 50% cut
  of the specific price sold, floored at the old flat 25¢ so nothing earns less than before;
  `creditHour`/`recordBuildingWork` gained an optional trailing wage override (default
  unchanged, every existing civic call site byte-identical); Market/Business purchases now pass
  the real gauged amount. (2) `housing.ts`'s new `CONSTRUCTION_MS` (90 real seconds) +
  `isUnderConstruction()` — the same read-time wall-clock convention `buildingNeglect.ts`
  already uses, reused as-is by `business.ts` so the two categories can't drift; a home under
  construction houses nobody, a business under construction won't sell, and both render at half
  alpha with a "🚧" badge in-world instead of their type glyph. (3) `HangarOverlay.tsx`'s Housing
  and Business rows now show a real `<img>` thumbnail of the actual in-world illustration, sized
  proportionally to the type's real footprint. Verified by 4 new `townLedger.test.ts` cases, 3
  new `housing.test.ts`/`business.test.ts` cases, 3 new `HangarOverlay.test.tsx` cases, and the
  full gate (1066 server + 451 web tests, typecheck, build). Not yet seen rendered in a real
  browser from this sandbox.

- **Overlay/menu quality-parity audit: real gaps closed (2026-09-13), not yet on-device
  confirmed** — direct response to detailed feedback that the overlays are "broken" vs. the old
  galaxy-era menus. Ran a concrete audit (diffed every overlay's real usage against its
  imported API/data modules for exports with zero call sites) instead of a redesign. Closed
  three real gaps: (1) Town Hall's Journey links were read-only (`linkToJourney`/
  `unlinkFromJourney` had zero callers) — added a real "Link a memory" picker + Unlink button;
  (2) Mayor's Hall's housing section showed aggregate counts only (`homeForNpc`/
  `residentsOfHome` unused, despite Hangar's own doc comment promising the breakdown lived
  there) — added a real per-home resident list; (3) Sanctuary was missing three whole real
  sub-features with zero UI (Inquiries, Suggested Connections, Person suggestions,
  `docs/overworld/sanctuary-inquiries-candidates.md`) — the single largest finding. Also fixed
  `llm/prompts.ts`'s `SECTOR_SYSTEM`/`LOG_SYSTEM`, found while working on task #61: both still
  instructed the model to write in space/galaxy language even though they feed real, currently-
  live features — rewrote the prompt text only (not the underlying feature/job naming, a
  separate riskier rename). Verified by 4 new `TownHallOverlay.test.tsx` cases, 1 new
  `MayorsHallOverlay.test.tsx` case, 5 new `SanctuaryOverlay.test.tsx` cases, and the full gate
  (1066 server + 442 web tests, typecheck, build). Not yet seen rendered in a real browser.

- **Real hybrid LLM + hand-authored NPC dialogue (2026-09-13), not yet on-device confirmed** —
  direct user correction that "Hybrid" dialogue was supposed to already route through the LLM;
  confirmed the real decision (`npc-society.md`) had explicitly deferred that half to "a later
  stage." `docs/overworld/npc-llm-dialogue.md` resolved the design and split the Mall into its
  own follow-up task (the user's actual message never described it — a distinct feature). New
  optional `LlmProvider.generateNpcLines()` (same "absent → caller's own fallback" convention as
  `chronicle`/`webLookup`, so no existing test fakes needed updating), implemented in
  `openai.ts`/`gemini.ts`, wrapped in `resilient.ts`. A new deterministic `heuristicNpcLines()`
  (`analysis/npcLines.ts`) is the real always-present base, grounding each line in the NPC's own
  job flavor plus one real town-state fact — never invented. New batched route `POST /api/npc-
  dialogue` (one call for every NPC, never one per NPC). Client-side: `data/npcLlmDialogue.ts`
  gates the actual call frequency behind a real 10-minute cooldown; `ExteriorScene`'s existing
  Break-time interaction now picks deterministically among an LLM-flavored line, the existing
  hand-authored pool (the default), or a gesture-only beat with no bubble — never a coin flip,
  and the interaction's own existing timing is unchanged. Verified by 6 new `npcLines.test.ts`
  cases, 4 new `npcDialogueRoute.test.ts` cases, 9 new `npcLlmDialogue.test.ts` cases, and the
  full gate (1066 server + 432 web tests, typecheck, build). Not yet tested against a real LLM
  key from this sandbox, and not yet seen rendered in a real browser.

- **MindSpace's ambient floating-thought overlay (2026-09-13), not yet on-device confirmed** —
  direct user request, reversing an earlier deprioritization. The data (`getThoughts()`, real
  live working-memory list `SanctuaryOverlay.tsx` already manages) was already real; the gap was
  purely presentational — nowhere outside that one building were thoughts visible.
  `docs/overworld/mindspace.md` (per Rule #1) resolved the design: motes are read-only ambient
  decoration (no second, competing interaction surface — managing a thought stays exclusively in
  the Sanctuary) and orbit the PLAYER rather than any fixed tile, since a thought has no real
  location the way a memory-turned-node does. New pure `adapter/moteLayout.ts` computes a
  deterministic circular drift per thought (hashed from its id, same no-`Math.random` convention
  as the rest of this codebase), frozen under `prefersReducedMotion()`. Capped at the top 6 by
  strength; alpha carries strength, scale carries reinforceCount — two independent non-color
  cues. `WorldSnapshot` gained a `thoughts` field; `ExteriorScene.setThoughts()` mirrors
  `setCreatures()`'s existing pattern. NPC awareness/commentary on the motes stays deferred as a
  distinct follow-up enhancement. Verified by 8 new `moteLayout.test.ts` cases, 2 new
  `loadWorldSnapshot.test.ts` cases, and the full gate (1056 server + 422 web tests, typecheck,
  build). Not yet seen rendered in a real browser.

- **Mission Control as the Overworld's front door (2026-09-13), not yet on-device confirmed** —
  direct user request, reversing an earlier deprioritization: bring back Mission Control (and
  reuse a pre-Overworld spec's own resolved decision — `docs/overworld/mission-control.md` —
  that it should evolve the Observatory building in place, not become a new screen or a
  landing-page popup). `ObservatoryOverlay.tsx` now shows, in `VISION_2_JOURNEYS.md`'s own
  priority order: today's agenda (open quest/due reminder counts from `graph.nodes`, same
  predicates `BulletinBoardOverlay.tsx` already uses), Safe-to-spend (already-fetched
  `WorldSnapshot.bank`), a real Daily Contact question + answer form (`getDailyContact`/
  `answerDailyContact` — genuinely orphaned until now, same pattern task #71/#72 already fixed
  elsewhere), "worth a moment" (the spaced-repetition due list, task #58), active Journey
  progress (`getJourneys()`, capped at 3), the existing AI-observations digest unchanged, and
  recent activity. Answering Daily Contact credits the Observatory's own real work event. The
  relationship check-in suggestion stays deferred (needs genuinely new computation). Verified by
  7 new `ObservatoryOverlay.test.tsx` cases and the full gate (1056 server + 412 web tests,
  typecheck, build). Not yet seen rendered in a real browser.

- **Zoning at true SimCity scale (2026-09-13), not yet on-device confirmed** — direct response
  to the single most emphatic, repeated complaint from a live feedback pass: one-tile-at-a-time
  zoning that required a fresh Hangar trip after every tile. Confirmed by reading the shipped
  `data/zoning.ts` first (`docs/overworld/zoning-rework.md`) per Rule #1: `zoneTileAt()` really
  did clear the armed state after every single paint, and there was no way to designate more
  than one 1x1 tile per interact press. Two fixes: (1) arming now persists across paints — no
  more auto-clear, so a player arms once and paints indefinitely; (2) a new Area mode (Hangar
  toggle) lets two interact presses (an anchor, then a commit) zone a whole rectangle in one
  action, skipping blocked tiles, no size cap, arm staying active for the next rectangle. Since
  an armed type no longer auto-clears, the persistent `TownHud` now shows a live "🧭 Zoning:
  &lt;type&gt; (&lt;mode&gt;)" chip with an inline Stop button, so ending a session needs no
  Hangar trip either. Deliberately deferred: a live rectangle preview while walking to the
  second corner (real engine risk for a cosmetic touch). Verified by 8 new `zoning.test.ts`
  cases, 2 new `HangarOverlay.test.tsx` cases, 3 new `TownHud.test.tsx` cases, and the full gate
  (1056 server + 405 web tests, typecheck, build). Not yet seen rendered in a real browser.

- **Real on-device bug fixes from live feedback (2026-09-13), not yet on-device confirmed** —
  direct response to a real, detailed voice-transcribed feedback pass. Four concrete, provable
  bugs fixed (see `docs/overworld/roadmap.md`'s "Stage 2.35" for the full account): (1) two
  in-game buttons (Settings/Next-track/Mute) were fully hidden behind `AuthGate.tsx`'s
  higher-z-index "Log out" button, both claiming the same top-right corner — moved the row down
  below it; (2) "invisible NPCs blocking around doors" — measured first via a real ASCII
  passability-map probe (disproved a "tight door" theory: the real approach is 4 tiles wide and
  clear), then found the real cause — each attendant's own post tiles stay impassable even while
  that attendant is genuinely invisible (Working) — and fixed it with a permanent low-alpha
  ground marker at every post tile, independent of the attendant's own visibility, rather than
  touching passability logic itself; (3) Soumaya's sprite was a genuinely male-presenting wizard
  (confirmed via a labeled contact sheet of the same already-approved Tiny Dungeon CC0 pack) —
  repainted with a real female-presenting tile, pixel-diff-verified; (4) Soumaya now has real
  dwell time and alternates between entering a building (hidden, mirroring the attendant
  Working-state convention) and dwelling visibly outside, instead of perpetual motion — the
  player's greet-her interaction now checks her visibility first. Still open from the same
  feedback pass, tracked as active work, not deprioritized: MindSpace, Mission Control, real
  hybrid LLM+static NPC dialogue and the Mall, a SimCity-scale zoning rework (persistent arm
  state + multi-tile area painting), distinct art for residential/future-commercial buildings, a
  full overlay/menu quality-parity audit against the old galaxy-era panels, literal walk-in
  building interiors, and an NPC economy/entertainment (theater/news) system fed by the Lore
  engine. Verified by the full gate (1056 server + 391 web tests, typecheck, build) + a `cmp`
  confirming the patched `tiles.png` is byte-identical in the built `dist/`. Not yet seen
  rendered in a real browser from this sandbox.

- **Real Park decor from CC0 assets already in use (2026-09-12), not yet on-device confirmed** —
  most of task #74's asset-sourcing was already done (the tileset is real Kenney CC0 "Tiny
  Town"/"Tiny Dungeon"); confirmed by reading the real credits/atlas first
  (`docs/overworld/park-decor.md`) that tree/bench/fence art was simply never extracted from the
  same source, leaving Park's repeated real complaint unfixable. A real new capability was
  confirmed directly: the same CC0 mirror (`github.com/shorepine/kenney`) is reachable from this
  sandbox via a shallow sparse `git clone`, unlike kenney.nl/itch.io direct downloads. A labeled
  contact sheet of its real 132 Tiny Town tiles was generated and reviewed to hand-pick 5 real
  ones (two trees, a bench, a fence post, a mushroom), repainted into `tiles.png`'s own already-
  confirmed-unused frame slots (zero risk to the other 27 in-use indices), pixel-diff-verified
  against their real source before any code was written. `ExteriorScene.ts`'s Park now places
  them at fixed, door-collision-checked positions instead of a bare paved courtyard. Verified by
  2 new `tileAtlas.test.ts` cases, the pixel-diff verification, and the full gate (1056 server +
  391 web tests, typecheck, build) — confirmed the patched atlas is byte-identical in the actual
  built `dist/` output. Not yet seen rendered in a real browser from this sandbox.

- **Reviving the dormant memory-storytelling systems (2026-09-12), not yet on-device
  confirmed** — investigated first, not guessed (`docs/overworld/storytelling-revival.md`):
  genuinely 3 distinct systems (a real naming collision calls both "the Chronicle" in different
  comments), all with fully working, already-typed client wrappers sitting unused —
  `getLore`/`evolveLore`, `getTimeline`/`addTimelineChapter`/`deleteTimelineChapter`,
  `getCodexDiscoveries`/`claimCodexReward`. The gap was never the API layer, only that nothing
  in the Overworld called them. Each got the real in-world home its data already implies:
  Lore → `CreatureSummaryOverlay.tsx` (a memory's own evolving story, latest chapter + "✦
  Evolve"); Timeline → `TownHallOverlay.tsx` (a life chapter is the same concept Journeys
  already represent; deleting only offered for `origin === "user"` chapters, never Soumaya's own
  auto-generated ones); Codex → `GymOverlay.tsx` (joins the one real Codex meta-achievement that
  already lives there). Verified by 9 new tests across the three overlays + the full gate (1056
  server + 389 web tests, typecheck, build). Not yet seen rendered in a real browser from this
  sandbox.

- **Reviving Lenses (2026-09-12), not yet on-device confirmed** — a real orphaned feature,
  confirmed by direct investigation (`docs/overworld/lenses-revival.md`): the server route/repo/
  shared types were never touched by the Overworld rewrite — only the entire client side
  (`api/lenses.ts`, `LensChips.tsx`, `LensesPanel.tsx`) was deleted with the old galaxy UI,
  leaving a fully live server feature unreachable. `api/lenses.ts` recreated VERBATIM from git
  history (same 5 function signatures, same safe-fallback shape), re-exported from `client.ts`.
  Real in-world home: the Library, since a Lens is literally "a saved way to browse the
  shelves" (the same `graph.nodes` Library already reads). Deliberately minimal vertical slice:
  a lens is exactly the search you just typed, saved and re-runnable by name — the other 7 real
  query fields the server supports are explicitly deferred, not invented. Verified by 4 new +
  3 updated `LibraryOverlay.test.tsx` cases and the full gate (1056 server + 380 web tests,
  typecheck, build). Not yet seen rendered in a real browser from this sandbox.

- **A persistent town HUD + a Settings/Help entry point (2026-09-12), not yet on-device
  confirmed** — direct answer to a real flagged gap from the 2026-09-11 parity audit, confirmed
  still true by reading the real code first (`docs/overworld/town-hud.md`): Streak/Fuel only
  ever showed inside the Gym, Treasury only inside Market/Hangar/Mayor's Hall, no Settings/Help
  anywhere. New `ui/TownHud.tsx` — a compact, always-visible top-left bar (🔥 streak, ⚡ fuel, 🏦
  Treasury; the first two reuse `GymOverlay.tsx`'s own icon convention). New
  `ui/SettingsOverlay.tsx` behind a new ⚙️ button: real Sound controls (the same real
  `musicEnabled`/`setMusicEnabled`/`nextTrack` the floating buttons already use) and a real "How
  to Play" (only the actual key bindings `ExteriorScene.ts` already has — nothing invented).
  Verified by 7 new tests + the full gate (1056 server + 376 web tests, typecheck, build). Not
  yet seen rendered in a real browser from this sandbox.

- **Cross-building NPC relationships (2026-09-12), not yet on-device confirmed** — direct
  answer to real feedback asking for NPCs who "interact with other npcs" beyond their own
  building's coworker. Specced first (`docs/overworld/social-depth.md`): the real gap was
  purely in the scene — `npcRelationships.ts` was always generic over any two npcIds, nothing
  ever gave two different buildings' NPCs a real chance to meet. The real trigger: two
  different NPCs both genuinely lingering at the same real outing destination (Park/Market) at
  the same real moment — a new `outingArrivedAt` map tracks who's actually there, checked at
  the exact arrival moment. Dialogue is capped at "acquaintances" (every hand-authored friend
  line assumes a same-building partner) and relationship growth pauses if EITHER npc's home
  building is neglected — the real relationship count/tier still grows underneath either way.
  Verified by the full gate (1056 server + 369 web tests, typecheck, build) — no dedicated
  `ExteriorScene.ts` test exists (this file's established convention). Not yet seen rendered in
  a real browser from this sandbox.

- **Deepening the player-action feedback loop (2026-09-12), not yet on-device confirmed** —
  found two real gaps by reading `npc-economy.md`'s own "which real API call feeds which
  building" table against every real `recordBuildingWork` call site (`docs/overworld/town-
  growth-loop.md`), not guessed. (1) A fresh memory capture (`handleCaptureSubmit`'s
  `ingestText(kind: "memory")`) credited zero building — now credits the Library, since a
  captured memory becomes one more real node in the same `graph.nodes` collection Library
  already reads. (2) The Town Meeting / civic-concern Bulletin Board posts used the exact same
  real `ingestText(kind: "action")` mutation `BulletinBoardOverlay.tsx`'s own posts already
  credit, but never called `recordBuildingWork` themselves — now both do. Both fixes are the
  same one-line pattern every other real mutation already uses. Verified by the full gate (1056
  server + 369 web tests, typecheck, build) and the existing `OverworldRoot.test.tsx` suite
  passing unchanged — not yet seen rendered in a real browser from this sandbox.

- **Does the town run without the player? (2026-09-12), not yet on-device confirmed** —
  answered the task's own question honestly first (`docs/overworld/town-persistence.md`), from
  reading the real code: `buildingNeglect.ts`'s neglect (and civic concern/Town Health/Business
  Neglect built on it) already runs independent of the player — it's computed from a real stored
  timestamp vs. `Date.now()` at read time, never a tick. What did NOT: the NPC Working/Break/Home
  schedule (`ExteriorScene.tickSociety()`), driven by a session-local counter that reset to 0 on
  every reload. What CANNOT, as a genuine architecture boundary: any of that schedule's VISUAL
  consequences (walk tweens, outings, the meeting gathering) — this app has no server-side job/
  worker, so animating anything with no tab open needs real new infrastructure, not a client
  tweak; explicitly not attempted. The one real, safe fix shipped: the schedule's tick is now
  derived from `Date.now() / SOCIETY_TICK_MS` instead of counted up from a session field —
  `npcSchedule.ts`'s `scheduleStateAt` needed zero changes, already a pure function of its tick
  input. Measured, not assumed: a real reproduction script confirmed the OLD behavior always
  resumed frozen at "just started Working" regardless of real elapsed time, the NEW behavior
  correctly reflects a simulated 3-hour gap, and the new tick is mathematically identical to
  continuous incrementing the whole time (confirmed via direct arithmetic check). The 60-second
  cycle length itself is unchanged. Verified by that measurement + the full gate (1056 server +
  369 web tests, typecheck, build) — no dedicated `ExteriorScene.ts` test exists (consistent with
  this file's own convention of verifying Phaser-integration code by measurement rather than a
  unit test), so this entry documents the verification directly. Not yet seen rendered in a real
  browser from this sandbox.

- **A real multi-business economy (2026-09-12), not yet on-device confirmed** — direct answer to
  the task's own name: "more than one Market." Specced first (`docs/overworld/business.md`):
  mirrors housing's own zoning-gated, player-built, treasury-priced pattern for the OTHER zone
  type ("commercial") that also did nothing until this round. New `data/business.ts`: 3 business
  types (Bakery/Tailor/Bookshop), each with its own real goods catalog. Unlike a home, a placed
  business is a real place you walk into — stepping onto its own door tile opens a generic
  `BusinessOverlay.tsx` (parameterized by the business's own type, not one screen per type);
  buying a good there credits THAT business's own real hours/neglect, confirmed to need zero
  changes to `townLedger.ts`/`buildingNeglect.ts` (already string-keyed) before writing any code.
  Rendered by reusing ARCHED_HALL (Market's own illustration) plus a type-glyph badge; Mayor's
  Office gained a "Business Neglect" list. Deliberately, explicitly deferred (carried over
  unchanged from housing's own round): no new collision enforcement for any placed footprint (a
  pre-existing gap, not introduced here); NPCs working at a placed business (player-run shops
  this round, not staffed ones). Verified by 14 new `business.test.ts` cases, 6 new
  `BusinessOverlay.test.tsx` cases, 2+2 updated Hangar/Mayor's-Hall overlay tests, and the full
  gate (1056 server + 369 web tests, typecheck, build) — not yet seen rendered in a real browser
  from this sandbox.

- **Real housing/real-estate types (2026-09-12), not yet on-device confirmed** — direct answer
  to the SimCity framing's "give the NPCs homes... our individual life is not identical to
  another" and "hot zoning is how many homes there are." Specced first
  (`docs/overworld/housing.md`): gives zoning (task #75) and the Hangar town-builder (task #65)
  their first real mechanical consequence — a home can only be built on ground already tagged
  residential. New `data/housing.ts`: 4 home types (Cottage/Duplex/House/Apartment Block, 1-4
  real residents each), a stricter multi-tile version of town-builder's own arm-then-place flow,
  paid from the real Town Treasury. NPC-to-home assignment is deterministic and capacity-packed,
  never random — homes fill in real build order from the town's real 20 society NPCs
  (`allSocietyNpcIds()`), which is what actually makes NPC living situations genuinely vary (an
  NPC in a Cottage lives alone; one in an Apartment Block shares with 3 others — a real number,
  never an invented trait). Rendered by reusing the already-loaded COTTAGE illustration scaled to
  each home's footprint, plus a type-glyph badge (no new art — task #74 covers that). Deliberately
  deferred: routing the NPC schedule's "Home" state to actually walk to the assigned home — its
  tween-driven state machine is the most fragile part of this codebase (a real cross-tween
  conflict was already caught and fixed there once), so this round ships the buildable/assigned/
  honestly-reported real-estate layer without risking that working, verified machinery. Verified
  by 13 new `housing.test.ts` cases, 2 new `MayorsHallOverlay.test.tsx` cases, 2 new
  `HangarOverlay.test.tsx` cases, a real open-ground probe against the actual 46x31 map, and the
  full gate (1056 server + 345 web tests, typecheck, build) — not yet seen rendered in a real
  browser from this sandbox.

- **The townwide civic-concern signal (2026-09-12), not yet on-device confirmed** — the
  D3-compliant reframe of "add the criminals system and policing" (`decisions.md` D3 is a hard,
  permanent no-combat rule). Specced first (`docs/overworld/civic-concern.md`): a real majority
  of buildings neglected at once (never one struggling building) triggers a SECOND, independent
  reason to hold the exact same real Town Meeting `townMeeting.ts` already built — same
  Bulletin Board post, same NPC gathering, no new mechanism. New `data/civicConcern.ts`,
  edge-triggered (announces once on the transition into "widespread", re-arms only once neglect
  genuinely improves), names real buildings in its message rather than inventing a crime
  narrative. Measured against the real 10 door places (Mayor's Hall correctly excluded): a fresh
  save with nothing ever worked correctly triggers immediately — deliberately not special-cased
  with a grace period, since `buildingNeglect.ts` already treats "never worked" as maximally
  neglected everywhere else (Park, Mayor's Office, attendant dimming), and a grace period just
  for this signal would be a new inconsistency, not a fix. Verified by 8 new tests + the
  real-data measurement + full gate (1056 server + 328 web tests, typecheck, build) — not yet
  seen rendered in a real browser.

- **Mayor's Hall — literally the biggest building on the map (2026-09-12), not yet on-device
  confirmed** — direct answer to "somebody needs the biggest building on the map, which is for
  the mayor." Specced first (`docs/overworld/mayors-hall.md`): 12x6 (72 tiles) vs. every other
  building's uniform 6x3 (18 tiles) — 4x the area. Every collision/passability/attendant-post
  function was already generic over a footprint, so the bigger size needed zero changes
  anywhere — verified by a real ASCII-map print of the generated layout. "Her security" is two
  real attendant NPCs (Wren, Cass) with full NPC Society profiles, not a special case. Walking
  in shows a real Mayor's Office dashboard combining the Town Treasury, per-building neglect,
  and the zoning plan — all already-real data, nothing new invented, read-only since no
  interaction exists yet to credit as work. Reuses the same civic-banner illustration Town
  Hall/Gym already use — no new art. Verified by 2 new/updated + 6 new tests + the ASCII-map
  measurement + full gate (1056 server + 320 web tests, typecheck, build) — not yet seen
  rendered in a real browser.

- **Zoning: the real foundation under housing and business (2026-09-12), not yet on-device
  confirmed** — direct answer to "I also need zoning to be a thing... where homes can go...
  where commercial buildings can go to earn income." Specced first
  (`docs/overworld/zoning.md`): a zone is a per-tile tag (matching town-builder's own
  tile-at-a-time mechanic), 4 real types (residential/commercial/sidewalk/transit), zoning
  itself is FREE — only building on a zoned tile later costs anything, once tasks #66/#67 exist.
  Reuses town-builder's exact arm-then-place interaction as a second, parallel arm mode; new
  `data/zoning.ts`; zoned tiles render as a distinct low-alpha glyph per type
  (🏠🏪➰🚏, never color-only); a new Hangar "Zoning" section arms a type for free. The
  request's "positive/negative economic effect" becomes real once #66/#67 gate placement by
  zone — this slice's own honest contribution is a real per-type count, never an invented
  score. Also fixed a stale comment on `NPC_STEP_MS` left over from before the movement-speed
  fix that contradicted the real, already-measured numbers. Verified by 10 new + 2 updated
  tests + the same 857-of-1104-tiles measurement town-builder's own placement already proved +
  the full gate (1056 server + 313 web tests, typecheck, build) — not yet seen rendered in a
  real browser.

- **NPCs read as walking, not gliding; Park stops looking like a building (2026-09-12), not yet
  on-device confirmed** — two complaints, each checked against the actual code, not guessed.
  "NPCs shouldn't move quicker than I can": measured the real numbers — the player's step tween
  is 140ms/tile, `NPC_STEP_MS` is 160ms/tile, so NPCs were never actually faster per tile. The
  real gap was a missing footstep cue (pure linear glide vs. the player's own squash/stretch hop)
  that reads as sliding over a long unbroken path even at an equal/slower rate — fixed with a new
  `hopStep()` firing on every NPC/Soumaya step. "[The Park] looks stupid, not a park": confirmed
  `buildingSprites.ts` had no art for Park, so it fell through to the generic stone COTTAGE
  illustration — an open public space rendered as a building. Fixed by excluding Park from the
  building pass and painting its footprint with the plaza's own path tile instead (a real
  courtyard); genuine decor (benches, trees) still needs real art (task #74) that isn't loaded
  yet. Also: added Zoning as a new task (#75) since it's the real foundation housing (#66) and
  business types (#67) both need to exist first; clarified Fuel stays exactly what it already is
  (the LLM-job-cost meter) rather than being reinterpreted for NPCs — the town-facing "morale"
  concept is a distinct new aggregate, folded into task #64. Verified by the real step-duration
  measurement + full gate (1056 server + 301 web tests, typecheck, build) — not yet seen rendered
  in a real browser.

- **Soumaya stops talking like a spaceship; a real old-galaxy parity audit (2026-09-12), not yet
  on-device confirmed** — direct complaint: "Samaya shouldn't be responding to me like she's
  still a spaceship flying through a space galaxy." Confirmed real by reading the actual code:
  `llm/prompts.ts`'s `ANSWER_SYSTEM` (the real Gemini/OpenAI system prompt) called her "the
  starpilot of the memory galaxy... tend[ing] from a small craft"; `llm/heuristic.ts`'s offline
  fallback replies said "Cruising the quiet outer reaches of your galaxy" and "Stardate: ...".
  Both fixed — she's introduced as "the Mayor of the user's own town" now, every heuristic
  fallback rewritten, `persona/derive.ts`'s "galaxy holds N memories" line fixed too (it's fed to
  the LLM as context, so it could get echoed back). New regression test asserts no
  space-cosmology word ever appears in her offline replies.
  A real parity audit (reading the actual deleted pre-Overworld files via `git show`, not
  guessing) found 5 real gaps now tracked: MindSpace's ambient floating-thought overlay (task
  #70, the user's own explicit ask); three dormant memory-storytelling systems — per-memory
  evolving lore, the Chronicle timeline, Codex discoveries (task #71); Lenses, whose client API
  was deleted outright while the server route stayed live (task #72); no persistent Fuel/Streak
  HUD or Settings/Help entry point anywhere (task #73). Plus a real asset-sourcing task (#74) for
  the SimCity-style expansion (schools, homes, businesses), scoped around real licensing +
  performance constraints. Verified by the full gate (1056 server + 301 web tests, typecheck,
  build) — not yet re-tested against a real LLM key from this sandbox.

- **The Hangar becomes a real town-builder (2026-09-12), not yet on-device confirmed** — direct
  answer to "go to the hangar, and that's where you can select items to be placed in the map...
  think of Sims." Specced first (`docs/overworld/town-builder.md`) per Rule #1: a small catalog of
  1x1 decorative items, bought with the real Town Treasury and "armed" (one pending item per
  space, never a queue), then placed by pressing interact facing a free tile in the world. New
  `data/townBuilder.ts` (pure, localStorage-backed, same shape as `marketGoods.ts`);
  `ExteriorScene.ts` renders placements + owns the interact-to-place flow;
  `loadWorldSnapshot.ts`'s creature placement now also avoids tiles the player has already built
  on. Measured before shipping: the real 46x24 map has 857 open tiles out of 1104 after every
  real exclusion. Multi-tile buildings, real housing/business types, and "NPCs react to placed
  items" are deliberately deferred (tasks #66/#67) — this slice proves the mechanism only.
  Verified by 10 new + 3 updated tests + the full gate (1051 server + 301 web tests, typecheck,
  build) — not yet seen rendered in a real browser.

- **NPCs get their lives back; Soumaya finally moves (2026-09-12), not yet on-device confirmed**
  — a large multi-part request (Soumaya autonomy/governance, crime/policing, NPC visibility, LLM
  dialogue, and more) got a full reconciliation doc first (`docs/overworld/soumaya-governance.md`)
  per Rule #1, resolving each ambiguity and deferring what needed its own spec. Shipped this
  round: Soumaya converted from a static fixture into a real autonomous, pathfinding-driven
  companion who tours every building deterministically (measured against the real 46x24 map —
  `findPath` succeeded for all 10 buildings across 2 full laps, no failures); NPCs no longer fade
  to invisible when off duty (Home now renders like Break, resting visibly at post — a direct
  reversal of a v1 decision); Mira's title softened to Deputy Mayor (flavor-only — her v1 doc
  already called "Mayor" a role with zero mechanical weight). Deferred with reasoning and a real
  tracked-task home: Soumaya's own NPC interactions + leading Town Meetings (task #59), a Mayor's
  Hall + "her security" (task #63), a D3-compliant townwide civic-concern signal as the
  crime/policing reframe (task #64), political divisions (revisit only past 20 NPCs), and
  LLM-generated/token-batched/town-state-aware dialogue (folded into task #61's spec). Verified by
  the tour measurement + full gate (1051 server + 288 web tests, typecheck, build) — not yet seen
  rendered in a real browser from this sandbox.

- **Real bug fix: Soumaya's chat overlay flashing open-then-closed (2026-09-12), not yet
  on-device confirmed** — real user report: touching the A button to talk to Soumaya opened her
  chat, which instantly closed again (holding the button was the only workaround). Root cause,
  found by reading `TouchControls.tsx`: A's `onPointerDown` opened the overlay immediately, but
  the browser still synthesizes a compatibility `click` after a touch gesture unless
  `preventDefault()` is called — that ghost click landed on `OverlayShell`'s full-width Leave
  button, which now sits at the exact screen position A occupied a frame earlier, closing the
  overlay that had just opened. Fixed with `e.preventDefault()` in A's pointerdown handler (the
  standard cross-browser fix for a lingering synthetic click after a touch gesture). Verified by
  a new `TouchControls.test.tsx` assertion (`fireEvent.pointerDown` returns `false` — the signal
  a cancelable event's `preventDefault()` was actually called) + the full gate (1051 server + 288
  web tests, typecheck, build). Root-caused correctly from the report alone; still needs a real
  on-device tap to confirm the flash is actually gone.

- **Spaced repetition surfaced in the Overworld (2026-09-12), not yet on-device confirmed** —
  the SM-2 review engine (`analysis/review.ts`), its route, and even the typed client fetch
  functions (`getDueReviews`/`gradeReview`) were all already real and shipped, just never called
  anywhere in the client — this round is a presentation gap closed, not new backend. Added a
  second, independent-from-entropy `dueForRecall` signal (a "💭" in-world marker distinct from
  the existing "?" dim marker — the two can co-occur), a real "Recall check" in
  `CreatureSummaryOverlay` (hides content until you choose to try to recall it, then grades a
  real attempt), and a one-line proactive nudge in Soumaya's chat greeting naming the weakest due
  memory with a real "📍 Go there" — deliberately NOT a separate review-deck screen (rejected as
  the literal Anki-deck shape NEURO_ALIGNMENT says to avoid). See `docs/overworld/spaced-
  repetition.md` and `docs/overworld/roadmap.md`'s "Stage 2.15". Verified by new/updated tests
  (nodeToCreature, loadWorldSnapshot, CreatureSummaryOverlay, SoumayaChatOverlay) + the full gate
  (1051 server + 287 web tests, typecheck, build) — not yet seen rendered in a real browser.

- **Dialogue duration + a real themed overlay panel (2026-09-12), not yet on-device confirmed**
  — two concrete complaints from a roadmap discussion: dialogue "doesn't stick around long
  enough to read," and every building overlay "look[s] ugly" next to the old galaxy panels.
  Dialogue hold time is now a real reading-pace formula instead of a flat 2600ms (measured
  against the actual 100 authored lines: 2680-5000ms depending on length). All 12
  "walked-into-a-place" overlays now share one real themed panel component (`OverlayShell.tsx`)
  instead of 12 independently-styled flat divs. See `docs/overworld/roadmap.md`'s "Stage 2.14".
  Verified by the measurement above + new/updated tests + the full gate (1051 server + 280 web
  tests, typecheck, build) — not yet seen rendered in a real browser from this sandbox.

- **NPC Autonomy round — real cross-town movement (2026-09-12), not yet on-device confirmed** —
  direct follow-up to "are they autonomous?": the honest answer was that their schedule and
  break-time interaction run on their own, but they never actually went anywhere beyond their
  own doorstep, and income was entirely reactive to the player. Per Rule #1, got its own spec
  (`docs/overworld/npc-autonomy.md`) since `overworld/engine/*` is explicitly Claude's own
  Red Zone. Shipped a real, pure, budget-capped BFS pathfinder (`engine/pathfinding.ts` — plain
  BFS, not A\*, since the small uniform-cost region doesn't need it), a new
  `isNpcPathPassable` in `regionLayout.ts` (the player's own passability rule minus the
  attendant-tile block, so a building's post tiles are valid NPC destinations), and
  footprint-derived Town Hall meeting slots. Real off-duty "outings" now send each of the 20
  society NPCs on an occasional real walk to Park or Market while genuinely Home, and
  `announceTownMeeting()` now sends every one of them walking to a real meeting slot near Town
  Hall and back — both were explicitly scaled back in the Town Economy round for a crowding
  risk that real pathfinding now resolves (real travel time from spread-out buildings staggers
  arrivals for free). Measured, not assumed: a script computed real paths across the actual
  46x24 map (40-50+ tile opposite-corner trips) and timed all 20 attendants pathing to a
  meeting slot at once — under 10ms total. A real bug was caught in review before shipping (an
  outing's return leg wasn't protected against a real schedule transition firing mid-walk,
  which would have left two tweens fighting over one sprite) and fixed. See
  `docs/overworld/roadmap.md`'s "Stage 2.13" for the full account and what's deliberately
  deferred (cross-building relationships/visiting a specific friend; anything beyond plain BFS;
  the player's own movement, unchanged). Verified by 9 new pathfinding tests + 10 new
  regionLayout tests + the real-path measurement above + the full gate (1051 server + 276 web
  tests, typecheck, build) — the actual in-world outings and Town Meeting gathering have not
  been seen rendered in a real browser from this sandbox.

- **Town Economy round — bigger buildings, a real wage/neglect loop, Market + Park
  (2026-09-12), not yet on-device confirmed** — a single message asked for a lot at once:
  more NPCs, ~3x-bigger buildings, NPCs that enter/exit buildings, a wage economy, work created
  by real interactions, new shops/recreation, "health"-driven adaptation, and reusing "old
  mechanics." Got its own spec (`docs/overworld/npc-economy.md`) per Rule #1, with the biggest
  ambiguities resolved directly with the user first: wages are a **purely cosmetic in-game
  ledger, never real Bank/finance or the real `Fuel` resource** (`Fuel` is an LLM-job-cost
  meter, confirmed by reading it, not a spendable currency); "health" is the old galaxy's own
  `entropyFrom`/`COOLING_ENTROPY` neglect math extended to buildings, not a new invented stat;
  "old mechanics" meant the real per-building data already wired into every Overlay. Shipped: a
  **generated** region layout (`regionLayout.ts` — no more hand-typed coordinates, so a building
  can't silently overlap another), buildings at 3x their original footprint area, two new
  buildings (Market, Park), NPC Society rolled out from 2 to all 20 attendants (every building,
  not just Town Hall), NPCs that actually walk into their door and disappear while Working and
  come back out for Break, real wages/hours from real interactions at every building
  (`data/townLedger.ts`, `data/npcJobs.ts` — the Bank/Gym have no button of their own, so their
  work is detected by diffing snapshots instead), a neglect cascade that pauses relationship
  growth and dims a building's attendants when real work hasn't happened there in a while
  (`data/buildingNeglect.ts`), a real Market spending the Town Treasury on a small cosmetic
  catalog, and a Park showing which buildings actually need a visit. See
  `docs/overworld/roadmap.md`'s "Stage 2.12" for the full account and what's deliberately
  deferred (a Mall as its own complex; routing every building's Break time to a shared Park tile
  — revised mid-build once it looked like a real crowding risk with no way to verify it was
  safe this round; LLM dialogue variation; any real-money/Fuel integration for the shop).
  Verified by 6 new/updated pure-logic test files, 2 new overlay tests, a printed ASCII-map
  reproduction of the actual generated layout (not just passing tests) confirming the geometry
  matched the design, and the full gate (1051 server + 258 web tests, typecheck, build) — the
  actual bigger buildings, enter/exit animation, and Market/Park screens have not been seen
  rendered in a real browser from this sandbox.

- **NPC Society v1 — the first two NPCs with real lives (2026-09-11), not yet on-device
  confirmed** — real user feedback escalated across three rounds asking for NPCs with "actual
  autonomous jobs... interact with other npcs... their own lives and personalities... a
  governing system... town meetings... reasons for all of it." Got a full proposal + sign-off
  round first (`docs/overworld/npc-society.md`), per CLAUDE.md Rule #1 — the user chose Hybrid
  dialogue, a small vertical slice first, and asked to seed in **both** relationships and
  governance-with-real-teeth rather than deferring them. Shipped on just the two Town Hall
  attendants (Mira the Mayor, Dez the Clerk — chosen because their posts already sit next to
  each other): a real deterministic Working/Break/Home schedule (`data/npcSchedule.ts`), a
  break-time interaction with dialogue that grows on real achievement unlocks
  (`data/npcDialogue.ts`) and a real pairwise relationship counter (`data/npcRelationships.ts`),
  and governance with an actual mechanical effect — a new Synthesis Digest insight
  (`getDigest()`) triggers a Town Meeting whose one real effect is posting a plain-language
  summary to the Bulletin Board as a genuine quest (`data/townMeeting.ts`). The other 6
  buildings' 12 attendants are unchanged. See `docs/overworld/roadmap.md`'s "Stage 2.11" for the
  full account and what's deliberately deferred (rollout to the other attendants, LLM dialogue
  variation, a town-wide walk to Town Hall). Verified by 4 new pure-logic test files + updated
  `regionLayout.test.ts` (39 assertions) + the full gate (1051 server + 209 web tests, typecheck,
  build) — the actual break-time interaction, speech bubbles, and 📢 meeting cue have not been
  seen rendered in a real browser from this sandbox.

- **Soumaya Overworld is now the sole UI (2026-09-11) — galaxy deleted, not yet on-device
  confirmed** — the 2D Pokémon-GBA-style overworld (`docs/overworld/`) has a real in-world place
  for all 11 former dock tabs (Details/Summary, Browse/Library, Mind/Sanctuary, Agenda/Bulletin
  Board, Insights/Observatory, Soumaya chat, Inbox/Post Office, Progress/Gym, Journeys/Town Hall,
  Money/Bank, Hangar) — see `docs/overworld/roadmap.md`'s parity table for exactly which real
  API/localStorage data backs each one. Per the user's explicit 2026-09-11 direction, the 3D
  galaxy (`graph/*` — ~65 files, `RightDock.tsx`, ~75 panel components, `App.tsx`) has been
  **deleted**, `main.tsx` now mounts `overworld/AuthGate.tsx` unconditionally (no more
  `?overworld=1` flag), and `AuthGate.tsx` absorbed the login/boot-gate role `App.tsx` used to
  own (including the `window.__brainBooted()` signal `index.html`'s boot-failsafe depends on —
  caught and fixed before it could silently break every load). Also relocated `graph/sfx.ts` +
  `graph/motion.ts` to `lib/` (the surviving `Toasts.tsx` genuinely depends on them) and
  consolidated the Overworld's own separate `prefersReducedMotion` into that one canonical
  implementation rather than keeping two. Removed now-unused deps (`three`, `react-force-graph-3d`,
  `mammoth`, `pdfjs-dist`) — production bundle dropped from ~4MB to ~206KB initial +
  ~1.3MB lazy-loaded Overworld chunk. All pure logic (movement, collision, placement determinism,
  the dim-state threshold, region layout, the achievement-unlock port) is unit-tested and green;
  the actual rendered Phaser canvas and all 11 overlays' real look/feel have **not** been seen in
  a real browser from this sandbox and need on-device/browser confirmation once a deploy is
  possible. **Known gap, not yet rebuilt**: memory attachment upload/text-extraction (PDF/docx)
  had no Overworld home and its dependencies were removed — flag before anyone relies on it.

- **Real tile/sprite art replacing flat-rectangle placeholders (2026-09-11), not yet on-device
  confirmed** — the user reported the deployed Overworld as "just square tiles," correctly
  pointing out the brief's reference repos/MCP tooling had gone substantively unused. Fixed with
  a hand-curated CC0 tile atlas (Kenney's "Tiny Town" + "Tiny Dungeon", public/CREDITS.md) wired
  into `ExteriorScene.ts` for ground/buildings/player/per-type creature sprites — see
  `docs/overworld/roadmap.md`'s "Stage 2.5" for the full account (what art maps to what, and
  what's still deferred: no water/tree tiles, Hangar cosmetic choices still don't change the
  player sprite). Same standing sandbox limitation as the rest of the Overworld: verified by
  gate + `tileAtlas.test.ts`, not yet seen rendered in a real browser.

- **Motion polish + a real Hangar tie-in (2026-09-11), not yet on-device confirmed** — player
  step-hop + idle breathing, desynced creature idle bobs, and Soumaya's marker getting the same
  bob (the Bulletin Board correctly doesn't — it's a sign). Closed a real flagged gap: the
  Hangar's "Cosmic Trail" cosmetic now actually renders as a fading trail behind the player's
  footsteps (`ExteriorScene.ts`'s `readTrailColor`/`refreshTrailColor`), instead of only ever
  affecting a menu selection. Ship hull/figurine choices still have no visual effect (no 2D
  art to apply them to) — still flagged in `HangarOverlay.tsx`. Everything new is a no-op
  under `prefersReducedMotion()`. See `docs/overworld/roadmap.md`'s "Stage 2.6". Verified by
  gate + new tests, not yet seen rendered in a real browser.

- **Real playability fix from actual on-device feedback (2026-09-11)** — a phone screenshot
  (this session's first real on-device look) surfaced a genuine bug: the Phaser game had no
  Scale Manager config, so the canvas always rendered at a fixed 832x576 CSS px, cropping the
  visible map on any narrower phone and making movement look broken (the player was very often
  off in the unseen slice). Fixed with `Phaser.Scale.FIT` + a real CSS aspect-ratio box for it
  to scale into (`OverworldRoot.tsx`), plus `touch-action: none` on `TouchControls`. Also:
  emoji-only building labels replaced with readable text nameplates, and background music
  added (`lib/music.ts`, looping `public/ambient-loop.mp3` — a pre-existing, license-undocumented
  file left over from the deleted 3D galaxy, reused at the user's explicit direction after every
  reachable CC0 source turned out blocked and a from-scratch synthesized loop was rejected; see
  `docs/overworld/roadmap.md`'s "Stage 2.7"). Still needs on-device reconfirmation
  that the Scale Manager fix actually resolves the reported symptom — that's what actually
  caught this bug, so it's the standard to hold the fix to, not another guess from this sandbox.

- **Attendant NPCs + bounded creature roaming (2026-09-11), not yet on-device confirmed** —
  every building now has a couple of small NPCs pacing just outside it (reused already-sourced
  Tiny Dungeon art, one look per building), and creatures wander within a small "cage" of open
  neighbor tiles around their spawn rather than standing perfectly still or roaming the whole
  map — both purely decorative, both no-ops under `prefersReducedMotion()`. See
  `docs/overworld/roadmap.md`'s "Stage 2.8". Verified by `regionLayout.test.ts` + the full gate.

- **A second round of real feedback: input, camera, art, NPC substance (2026-09-11), not yet
  on-device confirmed** — (1) all 3 galaxy-era tracks restored + switchable, which also caught a
  real bug: `startMusicLoop()`'s "already playing" guard compared `currentUrl` to itself
  post-assignment, so track-switching silently no-opped; (2) hold-to-move for the touch D-pad
  (`InputBus.heldDirection`, polled by `update()` the same way keyboard state already was);
  (3) a genuine architecture change from `Phaser.Scale.FIT` (a fixed landscape aspect that
  forced letterboxing on portrait phones) to `Phaser.Scale.RESIZE` — the camera is now a real
  scrolling viewport sized to the actual device, not a shrunk picture of the whole map;
  (4) buildings capped with an actual roof (Kenney's own pre-made gable tiles, `buildingTileFrame`
  in tileAtlas.ts) instead of a flat wall row — which also fixed a latent bug where the 3
  south-row buildings (doors facing up, not down) were drawing the wrong wall tiles beside their
  doors; (5) attendants now flash a role-specific work icon (💰📖🧘✉️🔭🏋️📜🔧), not just pace.
  See `docs/overworld/roadmap.md`'s "Stage 2.9". Verified by new/updated tests (input, touch
  controls, music, `buildingTileFrame` against real building footprints, work icons) + the full
  gate (1051 server + 179 web tests). The camera rework especially needs on-device
  reconfirmation — it's real architecture, not a config tweak.

- **Real building illustrations, not a hand-assembled kit (2026-09-11), not yet on-device
  confirmed** — the roof fix above was still 3 copies of one small tile, which the user
  correctly called out as still "not appropriate." `buildingSprites.ts` now gives each
  building one complete pre-made illustration (house/hall/tower/lighthouse — the "Old stone
  buildings" CC0 pack, via github.com/Tiddybub/2d-assets), scaled to its footprint, loaded as
  its own texture outside `tileAtlas.ts`'s uniform grid. The now-dead wall/door/roof-kit code
  (`WallFamily`, `wallFamilyForIndex`, `buildingTileFrame`) was removed. See
  `docs/overworld/roadmap.md`'s "Stage 2.10" for the reused-art mapping (only 5 buildings exist
  in the sourced pack for 8 places) and the one known simplification (the illustrated door
  doesn't perfectly align with the walkable door tile on the 3 south-row buildings — every
  building's real entrance is still unambiguous via nameplate + glyph + attendant NPC). Verified
  by new `buildingSprites.test.ts` + the full gate.

- **Superseded by the Overworld deletion (2026-09-11).** Every entry that used to live here
  (Cinematic Intro, GalaxyViews Visibility, Link LOD, Observatory card squish, planets not lit,
  hub names stuck, nebula backdrop color, the Fly-billing-hold on-device-confirmation backlog,
  and others) described unconfirmed visual fixes to `Graph3D.tsx`/`App.tsx`/`RightDock.tsx` and
  their panel components — all now deleted. None of those fixes can be re-confirmed because the
  code they described no longer exists. Full history is preserved in git (`git log -p -- CLAUDE.md`
  before the deletion commit, or `docs/overworld/roadmap.md`'s own change log) if ever needed for
  context on a past decision. Current on-device-confirmation backlog is the Overworld entry above.


- Match the surrounding code's style and comment density (comments explain *why*).
- Don't add dependencies casually — prefer small, dependency-free solutions.
- Don't break the offline fallback path.
- Don't put model identifiers or secrets in committed files.
- Accessibility (non-negotiable, pure code): honor `prefers-reduced-motion` — new Overworld/UI motion
  must calm or pause under it — and never encode meaning in colour alone (pair it with shape/size/label).
