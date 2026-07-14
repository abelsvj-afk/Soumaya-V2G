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
   staged build sequence, open questions.
6. [decisions.md](./decisions.md) — resolves the architecture open questions (ADR-lite).
7. [ux-design.md](./ux-design.md) — Phase 4.5 **mobile-first** screens, flows, components, a11y.
8. [roadmap.md](./roadmap.md) — Phase 6/7 staged task breakdown; the suggested first PR.
9. [stage-4-galaxy-and-zero-based.md](./stage-4-galaxy-and-zero-based.md) — Stage 4 spec: money in
   the galaxy (bills/goals as STARS; cooling=blue state model), zero-based "give every dollar a
   job", and the honest Audit. **Design only — awaiting sign-off.**

**Shipped:** Stage 1a (engine + Safe-to-Spend + bills + manual), 1b (paste ingestion), 1c (vision +
coach nudge), 2 (chat Q&A snapshot), 3 (forecast) + edit/delete history + animated numbers.
**Next (spec'd, not built):** Stage 4 above.

**The design package is complete.** Remaining before code: the user's go-ahead (and any overrides to the
decisions). Implementation begins at **Stage 1a** (schema + repos + Budget Engine with tests — no UI/routes
yet), per the roadmap.
