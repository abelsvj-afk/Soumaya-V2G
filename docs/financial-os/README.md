# Financial OS — Design Package

**Status: DESIGN ONLY. No code exists or should be written until this package is reviewed + signed off**
(per [`docs/AI_ENGINEERING_WORKFLOW.md`](../AI_ENGINEERING_WORKFLOW.md) Rule #1: *no code until the
design/spec is complete*).

The **Financial OS** is the first life-management module layered onto Soumaya's existing knowledge/memory
engine — a screenshot-first, coaching-first personal cash-flow system for people with irregular income.
It reuses the platform's seams (space-scoped repositories, additive migrations, provider adapters with an
offline fallback, thin zod-validated routes, the tool-router, GraphRAG) rather than being a standalone
budgeting app.

Read in order:
1. [idea.md](./idea.md) — problem, core insight (AI does the data entry), MVP, non-goals.
2. [vision.md](./vision.md) — how it fits the broader "AI OS for your life"; module ecosystem.
3. [requirements.md](./requirements.md) — staged requirements (Stage 1 = MVP), inputs, bills, budget,
   coaching, forecasting, non-functionals.
4. [user-stories.md](./user-stories.md) — concrete scenarios + acceptance criteria.
5. [architecture.md](./architecture.md) — data model, OCR pipeline, Budget/Forecast engines, security,
   staged build sequence, open questions for sign-off.

**Next phases (not started):** Phase 4.5 `ux-design.md` (required before any screen is built) → Phase 6/7
roadmap + task generation → implementation, Stage 1 first.
