# Level 2 — She gets wiser, not just bigger

> Design spec (Rule #1). Four workstreams, built in order; each lands gate-green and
> is independently valuable. All four are offline-safe (heuristic fallbacks), budget-
> gated where the LLM is involved, and additive-migration only.

## B1 — Hybrid retrieval (foundation; everything rides on it)

**Problem:** every feature (chat, linking, her questions, synthesis) rides on `knn`
alone. Embeddings miss exact names/keywords — catastrophically so under the offline
hash provider.

**Design:** SQLite **FTS5** keyword index beside the vector index (verified available
in our better-sqlite3 build).
- `db/fts.ts`: `CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(label, content)`
  keyed by rowid = node id, space filtered at query time via join. Sync on node
  create/update/delete (explicit calls in NodesRepo — no triggers, keeps WAL simple)
  + one-time idempotent backfill on boot for existing volumes.
- `hybridSearch(h, spaceId, query, vec, k)`: BM25 top-N + knn top-N fused with
  **Reciprocal Rank Fusion** (RRF, k=60) — deterministic, no tuning, no new deps.
- Adopt in: `GET /api/search` and the chat GraphRAG seed step. Linking/synthesis stay
  pure-vector (semantic-only is correct there).

## B2 — Dream cycles (consolidation → beliefs)

**Problem:** she links notes but never *compounds understanding*. 500 memories should
become a worldview, the way sleep consolidates episodic → semantic memory.

**Design:**
- **Belief nodes:** `kind: "belief"` (shared GraphNode.kind union + zod untouched —
  kind is a plain column; type stays `concept`). Belief node content = the belief
  statement; `summarizes` edges → its evidence memories; `origin: "agent"`;
  distinctive indigo `color` so it reads differently in the galaxy.
- **Consolidation job** (autonomy loop, once per space per day, LLM-gated by
  researchEnabled + budget; heuristic fallback = template from cluster's dominant
  labels/emotion): pick the densest hub neighborhood with ≥5 same-space memories not
  yet summarized by a belief → `llm.consolidate(nodes)` (new optional adapter method
  + CONSOLIDATE prompt) → `{ belief, confidence }` → create/refresh the belief node.
- **Revision, not deletion:** re-consolidating an existing belief appends the prior
  text as a lore chapter on the belief node (the versioned Chronicle already does
  history) and updates the node content. Resolving a contradiction that touches a
  belief's evidence marks it stale (re-run next cycle).
- **Surfaces:** galaxy node; "What she believes about you" section atop the Insights
  tab; Daily Contact discovery slot may cite a fresh belief; Help entry.

## B3 — Foresight (describe → preempt)

**Problem:** emotional-weather describes the past; the level-up is calling the next
occurrence BEFORE it lands.

**Design:** `analysis/foresight.ts` — deterministic detectors, no LLM:
- **Monthly cycle:** negative memories (ew ≤ −0.3) clustering in the same ±3-day
  day-of-month window across ≥2 distinct months → if the window opens within 5 days,
  emit a warning ("the last two month-ends ran heavy — the 28th is Friday").
- **Weekday cycle:** ≥3 distinct weeks with negative memories on the same weekday.
Output `{ text, window, kind }` → new `foresight` field on the Daily Contact payload
(rendered as "She sees a pattern coming" on the Observatory) + fed into the
behavioral-persona block so chat tone anticipates it. Fully tested with seeded dates.

## B4 — Undertakings (multi-day intent)

**Problem:** her autonomy thinks in 5-minute ticks; a mind has projects.

**Design:** `undertakings` table (space_id, kind, title, target total, done, started,
ends, status). Autonomy loop: if none active, start the most needed of three
free-tier templates (no budget risk):
- *Warm the cold belt* — tend/patrol the N coldest memories over ~5 days;
- *Chart the ___ sector* — calibration/sector passes over the dominant type;
- *Weave the frontier* — link-attempt passes over drifting (degree-0) memories.
Each tick advances one step (reuses existing free jobs), logs progress; completion →
agent log + notification + a Captain's-Log mention. UI: progress card in the Soumaya
tab ("Day 3 of 5 — Warming the cold belt, 7/12 memories") + her ship task label.

## Explicitly deferred
- Embedding-model upgrade (MiniLM→larger): requires image rebuild + full re-embed +
  vec-table dim migration — its own project.
- LLM reranking of hybrid results (cost per query; RRF first, measure).
- Belief-driven chat injection beyond retrieval (beliefs are nodes → they already
  enter chat via retrieval naturally).
