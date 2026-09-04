# Spec — Maya Intelligence: Unified Personal Intelligence Architecture

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) / [WORKFLOW.md](../../WORKFLOW.md).
> This is the north-star architecture document for Soumaya/Maya's Intelligence layer, written
> per the originating brief's own §32/§37. It supersedes nothing — it sits alongside
> [temporal-contextual-reasoning.md](./temporal-contextual-reasoning.md) (the temporal layer
> this pass builds directly on top of) as the broader frame that layer lives inside. Status:
> **Phase 1 implemented; Phases 2+ deliberately deferred and enumerated below, per the
> brief's own "do not implement everything simultaneously" instruction.**

## 🎯 North star

Maya should feel less like "an AI reading some application data" and more like an intelligent
entity with a continuously evolving understanding of the user's life: what mattered before, what
changed, what remains uncertain, and what's worth asking about. Every domain (Money, Wealth, Life
Vision, Mind/Memories, Journeys, People) keeps owning its own facts. Maya sits **above** these
systems, reasoning across them — she never becomes a second ledger, and the Galaxy stays a
downstream visualization, never an independent source of truth.

```
AUTHORITATIVE DATA → RETRIEVAL → TEMPORAL UNDERSTANDING → ENTITY/RELATIONSHIP UNDERSTANDING →
STATE + CHANGE UNDERSTANDING → UNCERTAINTY/CONTRADICTION DETECTION → CONTEXT ASSEMBLY →
REASONING → CONVERSATION / QUESTIONS / NUDGES
```

## Current-state audit (what already existed before this pass)

A repo-wide audit (six parallel research passes across this and the preceding temporal-reasoning
task) found this codebase is **already much further along this pipeline than a first look
suggests**. The single biggest architectural decision this pass made was to **build the smallest
possible new layer on top of that**, rather than re-implement any of it.

| Pipeline stage | What already exists | Where |
|---|---|---|
| Retrieval | Hybrid vector+keyword search (BM25 via FTS5, RRF fusion), 4 vec0 tables (nodes, docs, instruction profiles, journeys), a swappable embedding provider (local MiniLM, hash fallback) | `db/vec.ts`, `db/fts.ts`, `embeddings/adapter.ts` |
| Entity/relationship | Multi-hop graph traversal (recursive CTEs, undirected + directed), a 10-value `RelationshipType` enum already including `"contradicts"`/`"resolves"` | `graph/traversal.ts`, `packages/shared/src/types.ts` |
| Temporal understanding | The full layer built in the immediately-preceding pass: 6-state classification, period-over-period change detection with an explicit "insufficient history" outcome, bounded cross-domain context assembly | `analysis/temporal*.ts` (see its own spec) |
| State + change | `analysis/temporalChains.ts`'s `buildEvolutionLinks()` already finds same-theme memories ≥14 days apart with mood drift — genuine thought-continuity detection, already wired to a digest endpoint and UI panel | `analysis/temporalChains.ts` |
| Uncertainty/contradiction | `synthesis/contradictions.ts` already runs real LLM-judged contradiction detection (works even offline, via the heuristic provider) and persists verdicts to the `insights` table | `synthesis/contradictions.ts`, `repositories/insights.repo.ts` |
| Provenance (partial) | Every node already carries `origin: "agent" | "user" | null` — dream-cycle-consolidated beliefs are already distinguishable from user-stated memories via `kind:"belief"` + `origin:"agent"` | `db/schema.ts`, `analysis/dreamCycle.ts` |
| Context assembly / chat | `chat/graphrag.ts`'s `chat()` already assembles GraphRAG node context + four independent, null-safe domain snapshots (finance/people/cognitive/temporal) into one bounded prompt | `chat/graphrag.ts` |
| Galaxy → entity mapping | Every memory/MOC-hub body is enriched-on-read but keeps its real `nodes.id`; a full click → id → `/api/nodes/:id` reverse-lookup path already works | `graph/service.ts`, `api/routes/nodes.ts` |
| Short-term/long-term memory | Working memory (`working_memory` table) already implements exactly the "ephemeral, decaying, reinforced, promoted-to-permanent-on-threshold" pattern this brief describes in the abstract | `analysis/workingMemory.ts` |

## Gap analysis

| Gap | Severity | Disposition this pass |
|---|---|---|
| No unified epistemic vocabulary (fact/observation/inference/hypothesis/unknown/confirmed) anywhere — claims are either "in the DB" or not, with no notion of confidence as its own field | Core to the brief's ask | **Closed this pass** — `packages/shared/src/intelligence.ts` |
| Contradiction detection exists but nothing reframes it into a chat-visible, appropriately-hedged claim; chat currently doesn't know about contradictions at all (only the separate Insights/Digest UI does) | Real, concrete | **Closed this pass** — `analysis/intelligence.ts` + `chat/graphrag.ts` wiring |
| No deterministic "is this worth asking about" gate anywhere in the repo | Core to the brief's ask | **Closed this pass** — `selectClarification()` + a 3-day cooldown |
| `analysis/dreamCycle.ts` folds LLM confidence into `importance`, losing it as a distinct signal | Minor, pre-existing | Documented; not touched (out of scope — that module isn't part of this pass's claim-formation path) |
| Journey hubs and Money-sky stars render in the Galaxy but have **no click → entity resolution** (confirmed by direct code audit: `userData.journeyId` is set but read nowhere; no click handler exists for either layer) | Real, scoped, non-trivial (3D raycast + click-handler work) | **Deferred — Phase 10 of the brief's own sequence.** Memory/MOC-hub bodies already work; this gap is specific to two non-memory visual layers. |
| No causal-relationship detection (A may have caused B) anywhere | Real, and the brief itself asks it be approached "carefully" | **Deferred** — forming even hedged causal claims safely needs its own design pass; not attempted here to avoid overstating what a pass this size can respect the brief's own caution about. |
| Thought-evolution links are computed but never persisted as graph edges (`temporalChains.ts`'s own doc comment already flags this as a "noted follow-up") | Pre-existing, not introduced by this pass | Reused exactly as it is (ephemeral); materializing `evolves_into` edges is future work, not blocking this pass's claim formation. |
| No ML-based pattern/anomaly/forecast detection anywhere | Explicitly named as future-only by the brief (§23, §27) | **Not attempted.** The brief is explicit that ML must earn its place with real value, not be added for branding. |
| No mechanism for a user's answer to a clarification question to become a `"confirmed"` claim (the type exists; nothing writes it) | Real, scoped | **Deferred** — needs a chat-flow/UI decision (how does the system recognize "that message was answering the earlier question"?) this pass did not want to guess at; flagged explicitly rather than built speculatively. |
| Debt / Credit / Financial Health | Explicitly out of scope per the brief (§36) | **Not touched**, not even an extensible interface stub — the brief says not to invent their schemas, and no other part of this pass needed one. |

## Recommended implementation sequence (adopted, following the brief's own §33 list)

1. ~~Unified intelligence contracts/interfaces~~ — **done this pass** (`shared/intelligence.ts`).
2. ~~Temporal context~~ — **done in the preceding pass** (`analysis/temporal*.ts`).
3. Cross-domain retrieval beyond Money/Wealth/Life Vision/Journeys/Mind/People (e.g. surfacing
   *specific* relevant memories/attachments by combined semantic+temporal+entity relevance for a
   given conversation topic, not just aggregated domain snapshots) — **not yet built**; the
   existing GraphRAG retrieval (embed question → KNN → multi-hop expand) already does a version
   of this for memories specifically, so the gap is narrower than it may first appear.
4. Entity/relationship retrieval (e.g. "this is the same person/entity," explicit dedup-aware
   retrieval) — partially covered by existing `mergeDuplicatePeople()`; not extended this pass.
5. State/change detection — **done in the preceding pass** for Money/Wealth; Journey/Vision
   progress-change explicitly flagged as needing new history logging (temporal spec's own V1
   limitations).
6. ~~Contradiction + uncertainty model~~ — **done this pass**, reusing existing detection.
7. Provenance — **partially done** (`ProvenanceRef` type + `nodes.origin` reuse); a persisted,
   queryable provenance graph ("show me every fact that supports this claim") is future work —
   the brief itself says "leave room for it," not "build it now" (§16).
8. ~~Clarification engine~~ — **done this pass** (`selectClarification`, cooldown-gated).
9. ~~Chat integration~~ — **done this pass** (5th snapshot in `chat/graphrag.ts`).
10. Galaxy intelligence integration — **deferred**, gap confirmed and scoped above.
11. ML-assisted relevance/pattern systems — **deferred**, per the brief's own explicit caution.

## The central principle (unchanged, enforced structurally)

Every domain remains authoritative for its own facts. `analysis/intelligence.ts` performs **zero
writes to any domain table** — grep-verifiable, the same discipline the temporal spec already
established. The one write it does perform (`recordClarificationAsked`, an `agent_logs` cooldown
entry) is operational telemetry, structurally identical to what `agent/tools/router.ts`'s
`logAction()` already writes for every tool invocation — it is not a fact about the user's life,
and no code anywhere reads it as one.

```
Lower domain (Money/Wealth/Life Vision/Mind/Journeys/People) → owns facts
Maya (analysis/intelligence.ts + analysis/temporal*.ts) → interprets relationships and meaning
Galaxy (graph/service.ts, celestial.ts) → visualizes system state, never independent truth
```

## The unified epistemic vocabulary

`packages/shared/src/intelligence.ts`:

```ts
type EpistemicStatus = "fact" | "observation" | "inference" | "hypothesis" | "unknown" | "confirmed";

interface ProvenanceRef { domain: "money"|"wealth"|"life_vision"|"journey"|"mind"|"people"|"memory"; kind: string; id: number; label?: string; }

interface IntelligenceClaim { id: string; status: EpistemicStatus; statement: string; confidence: number; domain: ProvenanceRef["domain"]; evidence: ProvenanceRef[]; createdAt: string; }

interface ClarificationCandidate { claim: IntelligenceClaim; question: string; priority: number; reason: string; }
```

**Never silently promoted upward** — enforced by construction in this pass, not just by
convention: `openContradictionClaims()` and `thoughtContinuityClaims()` (the only two claim
producers implemented so far) both hard-code `status: "observation"` — there is no code path in
this pass that can produce `"fact"` from detected evidence, and no code path that produces
`"confirmed"` at all yet (see the deferred "clarification answer → confirmed claim" gap above).

### The car-accident example, mapped onto the actual mechanism

Given a contradiction insight already exists between an "I have one vehicle" memory and a new
"vehicle accident" memory (exactly as `synthesis/contradictions.ts` would already produce once
its LLM call judges them in conflict):

1. `openContradictionClaims()` reframes it as an `IntelligenceClaim` with `status: "observation"`,
   `confidence` = the LLM's own conflict-sharpness score, `evidence` = both memories' node ids.
2. `toCandidate()` turns it into a `ClarificationCandidate` with `priority` weighted toward
   contradictions over mere recurring themes.
3. `selectClarification()` picks it only if its priority clears `MIN_CLARIFICATION_PRIORITY`
   (0.5) and no clarification was surfaced in the last `CLARIFICATION_COOLDOWN_DAYS` (3).
4. `intelligenceSnapshotText()` includes the observation AND, if the gate passed, one suggested
   question phrased as optional ("If it fits naturally, you may ask, in your own words...") —
   never a scripted line Maya must recite.
5. The LLM sees this in `systemExtra`, explicitly labeled "these are NOT settled facts; never
   state them as certain," and decides in-conversation whether/how to raise it.

What this mechanism deliberately does NOT do: decide that the vehicle is gone, write anything
back to the memory graph, or force the question into every reply. The real NLU step — recognizing
that an uploaded image shows vehicle damage, or that "vehicle accident" and "I have one vehicle"
are worth comparing at all — is `synthesis/contradictions.ts`'s existing `llm.detectContradiction`
call (and, upstream of that, the existing extraction pipeline). This pass adds the **reframing
and gating** layer on top of judgments that pipeline already makes; it does not re-implement the
judgment itself.

## Provenance

`ProvenanceRef` is a pointer, never a copy: `{ domain, kind, id, label? }`. Every claim's evidence
list can always be re-resolved back to a real row through the owning domain's own repository
(e.g. `NodesRepo.getById(evidence.id)`), so "why did you think that?" is always answerable by
re-fetching, not by trusting a cached snapshot. This pass does not build a persisted, queryable
provenance graph (the brief's §16 explicitly says only to "leave room for it," not build it) —
`ProvenanceRef`'s shape is deliberately generic enough that a future provenance store could be
built by simply persisting arrays of these, without a type migration.

## Retrieval

Unchanged this pass — reused entirely. Chat's existing hybrid retrieval (embed question → vector
KNN + BM25 keyword search → Reciprocal Rank Fusion → multi-hop graph expansion, all in
`chat/graphrag.ts`) already does bounded, relevant, non-dump retrieval for memory context. This
pass's two new claim-producing functions (`openContradictionClaims`, `thoughtContinuityClaims`)
add their own small, hard-capped queries (≤3 and ≤2 results respectively) — never a full-table
scan, never unbounded.

## Chat integration

One new `try/catch` block in `chat/graphrag.ts`, inserted immediately after the temporal-context
block and before the grounded-insight block — the fifth in what is now a five-snapshot sequence
(telemetry → behavior → finance → people → cognitive → temporal → **intelligence** →
grounded-insight → instruction-profiles-last). Same null-safe, best-effort contract as every
snapshot before it. No changes to `chat()`'s signature, retrieval, or citation logic.

## Galaxy integration — status, not a redesign

Memory and constellation/MOC-hub bodies already have a complete, working click → id →
`/api/nodes/:id` path (confirmed by direct code read, not assumed) — nothing needed fixing there.
Journey hubs (`graph/journeyHubs.ts`) and Money-sky stars (`finance/sky.ts` + its web renderer)
are real, confirmed gaps: both tag their sprites with the real underlying id
(`userData.journeyId`, implicitly the bill/goal id for money-sky) but **no click/raycast handler
in `Graph3D.tsx` reads either** — clicking one of these bodies today does nothing. Closing this
gap is scoped, understood, and deliberately **not attempted in this pass** (Phase 10 of the
sequence above) — it is 3D click-handling/raycast work, a different skill-shape from the
deterministic reasoning this pass focused on, and bundling it in risked exactly the kind of
scope creep the brief's own §27 warns against ("do not overbuild the first version").

## ML / LLM / deterministic role split

- **Deterministic code** (this pass, entirely): claim formation from already-detected evidence,
  confidence carrying, the clarification priority/cooldown gate, all of `analysis/temporal*.ts`.
- **Retrieval/embeddings** (fully pre-existing, reused): semantic similarity for contradiction
  candidates and evolution links, hybrid search for chat.
- **LLM** (fully pre-existing, reused): `detectContradiction()` for the actual conflict judgment;
  chat's own synthesis/narration of everything assembled above.
- **ML (pattern/anomaly/forecasting)**: genuinely absent from this pass, per the brief's own
  instruction not to add it "merely for branding." No pattern-detection, classification, or
  forecasting model was introduced.

## Privacy & performance

Identical posture to the temporal spec: every new function is space-scoped through the same
`spaceId` threading every other repository already uses (verified by a direct space-isolation
test in `intelligence.test.ts`); every query is hard-capped (≤3 contradiction claims, ≤2
continuity claims, a single clarification candidate surfaced); no full-database scans; no new
hot-path cost on every chat message beyond two small, already-space-scoped, already-capped reads
that reuse existing detection output rather than recomputing it.

## V1 limitations (explicit)

1. No causal-relationship detection — flagged, not attempted, per the brief's own caution.
2. No mechanism yet for a user's clarification answer to become a `"confirmed"` claim — the type
   exists, nothing produces it. Needs a chat-flow design decision this pass did not want to guess.
3. Galaxy click-resolution for Journey hubs and Money-sky stars remains unbuilt.
4. No ML-based relevance ranking, pattern detection, or forecasting.
5. Thought-evolution links stay ephemeral (not persisted as graph edges) — a pre-existing,
   already-documented gap this pass did not need to close to build claim formation on top of it.
6. Cross-domain contradiction detection (e.g. "this pay stub conflicts with this stated
   employment goal") does not exist — today's `synthesis/contradictions.ts` only compares
   memory-to-memory via embedding similarity. Extending it across domains is future work.
7. A persisted, queryable provenance graph is not built — `ProvenanceRef` is the room left for it.

## Future evolution rules

- Any new claim producer must slot into the existing `EpistemicStatus` vocabulary — never invent
  a parallel confidence/certainty concept.
- A claim's `confidence` must never be folded into another field (the `dreamCycle.ts` lesson this
  pass explicitly avoided repeating) — if a future consumer needs a blended score, compute it at
  the point of use, keep the stored/passed value pure.
- Before adding a new relationship type (e.g. `"supersedes"`, `"confirms"`) for a
  clarification-answer-updates-understanding flow, check whether the already-existing
  `"resolves"`/`"contradicts"` types cover the need — they were found, by audit, to already exist
  for exactly this kind of temporal-logic relationship.
- Galaxy click-resolution, when built, must reuse the existing enrich-on-read pattern
  (`graph/service.ts`) for consistency with how memory/MOC bodies already work — not a bespoke
  per-layer resolution mechanism.
- Any future ML component must have a stated, falsifiable reason it beats the deterministic/LLM
  alternative already in place, per the brief's own §23/§27.

## 🧪 Testing (behavioral, per the brief's §28/§29 — "prove it, don't claim it")

New test files: `analysis/intelligence.test.ts` (18 cases), `__tests__/intelligenceChat.test.ts`
(2 cases). See the final report for the exact PASS/PARTIAL/deferred verdict per lettered
scenario — several scenarios (D, E, G) are honestly reported as testing only the mechanism they
depend on, not the full end-to-end behavior, because the missing piece is real LLM visual/causal
judgment or 3D click infrastructure this pass didn't build, not something a synthetic unit test
can substitute for without pretending.

## ✅ Acceptance criteria

1. A unified epistemic vocabulary exists and is used by at least one real claim producer.
2. Existing contradiction detection is reframed into chat-visible, appropriately-hedged claims —
   never asserted as fact.
3. Existing thought-continuity detection (evolution links) is reframed the same way.
4. A deterministic clarification gate exists, is cooldown-limited, and is unit-tested in
   isolation from any database.
5. Chat receives this via the exact same integration pattern as every existing domain snapshot.
6. Zero domain-fact writes; one documented, narrow operational log write.
7. Full gate green; zero regressions in Money/Wealth/Life Vision/Journeys/People/Growth/Pay
   Stubs/Galaxy/the just-shipped temporal layer.
8. Every deferred capability is named explicitly, not silently dropped.
