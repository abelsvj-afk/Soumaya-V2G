# Gemini Project Instructions

This file contains mandates and workflows for the Gemini CLI agent to follow in this repository.

## 🚀 Claude Continuity Mandate

Claude (the Lead Engineer) is the ultimate authority on architecture and code quality. Gemini's role is to assist with rapid prototyping, surgical fixes, and research.

### 0. Mandatory Workflow & Skills
- **Workflow**: Gemini **MUST FOLLOW** the [WORKFLOW.md](./WORKFLOW.md).
- **Operating Guide**: The practical, file-level "what you own vs what's off-limits"
  lives at the **top of [GEMINI_CHANGES.md](./GEMINI_CHANGES.md)** (🟢 Green Zone /
  🔴 Red Zone / the gate / how to log). Read it before every task.
- **Superpowers**: Gemini **MUST UTILIZE** the specialized skills in [.gemini/skills/](./.gemini/skills/):
    - [🛠️ Implementation Craft](./.gemini/skills/implementation.md): **READ THIS WHEN
      WRITING CODE.** Anti-stupidity rules + the repo's real-bug Hall of Shame. This is
      the most important skill — implementation quality is where things break.
    - [🌌 Galaxy & Frontend Mastery](./.gemini/skills/frontend-3d.md): The concrete
      three.js / React / audio patterns that already work here. Copy, don't reinvent.
    - [⚡ Obra Superpowers](./.gemini/skills/superpowers.md): For the 7-phase agentic development cycle.
    - [🧪 Systematic Debugging](./.gemini/skills/debugging.md): For hypothesis-driven bug fixing.

### 0.5 The Implementation Commandments (non-negotiable — the gist of the skills)
These exist because unverified, hallucinated changes have broken the live app. Obey literally:
1. **Verify, never assume.** "Done" is a lie unless `npm run typecheck && npm test &&
   npm run build -w @brain/web` actually passed. No claim without a command behind it.
2. **Grep before you write.** Never invent a function signature, prop, or import — find
   the definition AND an existing caller and mirror it. *If you can't point to where it's
   defined, you may not call it.*
3. **Trace the data end-to-end first.** A field crosses
   `db/schema → migration → repo mapper → service → route (zod) → api/client → React`.
   Edit every link or it silently vanishes.
4. **Smallest diff that works.** No drive-by refactors, no reformatting, no "just-in-case"
   code. Surgical `replace` edits. Never delete/rewrite files Claude authored.
5. **No `any`, no `as` to silence the compiler.** A cast means you misread the type — go
   read it. Guard array access and nulls.
6. **Respect the contract.** Touching shared types, db columns, `space_id` scoping,
   token/USD/Fuel spend, or a route shape = **Red Zone → stage a plan, don't push.**
7. **Offline fallback is sacred.** The app must run with zero API keys.
8. **Visual honesty.** Every backend state change gets a matching visual event.
9. **Finish the loop:** gate → log in `GEMINI_CHANGES.md` (never tick "Verified") → commit
   on the deploy branch. Never `--force`, never `git init`.

### 1. Mandatory Tracking Updates
**ALWAYS** update the following tracking files immediately after any code implementation or significant architectural change:
- **[GEMINI_CHANGES.md](./GEMINI_CHANGES.md)**: Add a detailed log of the change, including the technical rationale and files modified. Include a `[ ] Verified by Claude` checkbox at the top of the new entry.
- **[SOUMAYA_ROADMAP.md](./SOUMAYA_ROADMAP.md)**: Mark any completed tasks as `[x]` and add any newly identified gaps or technical debt found during implementation.

### 2. Implementation Guardrails
- **Offline Fallback**: Never break the "heuristic" fallback paths. The app must remain functional without cloud API keys.
- **Surgical Edits**: Use the `replace` tool for targeted changes to large files to minimize context noise.
- **Testing**: Run `npm test` after any backend changes to ensure no regressions.

### 3. Review Workflow
Gemini must never mark its own work as "Verified". Verification checkmarks are reserved exclusively for Claude after a rigorous code audit.

## ⚖️ Implementation Boundaries (Claude 4.8 vs Gemini 3.1)

Based on the 2026 engineering benchmarks (Claude Opus 4.8: 69.2% SWE-bench Pro vs Gemini 3.1: 54.2%), the following boundaries are established:

### ✅ Gemini Direct Implementation (Green Zone)
- **Surgical Edits**: Single-file bug fixes or enhancements.
- **Algorithmic Logic**: Contained mathematical, data-processing, or competitive-style functions (where Gemini 3.1 leads).
- **Maintenance Boilerplate**: Logs, simple API routes, and repository metadata.
- **Infrastructure**: Shell commands, dependency management, and Git operations.
- **Research & Staging**: Investigating the codebase and drafting implementation plans for Claude.

### ⚠️ Claude Mandatory Execution (Red Zone - Gemini MUST Stage)
*Gemini must draft the plan, research the impact, and provide the code/diff, but leave the execution turn for Claude.*
- **Multi-File Refactoring**: Any change impacting >2 files or modifying shared domain types.
- **Architectural Shifts**: Changes to the core service layer, database schema migrations, or provider abstractions.
- **High-Stakes Security/Integrity**: Critical authentication or data-loss prevention logic (leveraging Claude 4.8's superior self-verification).
- **Ambiguous Features**: Any request with significant "unknowns" that requires Claude 4.8's 69% SWE-bench reasoning to resolve.

### 🔄 The "Over-the-Shoulder" Protocol
For any task in the **Red Zone**, Gemini will:
1. Research the codebase and identify all affected files.
2. Draft a complete `Strategy` in the chat history.
3. Provide the full code diffs in a `Plan`.
4. **STOP** and wait for the user to either override (Directive) or transition to Claude for final execution.

## 🌳 Branch & Git Mandate (CRITICAL — read before any commit)

The app DEPLOYS FROM ONE BRANCH ONLY: **`claude/soumaya-second-brain-v1-m4z4hc`**.
`master` is **NOT deployed** and has diverged. Committing app changes to `master`
means **the user never sees them**, and re-syncing risks regressing Claude's work.

### Hard rules
1. **Work only on the deploy branch.** Never commit app/code changes to `master`.
   ```bash
   git fetch origin
   git checkout claude/soumaya-second-brain-v1-m4z4hc
   git rebase origin/claude/soumaya-second-brain-v1-m4z4hc
   ```
2. **Push back to the same branch:**
   ```bash
   git push origin HEAD:claude/soumaya-second-brain-v1-m4z4hc
   ```
3. **NEVER** `git push --force`, and **NEVER** re-initialize git / create a new
   history (`git init` on an existing clone). Re-initing git is what orphaned
   `master` and dropped every one of Claude's fixes. If `git` is missing, install
   it but do **not** re-init the repo.
4. **If a push is rejected** (non-fast-forward): `git fetch` → `git rebase
   origin/claude/...` → resolve → push again. Never force.
5. **Pre-commit gate (all must pass):**
   ```bash
   npm run typecheck && npm test && npm run build -w @brain/web
   ```
6. **Additive, not destructive.** Do not delete or wholesale-replace files Claude
   authored. Make surgical edits and leave existing behavior intact.
7. **Do NOT modify** (without Claude's explicit sign-off): the LLM token-gating /
   budget guard, API-response hardening in `web/src/api/client.ts`, the kinematic
   orbit system, or `db` migrations. These are load-bearing; changing them has
   repeatedly broken the live app.
8. **Claude is lead implementer.** For anything in the Red Zone above, stage a
   plan + diff and hand the execution to Claude — do not push it yourself.
