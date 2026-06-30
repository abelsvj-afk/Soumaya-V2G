# Spec — Research-Agent Add-on Modules (triage + adaptation)

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md). Status: **DESIGN /
> triage — awaiting a build decision.** Source: an external proposal authored *without* project
> context. This doc maps each of its 12 modules onto what Soumaya already has, flags one
> philosophical conflict, and adapts the genuinely-new parts to our existing seams.

## How to read the verdicts
- 🟢 **Have** — already implemented; the proposal reinvents it. No work, or a small polish.
- 🟡 **Enhance** — partially exists; a bounded upgrade fits cleanly.
- 🔵 **New** — genuinely missing, aligned, worth building.
- 🔴 **Reframe/Conflict** — as written it fights the project's design; adopt only as an *optional lens*.

All work must honor the standing guardrails: **offline-safe** (heuristic fallback, never hard-depend
on a cloud key), **token/Fuel-gated** (LLM passes go through `selectJob`/`ResilientLlmProvider`),
**space-scoped** (`space_id`), and **additive idempotent migrations**.

## Triage of the 12 modules

| # | Proposal | Verdict | Reality in this codebase / what to actually do |
|---|----------|---------|------------------------------------------------|
| 1 | Memory Object Standardization | 🟢 Have | Ingestion already emits structured typed nodes: `id`, `createdAt`/`occurredAt`, `type` (`NodeType`), `importance`, `emotionalWeight`, `tags`, content + a real embedding (`vec_nodes`). Only genuinely missing field is a stored 1-line **`summary`** (today the label/content serve it). Optional tiny add: a `summary` column (additive). |
| 2 | Research Decision Engine v2 (scored) | 🟡 Enhance | `selectJob` already gates research on Research Mode + USD budget + Fuel + `importance≥0.45`. The *scored* model (emotion/contradiction/pattern/identity → threshold) is a worthwhile upgrade — fold it into `selectJobInner` as a **priority score**, not a parallel engine. |
| 3 | Memory Conflict Detection | 🔵 **New** | We synthesize *connections*, never *contradictions*. High value: a new maintenance job type `contradiction` that flags belief/goal/identity conflicts, stores both node ids + a reconciliation hypothesis. Reuses the `insights` table shape. **Top pick.** |
| 4 | Latent / Dormant Skill Recovery | 🔵 New | Adjacent to entropy (cooling) + the "🪐 drifting" orphan lint, but the "dormant skill/goal" framing is new. A periodic scan: high-past-`importance` nodes of type `decision`/`concept` with no recent tend/mention → "Reactivation opportunity" insight. |
| 5 | Emotional Pattern Engine | 🔵 New | `emotionalWeight` exists per node but nothing tracks **trajectory** (stress cycles, burnout loops). New: a server analysis over time-ordered `emotionalWeight` per cluster/tag → cycle type + trigger + suggested intervention. Surfaces in the Insights/digest. |
| 6 | Fixed clusters (Identity/Survival/Money…) | 🔴 **Conflict** | The product's whole thesis is **emergent associative clustering** ("organized by association, not folder structures" — our own UI copy) via `ml/cluster.ts` spherical k-means + MOC hubs. Imposing 8 fixed life-buckets contradicts that. **Adapt, don't adopt:** offer them as an optional **life-area *lens*** layered on the existing `SUGGESTED_TAGS` (Work/Health/Money/People/Learning…) — a filter/overlay, never the storage model. |
| 7 | Insight Compression (≤5, actionable) | 🟡 Enhance | We have `insights` + synthesis text. Add a **cap + style rule** to the synthesis/digest prompt (≤5 per packet; actionable|reflective|predictive; no filler). Prompt-level, low-risk. |
| 8 | Cross-Memory Linking Engine | 🟡 Enhance | Associative auto-linking by embedding similarity + typed weighted edges already ships. Missing = **temporal/behavioral chains** (goal-evolution, identity-drift over time). Add a `RelationshipType` like `evolves_into` + a temporal-distance-aware linker. The "link strength + reason + temporal distance" output maps to existing edge `weight` + a `reason`. |
| 9 | "No Research Zone" | 🟢 Have | `selectJob` already skips trivial/low-importance nodes and returns free local jobs when Research Mode is off (and we just hardened `executeJob` to re-gate). The explicit "Memory stored, no research needed" line is a tiny UX string we can surface on ingest. |
| 10 | Insight Prioritization Tiers | 🟡 Enhance | `insights.score` exists. Add a `tier` (identity / behavioral / situational) derived from the source nodes' type+emotion, and default the digest to Tier 1–2. Small. |
| 11 | Memory Retrieval Index | 🟢 Have | `vec_nodes` (knn semantic search) + `tags` + cluster/constellation membership already are the index. Optional: store `search_keywords` for keyword fallback. Mostly done. |
| 12 | System Self-Improvement Loop | 🔵 New (caution) | A per-session meta-eval ("did I over-research / miss links / mis-cluster?") that re-weights future logic. Interesting but **speculative + token-hungry**; must be heuristic-first and Fuel-gated, and risks instability. Defer behind the others. |

## Net assessment
- **Already in the product:** #1, #9, #11 (≈3) — the proposal didn't know we had these.
- **Cheap enhancements to existing seams:** #2, #7, #8, #10 (≈4) — mostly prompt/scoring/edge tweaks.
- **Genuinely new, aligned, high-value:** #3 (contradiction detection), #5 (emotional trajectory), #4 (dormant recovery) — these are the real additions.
- **Don't adopt as-written:** #6 (fixed clusters) — reframe as an optional life-area lens only.
- **Defer:** #12 (self-improvement loop).

## Recommended build order (each gated: spec → implement → test → review)
1. **Conflict/Contradiction detection (#3)** — biggest net-new insight value; reuses the `insights`
   table + a new `contradiction` job type in the maintenance ladder; heuristic fallback = simple
   negation/goal-delta detection, LLM path = richer reconciliation hypothesis.
2. **Emotional trajectory (#5)** — turns the already-stored `emotionalWeight` into cycle insights.
3. **Scored research priority (#2)** — fold the scoring model into `selectJobInner`.
4. **Dormant recovery (#4)** + **temporal linking chains (#8)** — pattern-over-time layer.
5. Polish: insight compression (#7) + tiers (#10) + the "no research needed" string (#9).
6. Optional later: life-area lens (#6, reframed) and the self-improvement loop (#12).

## Open questions for the user
- Which slice first? (Recommend **#3 contradiction detection**.)
- For #6: confirm we keep emergent clustering as the storage model and only add life-areas as an
  optional overlay (not fixed buckets).
- Appetite for the meta self-improvement loop (#12) given its token cost?
