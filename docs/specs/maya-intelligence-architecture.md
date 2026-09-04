# Spec — Maya Intelligence: Unified Personal Intelligence Architecture

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) / [WORKFLOW.md](../../WORKFLOW.md).
> This is the north-star architecture document for Soumaya/Maya's Intelligence layer, written
> per the originating brief's own §32/§37. It supersedes nothing — it sits alongside
> [temporal-contextual-reasoning.md](./temporal-contextual-reasoning.md) (the temporal layer
> this pass builds directly on top of) as the broader frame that layer lives inside. Status:
> **Phase 1 (epistemic vocabulary, contradiction/continuity reframing, clarification gate) AND
> the I1–I3 completion pass (causal reasoning, clarification → confirmed knowledge, Galaxy
> Entity Intelligence) are both implemented — see "I1–I3 completion pass" below.** Phases
> beyond I1–I3 (ML-assisted pattern detection, a persisted provenance graph, cross-domain
> contradiction detection, Debt/Credit/Financial Health) remain deliberately deferred and
> enumerated in "V1 limitations."

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
| Journey hubs and Money-sky stars render in the Galaxy but have **no click → entity resolution** (confirmed by direct code audit: `userData.journeyId` is set but read nowhere; no click handler exists for either layer) | Real, scoped, non-trivial (3D raycast + click-handler work) | **Closed in the I1–I3 pass** — `analysis/galaxyEntity.ts`'s `resolveGalaxyEntity` + `GET /api/graph/entity/:kind/:id`, and `Graph3D.tsx`'s `handleClick`/`flyToGalaxyEntity`. See "Galaxy Entity Intelligence (I3)" below. |
| No causal-relationship detection (A may have caused B) anywhere | Real, and the brief itself asks it be approached "carefully" | **Closed in the I1–I3 pass**, deliberately bounded (never a causal-graph engine) — `analysis/causal.ts`. See "Causal reasoning (I1)" below. |
| Thought-evolution links are computed but never persisted as graph edges (`temporalChains.ts`'s own doc comment already flags this as a "noted follow-up") | Pre-existing, not introduced by this pass | Reused exactly as it is (ephemeral); materializing `evolves_into` edges is future work, not blocking this pass's claim formation. |
| No ML-based pattern/anomaly/forecast detection anywhere | Explicitly named as future-only by the brief (§23, §27) | **Not attempted.** The brief is explicit that ML must earn its place with real value, not be added for branding. |
| No mechanism for a user's answer to a clarification question to become a `"confirmed"` claim (the type exists; nothing writes it) | Real, scoped | **Closed in the I1–I3 pass** — `intelligence_clarifications` table + `analysis/clarificationResolution.ts`. See "Clarification → confirmed knowledge (I2)" below. |
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
8. ~~Clarification engine~~ — **done this pass**; ~~clarification → confirmed knowledge~~ —
   **done in the I1–I3 pass** (`intelligence_clarifications` table + `clarificationResolution.ts`).
9. ~~Chat integration~~ — **done this pass** (5th snapshot in `chat/graphrag.ts`).
10. ~~Galaxy intelligence integration~~ — **done in the I1–I3 pass** (`galaxyEntity.ts` +
    `Graph3D.tsx` click wiring).
11. ML-assisted relevance/pattern systems — **still deferred**, per the brief's own explicit caution.
12. ~~Bounded causal reasoning~~ — **done in the I1–I3 pass** (`analysis/causal.ts`), reusing the
    existing temporal change-detection functions rather than a new inference engine.

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

`packages/shared/src/intelligence.ts` — extended in the I1–I3 pass from 6 to 9 `EpistemicStatus`
values, plus four new types (`CausalLink`, `ClarificationStatus`/`ClarificationRecord`,
`ClarificationInterpretation`, `GalaxyEntityDescriptor`/`GalaxyEntityKind`, `NavigationIntent`):

```ts
type EpistemicStatus =
  | "fact" | "observation" | "inference" | "hypothesis" | "possible"
  | "unknown" | "confirmed" | "outdated" | "contradicted";

interface ProvenanceRef { domain: "money"|"wealth"|"life_vision"|"journey"|"mind"|"people"|"memory"; kind: string; id: number; label?: string; }

interface IntelligenceClaim { id: string; status: EpistemicStatus; statement: string; confidence: number; domain: ProvenanceRef["domain"]; evidence: ProvenanceRef[]; createdAt: string; }

interface ClarificationCandidate { claim: IntelligenceClaim; question: string; priority: number; reason: string; }

// I1 — causal reasoning: NEVER stronger than "possible" from this deterministic layer alone.
interface CausalLink { id: string; cause: ProvenanceRef; effectDescription: string; effectDomain: ProvenanceRef["domain"]; status: "possible"|"hypothesis"|"confirmed"; confidence: number; temporalOrder: "before"|"after"|"concurrent"|"unknown"; evidence: ProvenanceRef[]; createdAt: string; }

// I2 — the clarification QUESTION lifecycle (the confirmed KNOWLEDGE itself is a real memory node, never duplicated here).
type ClarificationStatus = "pending" | "confirmed" | "dismissed";
interface ClarificationRecord { id: number; claimId: string; domain: ProvenanceRef["domain"]; question: string; evidence: ProvenanceRef[]; status: ClarificationStatus; answerText?: string|null; confirmedStatement?: string|null; confirmedNodeId?: number|null; createdAt: string; resolvedAt?: string|null; }
interface ClarificationInterpretation { answers: boolean; confirmedStatement: string; confidence: number; }

// I3 — Galaxy Entity Intelligence.
type GalaxyEntityKind = "node" | "journey" | "bill" | "goal";
interface GalaxyEntityDescriptor { ref: ProvenanceRef; state: string; temporal?: string; navigable: boolean; }
interface NavigationIntent { target: ProvenanceRef; reason: string; }
```

**New status values, and why:** `"possible"` is I1's causal-reasoning status — deliberately
weaker than `"hypothesis"`, reserved for a merely-time-coincident change, never promotable to
`"confirmed"` by this layer. `"outdated"`/`"contradicted"` exist for a claim that a NEWER fact or
user confirmation has since superseded — the OLD claim is re-labeled, never deleted or rewritten
(Scenario 3/10 below).

**Never silently promoted upward** — enforced by construction: `openContradictionClaims()` and
`thoughtContinuityClaims()` still hard-code `status: "observation"`; `possibleDownstreamEffects()`
(I1) hard-codes `status: "possible"`; the ONLY code path that can produce `"confirmed"` is
`resolveClarificationFromMessage()` (I2), and only when the LLM adapter's
`interpretClarificationAnswer()` judges a real chat message actually answers a real pending
question — never inferred from silence, never invented from a hunch.

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

## I1–I3 completion pass

The three sections below close the three gaps the Phase-1 audit named explicitly (causal
detection, clarification → confirmed knowledge, Galaxy click-resolution). All three follow the
same discipline as Phase 1: reuse existing detection/infrastructure, add the smallest new layer,
never duplicate a domain's source of truth.

### Causal reasoning (I1)

`analysis/causal.ts`'s `possibleDownstreamEffects(handle, spaceId, claim, now)` is deliberately
**not** a causal-graph engine. Given an already-formed `IntelligenceClaim` (e.g. the car-accident
contradiction above), it checks whether the temporal-reasoning layer's EXISTING, already-built
change-detection functions (`analysis/temporalChange.ts`'s `incomeChange`/`netWorthChange`/
`goalAllocationChange`) show a real, dated change that is temporally consistent with having
happened after the claim's evidence (within a 65-day window — long enough to span one missed pay
cycle and the month-over-month bucketing those functions already use). If so, it surfaces a
`CausalLink` with `status: "possible"` — **never higher, never asserted as proven causation** —
and an `effectDescription` explicitly phrased as coincidence ("the timing coincides, but that
alone doesn't prove a connection"). No LLM call happens in this module: the only "inference" is
the deterministic temporal-consistency check; narrating the correlation-vs-causation distinction
in natural language is the EXISTING chat LLM's job (`intelligenceSnapshotText`'s injected
context), not a new model call. Bounded to 3 links max, and returns `[]` (never a fabricated link)
when the event date is unknown or too old — the same "insufficient evidence → silence" discipline
established in the temporal-reasoning pass.

### Clarification → confirmed knowledge (I2)

Closes the full lifecycle: *Unknown → candidate inference → clarification needed → Maya asks →
user answers → confirmed knowledge, stored with provenance, available to future retrieval* —
without ever overwriting a historical memory.

- **The question itself** is the one piece of intelligence-originated PERSISTENCE this pass
  introduces, explicitly justified (without it, "Maya remembers she asked" is impossible): the
  `intelligence_clarifications` table (`IntelligenceClarificationsRepo`) tracks only
  `{claimId, domain, question, evidence, status: pending|confirmed|dismissed, answerText,
  confirmedStatement, confirmedNodeId}`. `intelligenceSnapshotText()` now persists a row here
  the moment a candidate clears the existing clarification gate (`selectClarification` + the
  3-day cooldown) — this is what makes the lifecycle real rather than a shape with nothing
  writing to it.
- **The answer** is judged by a new REQUIRED `LlmProvider` method, `interpretClarificationAnswer
  (question, userMessage)`, implemented on every provider (gemini/openai/heuristic, wrapped in
  `resilient.ts`) — same precedent as `detectContradiction`. It returns
  `{answers, confirmedStatement, confidence}` and is deliberately conservative: the offline
  heuristic only treats a message as an answer given an explicit yes/no cue or real topical
  keyword overlap with the question, never a bare guess.
- **The confirmed knowledge itself is a REAL memory node** — `analysis/clarificationResolution.ts`'s
  `resolveClarificationFromMessage()` creates a `NodesRepo` row (`origin:"user"`, embedded exactly
  like any other memory) and links it back to the original evidence via the ALREADY-EXISTING
  `"resolves"` relationship type — no parallel knowledge store, no new retrieval infrastructure.
  This is why Scenario 5's test can assert the confirmed fact is found by the SAME
  `keywordSearch()` every other memory already uses.
- **Historical memories are never rewritten.** The memory that raised the question keeps its
  exact original content/timestamp forever; the confirmed statement is a NEWER, separate node —
  "current" is a matter of recency (a later `createdAt`), never destruction of the old fact.
- Wired into `chat/graphrag.ts`'s `chat()`: on every message, a bounded, single-row
  `mostRecentPending()` lookup checks for a live question; only if one exists does the one
  `interpretClarificationAnswer` LLM call fire. When it resolves, the CURRENT turn's system
  prompt gets an explicit `CLARIFICATION RESOLVED: ...` note so Maya can acknowledge it naturally
  in the same reply, not just on some future message.

### Galaxy Entity Intelligence (I3)

Every meaningful Galaxy body — not just memory/MOC bodies, which already resolved — now has a
stable, resolvable identity:

- **`GalaxyEntityDescriptor`** (`{ ref: ProvenanceRef, state, temporal?, navigable }`) is
  deliberately built ON `ProvenanceRef` rather than a parallel id/label shape — a descriptor is
  never a second source of truth, just a resolved, presentable view of one real row.
  `analysis/galaxyEntity.ts`'s `resolveGalaxyEntity(handle, spaceId, kind, id, now)` resolves
  `"node"` (memory, via `NodesRepo`), `"journey"` (via `JourneysRepo`), and `"bill"`/`"goal"`
  (both Money-sky star kinds, via `finance/sky.ts`'s already-computed `moneySky()` state — a
  bill/goal's display `state` is read verbatim from the SAME deterministic math already driving
  how the star looks, never re-derived). `GET /api/graph/entity/:kind/:id` exposes this —
  a bounded, single-lookup, no-LLM-call route safe to hit on every click.
- **`NavigationIntent`** (`{ target: ProvenanceRef, reason: string }`) is the bounded answer to
  the brief's explicit rule: *"if Maya navigates to something, she must have a reason — no random
  navigation, no decorative movement."* `navigationIntentFor(descriptor)` builds one from a
  descriptor's OWN already-computed `state` — never a separately invented sentence — so
  `GET /api/graph/entity/:kind/:id`'s response always carries both the descriptor and the
  concrete reason a navigation there would be meaningful.
- **Web wiring**: Journey hubs and Money-sky stars are plain Three.js scenery, not force-graph
  "nodes," so `Graph3D.tsx`'s `handleClick` gained a second raycast path (alongside the existing
  Soumaya-ship check) reading `userData.journeyId`/`userData.moneyId`+`userData.moneyKind` off
  the star/hub sprite itself (its sibling glyph/label sprite carries no id). A new
  `flyToGalaxyEntity(kind, id)` imperative method frames the camera on the single clicked body —
  modeled on the existing `isolateLayer`'s one-shot bounding-sphere framing, **not** on `flyTo`'s
  memory-node follow-lock (`followRef.current = n.id`), since a journey/bill/goal id lives in a
  completely different id space than memory node ids and comparing them via `followRef` could
  silently "follow" an unrelated memory sharing the same numeric id. `App.tsx` calls the new
  `galaxyEntity()` API client on click, flies the camera, and shows a toast that ALWAYS states
  the real reason from the server's own descriptor — never invented client-side.
- **Honest scope note**: this closes click-driven "what's that star?" resolution + navigation.
  Autonomous, Maya-INITIATED navigation during chat (e.g. flying the camera to a journey her
  answer just cited) is NOT built — it would require extending the LLM answer contract's
  `citations: number[]` (memory-node-only today) across every provider, a materially larger,
  route-contract-level change than this pass's "smallest reusable abstraction" scope. Flagged in
  "V1 limitations" below, not silently dropped.

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

`chat/graphrag.ts`'s `chat()` now runs SIX best-effort, null-safe snapshot/side-effect blocks in
sequence (telemetry → behavior → finance → people → cognitive → temporal → **intelligence** →
**I2 clarification resolution** → grounded-insight → instruction-profiles-last). The I2 block is
the only one that's not a pure read: `resolveClarificationFromMessage()` may create a memory node
+ edge when the current message answers a pending question, then injects a
`CLARIFICATION RESOLVED: ...` line into `systemExtra` for THIS turn. Same `try/catch`, same
"never break chat" contract as every block before it. No change to `chat()`'s signature,
retrieval, or citation logic.

## Galaxy integration

Memory and constellation/MOC-hub bodies already had a complete click → id → `/api/nodes/:id`
path. Journey hubs and Money-sky stars — the confirmed gap from the Phase-1 audit (both tag their
sprites with a real id in `userData`, but nothing read it) — are now closed, per "Galaxy Entity
Intelligence (I3)" above: `resolveGalaxyEntity` + `GET /api/graph/entity/:kind/:id` on the server,
`Graph3D.tsx`'s extended `handleClick` + new `flyToGalaxyEntity` on the client.

## Maya Chat → Galaxy Navigation (Model C)

Closes the one gap I3 deliberately left open: Maya-INITIATED navigation during chat, as opposed
to a direct user click on a Galaxy body. Built per an explicit, audited architecture (Model C —
"the LLM may suggest, the server must verify, the resolver determines reality, the descriptor
determines the reason, the user chooses whether to navigate, Graph3D performs the movement"),
reusing I3's `resolveGalaxyEntity`/`navigationIntentFor` verbatim rather than building a second
resolver or a second camera implementation.

**Bounded candidate selection.** `analysis/galaxyEntity.ts`'s `buildNavigationCandidateList(handle,
spaceId)` lists a FEW of the user's own active Journeys, non-archived Goals, and Bills (each kind
capped at 3, the combined list capped at 6 — the same small-bound discipline `MAX_CAUSAL_LINKS`/
`MAX_CONTRADICTION_CLAIMS` already established) via the EXACT SAME repos `finance/sky.ts`/
`JourneysPanel` already use. This is explicitly NOT a relevance engine — no scoring, no
embeddings, no Galaxy scan — just a small, cheap, always-fresh enumeration, injected into the
chat prompt (`buildAnswerPrompt`'s new `galaxyCandidates` block) the same way memory context is
already given as an id-tagged `[id] label` list.

**LLM proposal vs. server authority.** The model may propose `navigationCandidates:
{kind, id}[]` (`AnswerResult.navigationCandidates`, at most 2, ordered by its own confidence) —
picking ONLY from the exact `[kind:id]` pairs it was shown. This is deliberately weaker than
`NavigationIntent`: no `reason`, no `domain`, nothing authority-bearing. It is UNTRUSTED, exactly
like `citations: number[]` already is. `analysis/galaxyEntity.ts`'s `resolveNavigationIntent`
(chat/graphrag.ts's sole caller) is the ONE authority: it tries the model's candidates in its own
preferred order, independently re-resolves each via `resolveGalaxyEntity` (space-scoped, kind-
checked — `"node"` is explicitly rejected here even though `resolveGalaxyEntity` supports it,
since memory navigation already has citations), and returns the FIRST real match's
`navigationIntentFor`-derived `NavigationIntent` — or nothing. A model-invented id, a wrong-space
id, or an injected extra field (e.g. a fake `reason`) never reaches the result; only `kind`/`id`
that turn out to point at something real, in this space, ever matter.

**Entity resolution + deterministic reason.** Identical to I3: `resolveGalaxyEntity` is the sole
resolver, `navigationIntentFor` derives `reason` purely from the resolved descriptor's own
already-computed `state` — never a second reason-generation system, never LLM prose.

**One-target V1 limitation.** At most one `NavigationIntent` per assistant response
(`ChatResponse.navigation?: NavigationIntent`) — the first candidate (in the model's own order)
that resolves; the rest are discarded. No multi-target navigation UI, no multiple camera moves.

**Click-to-navigate behavior — no auto-navigation.** `ChatDock`'s `ChatMessage.navigation` field
renders ONE chip (same interaction philosophy as citation chips: "🧭 Go to {label}" /
"💵 Go to {label}", `title` = the real reason). The camera moves ONLY when the user clicks it —
`onNavigate` fires from that click handler alone, never from rendering, never from an effect
watching persisted `messages` (which would replay on reload/mount). `App.tsx`'s `onNavigate`
prop is a direct callback (mirroring the existing `onFocus`/`onRecall` pattern) that maps the
returned `ProvenanceRef` back to a `GalaxyEntityKind` (`web/api/graph.ts`'s
`galaxyEntityKindFromRef` — the one small, tested adapter between the two) and calls
`graphRef.current?.flyToGalaxyEntity(kind, id)` — I3's existing, `followRef`-free camera path,
completely unchanged.

**Security / space isolation.** `resolveNavigationIntent` always resolves against the CALLER's
own `spaceId` (never anything from the model), so a candidate pointing at another space's
journey/goal/bill simply fails to resolve — proven directly by a dedicated space-isolation test
at both the resolver level and the full `chat()` level.

**Performance.** Candidate-list generation is three small, already-bounded repo reads, same cost
class as every other chat snapshot — it runs on EVERY chat message. Resolution
(`resolveGalaxyEntity`, the heavier of the two — a bill/goal call recomputes `moneySky()`) runs
ONLY when the model actually proposes a candidate, which is rare. No additional LLM call.

**Future possibilities, not built:** multi-target navigation (offering 2–3 candidates at once),
auto-navigation (moving the camera without a click), and extending the candidate domains beyond
Journeys/Goals/Bills (e.g. People, Life Vision, a future Debt/Credit domain) — all would reuse
this exact contract, adding at most one new `case` to `resolveGalaxyEntity` per domain.

## ML / LLM / deterministic role split

- **Deterministic code**: claim formation from already-detected evidence, confidence carrying,
  the clarification priority/cooldown gate, all of `analysis/temporal*.ts`, I1's causal
  temporal-consistency check (`analysis/causal.ts`), I2's clarification persistence/resolution
  bookkeeping, I3's `resolveGalaxyEntity`/`navigationIntentFor` (both pure reads of already-
  computed domain state — no new math).
- **Retrieval/embeddings** (fully pre-existing, reused): semantic similarity for contradiction
  candidates and evolution links, hybrid search for chat — including retrieval of a
  clarification's confirmed-knowledge node, via the SAME embed+KNN/keyword path as any memory.
- **LLM**: `detectContradiction()` for the conflict judgment (pre-existing); I2's new REQUIRED
  `interpretClarificationAnswer()` for judging whether a message answers a pending question —
  implemented on every provider including the offline heuristic, same precedent as
  `detectContradiction`; Maya Chat → Galaxy Navigation's `navigationCandidates` (an UNTRUSTED
  proposal only — never the authority, see above); chat's own synthesis/narration of everything
  assembled above.
- **ML (pattern/anomaly/forecasting)**: genuinely absent, per the brief's own instruction not to
  add it "merely for branding." No pattern-detection, classification, or forecasting model was
  introduced anywhere in I1–I3.

## Privacy & performance

Identical posture to the temporal spec, extended to every I1–I3 mechanism: `intelligence_clarifications`
is a space-scoped table (added to `TABLES_WITH_SPACE`); `resolveClarificationFromMessage`,
`resolveGalaxyEntity`, `possibleDownstreamEffects`, `buildNavigationCandidateList`, and
`resolveNavigationIntent` all thread `spaceId` the same way every other repository does (direct
space-isolation tests exist for all of them — see "Testing" below).
No full-system scan is ever performed per chat message: I1's causal check runs only over the
already-capped contradiction claims (≤3) and reuses temporal-reasoning's own bounded month-over-
month queries; I2's clarification check is a single indexed `mostRecentPending()` row lookup, and
its one LLM call fires ONLY when a clarification is actually pending (a rare, gated state); I3's
Galaxy resolution is a single-row/bounded lookup per click, never a full Galaxy dump into a
prompt; Maya Chat → Galaxy Navigation's candidate list is 3 small, already-bounded repo reads on
every chat message (cheap, same class as any other snapshot), while its actual resolution step
runs ONLY when the model proposes a candidate — no extra LLM call either way. Explicitly
forbidden and not present anywhere: scanning every memory/node/Galaxy object/financial record on
every message.

## V1 limitations (explicit)

1. ~~No causal-relationship detection~~ — **closed in I1**, bounded to temporal-coincidence
   detection over already-existing change functions; still no general causal-graph engine, by
   design.
2. ~~No mechanism for a clarification answer to become `"confirmed"`~~ — **closed in I2.**
3. ~~Galaxy click-resolution for Journey hubs and Money-sky stars~~ — **closed in I3** for
   click-driven resolution + navigation, and ~~Maya-INITIATED navigation during chat~~ is now
   **also closed** (Maya Chat → Galaxy Navigation, Model C, above) — the model may propose a
   bounded, id-tagged Journey/Goal/Bill candidate; the server independently validates/resolves
   it via the SAME `resolveGalaxyEntity`/`navigationIntentFor` I3 already built; the user clicks
   a chip to actually move the camera (no auto-navigation in V1). What's NOT built: multi-target
   navigation (offering several candidates at once), auto-navigation, and candidate domains
   beyond Journeys/Goals/Bills (People, Life Vision, a future Debt/Credit) — all flagged as
   future extensions of the exact same contract, not attempted here. The 3D click interaction
   itself (raycast hit-testing on the money-sky/journey-hub sprites, and the navigation chip's
   click-triggered camera fly) is typecheck/build-clean and verified end-to-end against a live
   server/real in-memory-DB test suite, but has **not been visually confirmed on-device** — this
   repo's own "prove it by reproduction" standard for spatial/visual code it cannot render;
   flagged, not claimed.
4. No ML-based relevance ranking, pattern detection, or forecasting.
5. Thought-evolution links stay ephemeral (not persisted as graph edges) — a pre-existing,
   already-documented gap this pass did not need to close to build claim formation on top of it.
6. Cross-domain contradiction detection (e.g. "this pay stub conflicts with this stated
   employment goal") does not exist — today's `synthesis/contradictions.ts` only compares
   memory-to-memory via embedding similarity. Extending it across domains is future work.
7. A persisted, queryable provenance graph is not built — `ProvenanceRef` is the room left for it.
8. I1's causal check only covers Money/Wealth change signals (income, net worth, goal
   allocation) — it does not reason about Journey progress, People, or Life Vision changes as
   possible downstream effects; extending `possibleDownstreamEffects` to those domains would
   reuse the same pattern but wasn't part of this pass's scoped acceptance criteria.
9. I2's clarification-resolution check runs against only the SINGLE most-recent pending
   question — by design (there is normally at most one "live" question at a time, gated by the
   existing 3-day cooldown), but a user who ignores a question and later gets asked a second,
   different one could, in principle, have an old pending row linger unresolved indefinitely
   (never auto-dismissed by staleness). No auto-expiry was built — flagged as a possible small
   follow-up, not attempted here to avoid a speculative "how stale is too stale" policy decision.

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
- Galaxy click-resolution reuses the `GalaxyEntityDescriptor`/`resolveGalaxyEntity` pattern
  established in I3 for consistency with how memory/MOC bodies already work — a future new
  Galaxy body kind should add one case to `resolveGalaxyEntity`, not a bespoke per-layer
  resolution mechanism.
- A `NavigationIntent`'s `reason` must always be built from something already known (a
  descriptor's `state`, a causal link's `effectDescription`, a clarification's
  `confirmedStatement`) — never a separately invented sentence.
- Any future ML component must have a stated, falsifiable reason it beats the deterministic/LLM
  alternative already in place, per the brief's own §23/§27.

## 🧪 Testing (behavioral, per the brief's §28/§29 — "prove it, don't claim it")

**Phase 1**: `analysis/intelligence.test.ts` (18 cases), `__tests__/intelligenceChat.test.ts`
(2 cases).

**I1–I3 completion pass**, new test files (all real end-to-end calls into the modules under
test, no mocking of the code being verified):
- `repositories/intelligenceClarifications.repo.test.ts` (5) — create/read, `mostRecentPending`
  ignoring resolved rows, `resolve()` setting confirmed fields, cooldown boundary, space isolation.
- `llm/heuristic.test.ts` (6) — `interpretClarificationAnswer`'s conservative offline judgment:
  explicit yes/no, topical-overlap-without-yes/no, rejecting an unrelated new topic, empty input,
  and the leading-acknowledgement strip.
- `analysis/clarificationResolution.test.ts` (5) — no pending → null, a non-answering message
  leaves the clarification pending, a real answer creates the confirmed node + `resolves` edge +
  marks the row confirmed while the original evidence is untouched, a dangling evidence ref is
  skipped not crashed, space isolation.
- `analysis/galaxyEntity.test.ts` (7) — resolves node/journey/bill/goal to the correct
  `ProvenanceRef` + a real computed `state`; a goal's funding math reads the authoritative
  `fin_goal.targetCents` rather than back-deriving it from `fillPct`; unknown id → null; space
  isolation; `navigationIntentFor` carries the descriptor's own ref/state verbatim.
- `__tests__/mayaIntelligenceI1I3.test.ts` (13) — the 12 required scenarios from the brief's
  Part VIII, numbered to match exactly, built around the canonical car-accident fixture:
  1 causal uncertainty stays `"possible"`; 2 a confirmed answer carries real provenance
  (`origin:"user"` + a `resolves` edge); 3 historical vs. current (both coexist, confirmed is
  newer); 4 downstream uncertainty spans multiple domains, still hedged, never fabricates an
  unchanged-income link; 5 the full lifecycle end-to-end including retrieval via the existing
  `keywordSearch`; 6 a resolved clarification is never re-asked and an unrelated message is never
  mistaken for an answer; 7 Galaxy entity resolution across all three non-memory-node kinds;
  8 a `NavigationIntent` is never producible without a real resolved entity; 9 resolving a
  clarification creates exactly one new memory node and zero parallel Journey/finance rows;
  10 the confirmed node's `origin` is a strictly stronger provenance signal than the original
  evidence's; 11 insufficient evidence returns `[]`/`null`, never a fabrication; 12 full-flow
  space isolation across every new mechanism at once.

Server suite total after I1–I3: **666/666** (up from Phase 1's baseline). Full gate (typecheck +
server tests + web tests + web build) green at every commit in this pass.

**Maya Chat → Galaxy Navigation (Model C)**, new/extended test files:
- `analysis/galaxyEntity.test.ts` (+12, 19 total) — `buildNavigationCandidateList`: lists active
  journeys/non-archived goals/bills correctly (done journeys excluded), bounded even with many
  entities, space-scoped. `resolveNavigationIntent`: a valid candidate resolves; a nonexistent id
  is rejected; an unsupported kind — including `"node"`, deliberately excluded since memory
  navigation already has citations — is rejected; a real entity from ANOTHER space is rejected;
  no candidates → no navigation; multiple candidates resolve in the model's own order, first
  valid one wins, the rest are ignored; the reason always equals `navigationIntentFor`'s
  descriptor state; a model-injected `reason`/`domain` on the candidate is silently ignored;
  resolving navigation performs zero database writes.
- `__tests__/chatNavigation.test.ts` (5, new) — full `chat()` → scripted-LLM-candidate → server
  validation → `ChatResponse.navigation`, using a real in-memory DB (no mocking of the code under
  test, matching this repo's established integration-test discipline): a valid candidate
  produces a correct, real `NavigationIntent`; a nonexistent candidate never reaches the
  response; no candidate → no navigation, no error; existing citation validation is completely
  unaffected by navigation being present in the same response; a candidate from another space
  never resolves end-to-end.
- `web/src/api/graph.test.ts` (5, new) — `galaxyEntityKindFromRef`: correctly maps journey/
  fin_bill/fin_goal refs, returns `null` for a memory ref (by design) and for an unrecognized
  money kind rather than guessing.
- `web/src/components/ChatDock.smoke.test.tsx` (+5) — a response carrying `navigation` renders a
  click-to-navigate chip; clicking it calls `onNavigate` with the exact `NavigationIntent` and
  never fires merely from rendering; reloading persisted chat history containing `navigation`
  does NOT auto-fire it on mount (the loop guardrail); a click with no `onNavigate` provided
  never throws; existing citation chips are completely unaffected.

Server suite total after this pass: **683/683**. Web suite total: **318/318**. Full gate
(typecheck + server tests + web tests + web build) green.

## ✅ Acceptance criteria

**Phase 1** (unchanged, still holds):
1. A unified epistemic vocabulary exists and is used by at least one real claim producer.
2. Existing contradiction detection is reframed into chat-visible, appropriately-hedged claims —
   never asserted as fact.
3. Existing thought-continuity detection (evolution links) is reframed the same way.
4. A deterministic clarification gate exists, is cooldown-limited, and is unit-tested in
   isolation from any database.
5. Chat receives this via the exact same integration pattern as every existing domain snapshot.
6. Zero domain-fact writes beyond documented, narrow operational/provenance writes.
7. Full gate green; zero regressions in Money/Wealth/Life Vision/Journeys/People/Growth/Pay
   Stubs/Galaxy/the just-shipped temporal layer.
8. Every deferred capability is named explicitly, not silently dropped.

**I1–I3 completion pass**, additionally:
9. A bounded causal-reasoning layer infers possible downstream effects from existing change
   detection, always `status:"possible"`, never asserted as proven causation.
10. A clarification the user answers becomes a real, provenance-carrying memory node, retrievable
    through the SAME existing retrieval infrastructure, without rewriting any historical memory.
11. Every Journey hub / Money-sky star click resolves to a real, human-meaning descriptor via a
    single bounded server lookup, and a resulting camera navigation always carries an explained,
    non-invented reason.
12. No new persistence duplicates an existing domain's source of truth (verified explicitly by
    Scenario 9's node/Journey-count test).
13. Full gate green (typecheck + 666 server tests + 308 web tests + web build); every new
    space-scoped mechanism has a direct isolation test.

**Maya Chat → Galaxy Navigation (Model C)**, additionally:
14. The LLM never becomes the authority for a navigation target — every proposed candidate is
    independently re-resolved (space-scoped, kind-checked) via the SAME `resolveGalaxyEntity`
    I3 already built before it can become a `NavigationIntent`; an invented, wrong-space, or
    unsupported-kind proposal simply produces no navigation.
15. A `NavigationIntent`'s `reason` always comes from `navigationIntentFor`'s already-computed
    descriptor state — a model-injected reason/domain field is provably ignored (dedicated test).
16. At most one navigation target per response; camera movement happens ONLY on an explicit user
    click, never automatically and never replayed from persisted chat history on reload.
17. Candidate-list generation is bounded (≤6 total) and reuses existing repos with zero new
    relevance engine; resolution costs an extra DB lookup only when the model actually proposes
    something, never on every message; zero additional LLM calls.
18. Full gate green (typecheck + 683 server tests + 318 web tests + web build); existing
    citation validation, chat retrieval, and every other I1–I3 mechanism verified unaffected.
19. Every remaining gap (multi-target/auto-navigation, candidate domains beyond Journeys/Goals/
    Bills, on-device visual confirmation, causal reasoning's Money/Wealth-only domain coverage,
    no clarification auto-expiry) is named explicitly in "V1 limitations," not silently dropped.
