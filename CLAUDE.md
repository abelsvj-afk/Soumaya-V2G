# CLAUDE.md

**MANDATORY**: Refer to [GEMINI_CHANGES.md](./GEMINI_CHANGES.md) for all modifications, asset additions, and infrastructure changes made by the second agent (Antigravity CLI / `agy`), to ensure continuity between agents. The second agent's own mandates + green/red zones live in [AGENTS.md](./AGENTS.md) (the file `agy` auto-loads).

Guidance for working in this repo. Read this before making changes.

## What this is

**Soumaya · Second Brain** — a personal knowledge graph you talk to. You dump raw
thoughts; the system extracts typed nodes + relationships, embeds them, links them
associatively, and renders them as a navigable 3D **galaxy** where memories are
celestial bodies with real gravitational mass.

Signature features: **associative auto-linking**, **synthesis digest** (surfaces
latent connections), **chat-with-your-brain** (GraphRAG with cited answers), and
the **celestial galaxy UI**.

## Monorepo layout (npm workspaces)

- `packages/shared` — domain types + zod schemas + celestial mechanics. The single
  source of truth shared by server and web. Changes here ripple both ways.
- `packages/server` — Express API, SQLite + sqlite-vec, ingestion pipeline, LLM
  providers, graph/synthesis/chat services. Runs TypeScript directly via `tsx`.
- `packages/web` — Vite + React + react-force-graph-3d (three.js) galaxy client.

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

## Celestial mass model (the galaxy physics)

`shared/celestial.ts` is the heart of the visual system:

- Each memory has an **importance** (0..1, rated by the LLM at ingestion; the
  heuristic provider scores it from weighty vocabulary + length).
- `deriveMass({ importance, degree, emotionalWeight })` blends significance,
  connectedness, and emotional charge into a **0..1 mass**.
- `classify(mass)` → 6 tiers: `asteroid | moon | planet | giant | star | supergiant`.
- The **graph service enriches nodes on read** with `degree`, `mass`, `val`, and
  `celestial` — never denormalize these into the table.
- Frontend motion is **kinematic** (`graph/orbits.ts`), not a force sim: each body
  orbits its heaviest connected neighbor on a fixed path (pinned via fx/fy/fz), so
  it never collapses. `orbits.getDescendants(id)` powers the "isolate system" view.
- Agents/assets (`graph/soumaya.ts` ship, `graph/spaceStation.ts`) are glTF models
  in `packages/web/public/*.glb` with procedural fallbacks; the autonomous agent
  loop hits `/api/maintenance/*` and is **token-gated behind Research Mode**.

When adding signals that should affect gravity, fold them into `deriveMass` so
both rendering and physics stay consistent.

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
  across many `components/*` or `graph/*` files, batch asset/CSS work.
- **Browser-based visual QA** — load the app, click through the galaxy, screenshot, record
  a `.webm` walkthrough, run a UX/design review. (Far cheaper than Claude reasoning about
  whether a visual change "probably" works.)
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
`db/*` schema + migrations, `graph/orbits.ts`, `web/src/api/client.ts`, the token/USD/Fuel
guards, `space_id` multi-tenancy scoping, route contracts — plus architecture decisions,
ambiguous/underspecified features, security/data-integrity, and the **final audit +
"Verified by Claude" checkmark**. Review `agy`'s pushes before ticking that box.

Both agents share the **same gate**, the **same deploy branch**
(`claude/soumaya-second-brain-v1-m4z4hc`), and the **same change log** (`GEMINI_CHANGES.md`).

## Verify before you build (and before you claim it works)

The gate (`typecheck && test && build`) proves code *compiles*, not that it *behaves*. Two
standards, learned the hard way (shipping "the code should spread the bodies" fixes that didn't):

1. **Prove behavior by reproduction/measurement, not assertion.** Before changing logic — especially
   visual/spatial/numeric code you can't see rendered from here (`graph/orbits.ts`, `shared/celestial.ts`,
   layout/mass math) — first *reproduce and measure* it: `npx tsx` a throwaway script that feeds real or
   synthetic data through the actual functions and prints the numbers (e.g. run `makeOrbitSystem` over
   `makeDemoGalaxy` + a single-cluster graph and assert min nearest-neighbour distance / 0 overlaps), or
   add a unit test. Decide the fix from the measured output, not from reading the code. State the
   measurement in your summary.
2. **Rule out delivery (stale deploy / PWA service-worker / cache) before re-editing correct code.** When
   "it didn't change," first confirm the new build is what's actually rendering (Actions is blocked → a
   `fly deploy` must run; the service worker can serve old cached JS even on a fresh server). Never "fix"
   code that measurement shows is already correct to chase a deploy/cache problem.

## House rules

- Match the surrounding code's style and comment density (comments explain *why*).
- Don't add dependencies casually — prefer small, dependency-free solutions.
- Don't break the offline fallback path.
- Don't put model identifiers or secrets in committed files.
