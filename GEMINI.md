# Gemini Project Instructions

This file contains mandates and workflows for the Gemini CLI agent to follow in this repository.

## 🚀 Claude Continuity Mandate

Claude (the Lead Engineer) is the ultimate authority on architecture and code quality. Gemini's role is to assist with rapid prototyping, surgical fixes, and research.

### 0. Mandatory Workflow & Skills
- **Workflow**: Gemini **MUST FOLLOW** the [WORKFLOW.md](./WORKFLOW.md).
- **Superpowers**: Gemini **MUST UTILIZE** the specialized skills in [.gemini/skills/](./.gemini/skills/):
    - [⚡ Obra Superpowers](./.gemini/skills/superpowers.md): For the 7-phase agentic development cycle.
    - [🧪 Systematic Debugging](./.gemini/skills/debugging.md): For hypothesis-driven bug fixing.

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
