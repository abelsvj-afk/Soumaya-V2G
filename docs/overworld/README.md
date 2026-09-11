# Soumaya Overworld — Design Package

**Status: DESIGN COMPLETE, awaiting user sign-off.** Per
[`docs/AI_ENGINEERING_WORKFLOW.md`](../AI_ENGINEERING_WORKFLOW.md) Rule #1: no implementation
code is written until this package is reviewed and approved. Once approved, implementation begins
at Stage 1 / the first suggested PR in [roadmap.md](./roadmap.md) — engine shell + adapter layer,
fully unit-tested, no scene wiring yet.

**Soumaya Overworld** replaces the 3D galaxy presentation layer with a 2D, GBA/SNES-era
Pokémon-style top-down world — same knowledge graph, completely different skin. Every current
dock tab (Details, Browse, Mind, Agenda, Insights, Soumaya, Inbox, Progress, Journeys, Money,
Hangar) becomes a place or NPC you walk to; there is no dock. `packages/shared` and
`packages/server` are untouched by the vertical slice (confirmed possible — see
[decisions.md](./decisions.md) D8/D9).

Read in order:
1. [idea.md](./idea.md) — problem, why a spatial overworld, MVP scope, non-goals.
2. [vision.md](./vision.md) — how this serves the product's own north star docs.
3. [requirements.md](./requirements.md) — staged functional + non-functional requirements.
4. [user-stories.md](./user-stories.md) — concrete scenarios + acceptance criteria for Stage 1.
5. [architecture.md](./architecture.md) — source layout, the adapter layer, data flow, test plan.
6. [decisions.md](./decisions.md) — resolves the build brief's open questions (ADR-lite),
   including the 4 answered directly by the user (full replacement, real-time movement, no
   combat, literal ship travel) and engineering choices found while researching the real codebase.
7. [ux-design.md](./ux-design.md) — Phase 4.5 screens, states, component inventory, a11y baseline.
8. [roadmap.md](./roadmap.md) — staged task breakdown; the suggested first PR.
9. [pokemon-reference.md](./pokemon-reference.md) — internal reference notes on what's borrowed
   from the Pokémon GBA repos vs. implemented differently, and the domain-boundary rules that must
   never blur.

**Key finding worth flagging up front**: the vertical slice needs **zero changes** to
`packages/shared` or `packages/server`. The exact mechanic the brief asks for — dimming +
greet-to-revisit — already exists end-to-end (`GraphNode.entropy`, `COOLING_ENTROPY` threshold,
`POST /api/nodes/:id/tend`), and the Money region's data need (`GET /api/finance/sky`,
`GET /api/finance/summary`) already returns exactly the shape a Bank building needs. This is a
pure presentation-layer project for Stage 1, which is why it's scoped as additive rather than a
disruptive rewrite despite "full replacement" being the confirmed end state.

**Next step**: user reviews/approves this package (or requests changes) before any implementation
code is written, per the workflow's Phase A human-approval gate.
