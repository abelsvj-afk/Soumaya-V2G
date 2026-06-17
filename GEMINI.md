# Gemini Project Instructions

This file contains mandates and workflows for the Gemini CLI agent to follow in this repository.

## 🚀 Claude Continuity Mandate

Claude (the Lead Engineer) is the ultimate authority on architecture and code quality. Gemini's role is to assist with rapid prototyping, surgical fixes, and research.

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
