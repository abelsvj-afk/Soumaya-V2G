# Post-MVP — Phase 4: AI Engineering & Validation

**Owner:** Claude · **Date:** 2026-07-10 · **Workflow:** [`AI_ENGINEERING_WORKFLOW_POST_MVP.md`](./AI_ENGINEERING_WORKFLOW_POST_MVP.md)
· **Zone:** 🟢 Green (validation + measurement)

> AI software is validated for **functionality *and* intelligence**. This records what we can
> measure **offline** (the heuristic path — guarantees that hold with no API key) vs. what must be
> validated **live** (cloud-model answer *quality*). New measured tests live in
> `packages/server/src/__tests__/aiValidation.test.ts`.

## Phase 13 — AI Validation (behavioural)

| Property | How it's validated | Status |
|---|---|---|
| **Tool selection** | The tool-router is deterministic-first (each tool's `detect()`), LLM-curated second; `tools.test.ts` + `review.test.ts` prove each tool fires only on its real trigger, once/day, and the curation suppresses correctly. | 🟢 tested |
| **Context/continuity** | `chat()` threads recent turns + `justAsked` guard; `api.test.ts` covers thread-carry + emotional register offline. | 🟢 tested |
| **Consistency** | Deterministic offline path → identical output for identical input (no `Math.random`/wall-clock in the analysis core). | 🟢 by design |

## Phase 14 — Memory Validation

- **Creation / retrieval / deletion** — covered by repo + `api.test.ts`.
- **Consistency (measured, new):** deleting a memory leaves **no dangling edges, insights,
  attachments, vector rows, or FTS rows** — the delete transaction cascades all five, proven in
  `aiValidation.test.ts`. This is the "no broken references / no orphan records" guarantee.
- **Dedup** — `dedup.test.ts` + the free `sweepDuplicates` (true-merge, nothing lost).

## Phase 15 — Prompt Validation

- Prompts are centralised in `llm/prompts.ts` (single source; effectively versioned via git).
- The **offline heuristic is the always-available fallback** for every LLM method, so a prompt
  regression can never take the product down — it degrades, it doesn't break.
- **Gap (documented):** no automated cross-model prompt-regression harness (needs a live key + cost).
  Deferred to live validation; the offline contracts (schemas, fallbacks) are what tests can pin.

## Phase 16 — Retrieval Validation (measured)

- **Hybrid retrieval** = vector KNN fused with BM25 keyword hits via RRF (`hybridSearch.test.ts`
  covers fusion determinism, keyword exactness, space-scoping, injection-safety, FTS-follows-delete).
- **Ranking quality (new):** `aiValidation.test.ts` measures **precision@1 = 1** — the memory that
  names the query term ranks first in keyword search, and vector KNN returns the nearest memory to a
  semantically-close query. Space-scoped, so retrieval never crosses brains (audited in Phase 3).

## Phase 17 — Hallucination Reduction (measured)

- **Grounding guarantee (new, tested):** `chat()` builds citations only from the retrieved subgraph
  (`validCitations` filters against `ctxNodes`), so **every citation the AI returns is a real
  memory — never invented**, and an unanswerable question yields no fabricated citations. Proven in
  `aiValidation.test.ts` on the offline path.
- The heuristic answers from retrieved context and says so when the brain lacks the answer, rather
  than bluffing; the interview-instinct asks a grounded question instead of guessing.

## Phase 18 — Cost Optimization

- **Model routing** exists: free/offline heuristic for core upkeep; cloud LLM only for
  discretionary work (research, sector charting, web-lookup) gated by **Research Mode + USD budget
  + Fuel**. Per-tick cloud-job ceiling across all brains prevents bursts.
- **Budget meter** (`usage.ts`) tracks deployment-wide USD spend and trips `overBudget()` →
  everything degrades to the heuristic. The tool-router's LLM curation is itself budget-gated.
- **Caching/reuse:** retrieval is deterministic; the offline path transmits no tokens.
- **Gap (documented):** no per-feature token-cost dashboard; the budget meter is the aggregate control.

## Exit criteria (Phase 4)

| Criterion | Status |
|---|---|
| Memory retrieval reliable | 🟢 measured (ranking + grounding + consistency) |
| Prompt library validated | 🟡 offline contracts pinned; live cross-model harness deferred |
| Hallucinations minimized | 🟢 grounding guarantee tested |
| AI workflows repeatable | 🟢 deterministic offline core |
| Model routing defined | 🟢 (heuristic ↔ cloud, budget-gated) |
| Operational costs understood | 🟢 budget meter; 🟡 no per-feature breakdown |
| Multi-agent collaboration documented | 🟢 `AGENTS.md` + `AI_ENGINEERING_WORKFLOW_POST_MVP.md` |

**Verdict:** the offline guarantees (grounding, retrieval ranking, memory consistency, budget
degradation) are now **measured and pinned by tests**. The remaining gaps (cross-model prompt
regression, per-feature cost breakdown) require a live key + spend and are deferred to live
validation — they don't block product readiness.
