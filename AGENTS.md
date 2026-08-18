# Agent Instructions — Antigravity CLI (`agy`)

**This is the canonical instruction file for the second agent.** `agy` auto-loads
`AGENTS.md` (and `GEMINI.md`) on startup — so the real mandates live here. `GEMINI.md`
and `ANTIGRAVITY.md` are redirect stubs that point at this file. Claude's own guidance
is in [CLAUDE.md](./CLAUDE.md); the shared change log is [GEMINI_CHANGES.md](./GEMINI_CHANGES.md)
(kept under that name for continuity).

> **What `agy` is:** the Go-based successor to Gemini CLI — fast cold starts, low memory,
> fully headless/SSH-friendly (great on **Termux / mobile**). It ships **async parallel
> subagents**, a **built-in browser subagent** (headless Chrome over MCP) for real
> end-to-end visual QA, research/doc-conversion **slash commands**, and an **MCP bridge**
> so Claude can delegate heavy work to it. Default model is **Gemini 3.5 Flash (High)**;
> **Gemini 3 Pro / Claude Sonnet 4.5 / GPT-OSS** are selectable for harder reasoning.

## 🚀 Claude Continuity Mandate

Claude (the Lead Engineer) is the ultimate authority on architecture and code quality.
`agy`'s role is **fast, surgical, visually-rich frontend work + research + verification
evidence** that keeps the gate green and never destabilizes the load-bearing systems.

### 0. Mandatory Workflow & Skills
- **Workflow**: follow [WORKFLOW.md](./WORKFLOW.md).
- **Operating Guide**: the practical, file-level "what you own vs what's off-limits"
  lives at the **top of [GEMINI_CHANGES.md](./GEMINI_CHANGES.md)** (🟢 Green Zone /
  🔴 Red Zone / the gate / how to log). Read it before every task.
- **Superpowers**: use the specialized skills in [.gemini/skills/](./.gemini/skills/):
    - [🛠️ Implementation Craft](./.gemini/skills/implementation.md): **READ THIS WHEN
      WRITING CODE.** Anti-stupidity rules + the repo's real-bug Hall of Shame.
    - [🌌 Galaxy & Frontend Mastery](./.gemini/skills/frontend-3d.md): concrete
      three.js / React / audio patterns that already work here. Copy, don't reinvent.
    - [⚡ Obra Superpowers](./.gemini/skills/superpowers.md) · [🧪 Systematic Debugging](./.gemini/skills/debugging.md).

### 0.5 The Implementation Commandments (non-negotiable)
These exist because unverified, hallucinated changes have broken the live app. Obey literally:
1. **Verify, never assume.** "Done" is a lie unless `npm run typecheck && npm test &&
   npm run build -w @brain/web` actually passed. No claim without a command behind it.
2. **Grep before you write.** Never invent a function signature, prop, or import — find
   the definition AND an existing caller and mirror it.
3. **Trace the data end-to-end first.** A field crosses
   `db/schema → migration → repo mapper → service → route (zod) → api/client → React`.
   Edit every link or it silently vanishes.
4. **Smallest diff that works.** No drive-by refactors. Surgical edits. Never
   delete/rewrite files Claude authored.
5. **No `any`, no `as` to silence the compiler.** A cast means you misread the type.
6. **Respect the contract.** Touching shared types, db columns, `space_id` scoping,
   token/USD/Fuel spend, or a route shape = **Red Zone → stage a plan, don't push.**
7. **Offline fallback is sacred.** The app must run with zero API keys.
8. **Visual honesty.** Every backend state change gets a matching visual event — and now
   you can **prove it** with the browser subagent (screenshot / `.webm` walkthrough).
9. **Finish the loop:** gate → log in `GEMINI_CHANGES.md` (never tick "Verified") → commit
   on the deploy branch. Never `--force`, never `git init`.

### 1. Mandatory Tracking Updates
**ALWAYS** update after any implementation or significant change:
- **[GEMINI_CHANGES.md](./GEMINI_CHANGES.md)**: A detailed log entry (rationale + files), with a `[ ] Verified by Claude` checkbox at the top of the new entry.
- **[SOUMAYA_ROADMAP.md](./SOUMAYA_ROADMAP.md)**: Mark completed `[x]`; note new gaps.
- **Commit/Push Protocol:** Immediately upon `git commit` and `git push`, the agent MUST:
    1. Compare current state with the previous commit to generate a summary.
    2. Log the changes into `GEMINI_CHANGES.md` (following the existing format).
    3. Ensure all new features, tabs, or functionality include required observability (middleware/guardrails, error boundaries, diagnostic logging).

### 2. Review Workflow
`agy` must **never** mark its own work as "Verified". The ✅ is reserved for Claude after
a rigorous audit.

## ⚖️ Implementation Boundaries (Claude vs Antigravity CLI)

Claude leads architecture, contracts, and final verification. `agy` executes fast,
parallel, well-scoped work and gathers evidence. Pick the model to match the task:
**Gemini 3.5 Flash (High)** for routine/agentic/visual work (cheap + fast), bump to
**Gemini 3 Pro / Claude Sonnet 4.5** only for genuinely hard reasoning.

### ✅ `agy` Direct Implementation (Green Zone)
Make real changes here, no permission needed beyond the gate + log:
- **Surgical edits** — single-file bug fixes / enhancements in the green-zone files
  (`packages/web/src/graph/*` except `orbits.ts`, `components/*`, `index.css`,
  `graph/lore.ts`, `graph/objectLore.ts`, in-character copy/help text).
- **Self-contained algorithms** — pure helpers with no schema/contract impact.
- **Maintenance boilerplate** — logs, copy, repo metadata, docs.
- **Infrastructure** — shell, deps (sparingly), git on the deploy branch.
- **Research & staging** — investigate the codebase, draft plans/diffs for Claude.

### 🆕 New Green-Zone superpowers (use these — Gemini CLI couldn't)
- **Browser-subagent visual QA (huge for this 3D app)** — *only where a headless Chrome is
  available.* ⚠️ **It does NOT run on the user's Termux (android-arm64): no compatible headless
  Chrome there (confirmed 2026-06-21, issue #10), so the browser subagent can't capture the galaxy
  on the phone.** Use it from a desktop/CI context; on Termux, fall back to a desktop browser or the
  USER for live visual checks, and verify behavior by **headless reproduction/measurement** instead
  (e.g. `npx tsx` over `orbits.ts`/`celestial.ts` and assert the numbers). When it IS available:
  spin it up against local dev (`npm run dev`) or the deployed URL, click through the galaxy, and
  **prove a visual change renders** (screenshots + `.webm`). Either way, never "verify" visuals by
  re-describing the code — that's not proof.
- **Parallel / async subagents.** Fan out well-specified mechanical work (rename a CSS
  class everywhere, apply one pattern across many components, batch-process assets) and
  multi-topic research in the background while the main session keeps moving. Reserve
  this for **mechanical, low-ambiguity** changes — anything touching contracts is Red.
- **Research & doc ingestion slash commands.** Web research with citations; convert
  URL / PDF / docx / image → Markdown to feed the knowledge-doc RAG; "code rescue" for a
  broken build; health check. Great for filling `ASSETS_NEEDED.md` / docs.
- **Termux / headless ops.** Being a low-overhead Go binary, run the full gate, git, and
  batch edits comfortably on mobile. Use `-p`/`--print` headless mode for scripted runs;
  keep `--sandbox` on for anything you don't fully trust.

### ⚠️ Claude Mandatory Execution (Red Zone — `agy` MUST stage, not push)
*Draft the plan, research impact, provide the diff — leave the execution to Claude.*
- **Multi-file refactoring** impacting >2 files or shared domain types.
- **Architectural shifts** — core service layer, **db schema migrations**, provider seams.
- **High-stakes integrity** — auth, `space_id` scoping, token/USD/Fuel guards, data-loss paths.
- **Ambiguous features** with significant unknowns.

### 🔄 The "Over-the-Shoulder" Protocol (Red Zone)
1. Research the codebase; identify all affected files.
2. Draft a complete `Strategy`. 3. Provide full diffs in a `Plan`.
4. **STOP** and hand the execution turn to Claude (or wait for a user Directive).

## 🤝 Working with Claude (delegation goes both ways)
- Claude may **delegate** green-zone, mechanical, or evidence-gathering tasks to you via
  the **MCP bridge** (Claude calls `agy` as an MCP server) or via **GitHub** (a crisp
  issue/PR task). Both of you have repo access. Pick up clearly-scoped GitHub tasks,
  push to the deploy branch, and report back.
- When Claude hands you a task, treat its spec as authoritative; if you hit a Red-Zone
  edge mid-task, stop and stage rather than improvising across the contract.

## 🔌 MCP servers `agy` can call (reverse bridge)

The repo ships [`.agents/mcp_config.json`](./.agents/mcp_config.json) — `agy`'s **workspace**
MCP config — giving your subagents outbound tools. Currently it registers the **GitHub MCP
server** (structured PR/issue/repo tools), since both agents have GitHub access.

**Activate it (one-time, on Termux/laptop):**
1. Install the server binary: `go install github.com/github/github-mcp-server/cmd/github-mcp-server@latest`
   (or grab a release) so `github-mcp-server` is on `PATH`.
2. Export a token in the shell that launches `agy` (it's inherited by the spawned server —
   **never commit it**): `export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_…`
3. In `agy`, run `/mcp` to confirm `github` is connected.

**Known caveat ([antigravity-cli#60](https://github.com/google-antigravity/antigravity-cli/issues/60)):**
project-local MCP config can be read-but-ignored; only the HOME-level config reliably loads.
If `/mcp` doesn't list `github`, install it globally:
`mkdir -p ~/.gemini/config && cp .agents/mcp_config.json ~/.gemini/config/mcp_config.json`

**Add more servers** by extending the `mcpServers` object (stdio `command`/`args`, or an HTTP
`serverUrl` + `headers`). Keep secrets in env/HOME-level config, not in the committed file.

> This is the **inbound** counterpart to the **outbound** Claude→`agy` bridge in
> [`.mcp.json`](./.mcp.json) (`agy-bridge`): `.mcp.json` lets Claude call `agy`;
> `.agents/mcp_config.json` lets `agy` call other tools.

## 🌳 Branch & Git Mandate (CRITICAL — read before any commit)

The app DEPLOYS FROM ONE BRANCH ONLY: **`claude/soumaya-second-brain-v1-m4z4hc`**.
`master` is **NOT deployed** and has diverged.

1. **Work only on the deploy branch.** Never commit app/code changes to `master`.
   ```bash
   git fetch origin
   git checkout claude/soumaya-second-brain-v1-m4z4hc
   git rebase origin/claude/soumaya-second-brain-v1-m4z4hc
   ```
2. **Push back to the same branch:** `git push origin HEAD:claude/soumaya-second-brain-v1-m4z4hc`
3. **NEVER** `git push --force`; **NEVER** `git init` / re-create history on this clone
   (that orphaned `master` and dropped Claude's fixes once already).
4. **Rejected push** (non-fast-forward): `git fetch` → `git rebase origin/claude/...` →
   resolve → push again. Never force.
5. **Pre-commit gate (all must pass):** `npm run typecheck && npm test && npm run build -w @brain/web`
6. **Additive, not destructive.** Surgical edits; don't wholesale-replace Claude's files.
7. **Do NOT modify without Claude's sign-off:** the LLM token/budget guard, the hardened
   fetch wrapper (`web/src/api/client.ts`), the kinematic orbit system (`graph/orbits.ts`),
   or `db` migrations. These are load-bearing.
8. **Claude is lead implementer.** For anything Red Zone, stage a plan + diff and hand
   execution to Claude — do not push it yourself.
