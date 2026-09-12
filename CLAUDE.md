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
