# 🛰️ Agentic Monorepo Workflow (v1.0)

This is the **MANDATORY** development cycle for the Soumaya repository. It is designed to minimize "vibe coding" and maximize architectural integrity using a **Spec-First, Human-Verified** approach.

## 1. The Development Cycle

### 🟢 Phase A: The Spec (Research & Strategy)
- **Goal:** Define *Intent* before writing a single line of code.
- **Action:** 
    1. Agent researches the "blast radius" (affected files/dependencies).
    2. Agent drafts a **Technical Spec** in the chat including:
        - 🎯 **Objective**: What are we solving?
        - 📐 **Architecture**: Which shared types or services are changing?
        - 🧪 **Test Plan**: How will we prove it works *before* merging?
    3. **Human Approval**: The user must acknowledge the Spec before proceeding.

### 🟡 Phase B: Execution (Atomic Implementation)
- **Goal:** Symmetrically update all packages in the monorepo.
- **Action:**
    1. **Shared First**: Update `packages/shared` types/schemas.
    2. **Backend/Frontend Sibling Update**: Implement the change in `packages/server` and `packages/web` in the same turn or sequential turns.
    3. **No "Just-in-Case" Code**: Implement only what is in the Spec.

### 🔴 Phase C: Verification (The Hand-off)
- **Goal:** Prove correctness and hand off for lead-engineer audit.
- **Action:**
    1. **Validation**: Run `npm test` and `npm run build`.
    2. **Update Tracking**: Log the change in `GEMINI_CHANGES.md` with an empty `[ ] Verified by Claude` checkbox.
    3. **Roadmap Sync**: Update `SOUMAYA_ROADMAP.md` status.

---

## 🛠️ Tool-Specific Translations

### 🟦 For the IDE (VS Code / Cursor)
- **Structure**: Respect the 3-tier monorepo (`shared` -> `server` -> `web`).
- **Context**: Use `@ANTIGRAVITY.md` and `@CLAUDE.md` as permanent context pins.

### 🟧 For Claude (The Lead Engineer)
- **Role**: Auditor and Architect.
- **Rule**: Never trust the second agent's (`agy`) implementation without checking for "Red Zone" pitfalls (logic errors, schema desync).
- **Action**: Only check the `Verified` box once the **Test Plan** from the Spec passes. Delegate green-zone/mechanical/visual-QA/research work to `agy` (MCP bridge or GitHub) instead of spending Claude's tokens on it — see `CLAUDE.md` → "Agent delegation".

### 🌌 For Antigravity CLI (`agy`, the second agent — replaces Gemini CLI)
- **Role**: Researcher + Executor + Continuous-Verification layer.
- **Rule**: Follow the "Over-the-Shoulder" protocol for all Red Zone tasks; always generate the **Technical Spec** before touching `packages/shared`.
- **Superpowers**: parallel subagents for mechanical refactors/research, and the browser subagent for real visual QA (screenshots / `.webm` walkthroughs) — see `ANTIGRAVITY.md`.
- **Action**: Block/flag commits that aren't logged in `GEMINI_CHANGES.md` or that break the shared-type contracts.

---

## 📏 Repository Structure Rules
1. **Shared Truth**: All domain logic and Zod schemas **MUST** live in `packages/shared`. No duplicates in server/web.
2. **Atomic Logic**: Services (`packages/server/src/services`) must be stateless where possible, relying on Repositories for data.
3. **Visual Honesty**: Any backend state change (maintenance, fusion) **MUST** have a corresponding visual event in the 3D galaxy.
