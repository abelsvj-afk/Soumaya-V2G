# Maya Intelligence Architecture Freeze (Phase K)

> **Status: LOCKED.** Baseline commit `4ec0319` (Maya Longitudinal Intelligence Phase J). This
> document freezes the intelligence architecture built across Phases A–J and states, explicitly,
> what is and is not part of it, so future work builds ON this foundation instead of expanding it
> reflexively. This is a documentation-only phase — see §14 for what (if anything) changed in code.

## 1. Baseline

- **Commit:** `4ec0319` ("Maya Longitudinal Intelligence Phase J: reality test / product
  evaluation"), HEAD of `claude/soumaya-second-brain-v1-m4z4hc`, verified identical to
  `origin/claude/soumaya-second-brain-v1-m4z4hc`.
- **Working tree:** clean at the start of this phase (`git status --short` — no output).
- **Verification run for this phase** (see §14 for full numbers): typecheck clean, 844 server +
  320 web tests pass, web build succeeds — **identical** to the counts Phase J's own final report
  recorded, confirming nothing drifted between phases.

## 2. Current architecture (actual, as implemented — not idealized)

Traced directly from `packages/server/src/chat/graphrag.ts`'s `chat()`, the single production
entry point every one of these capabilities runs through:

```
user message
  → embed(question)                                          [embeddings/adapter.ts]
  → GraphRAG retrieval: KNN + BM25 keyword search + RRF fusion
    + bounded multi-hop expansion                             [db/vec.ts, db/fts.ts, graph/traversal.ts]
  → context nodes assembled (id/label/type/content/occurredAt) [repositories/nodes.repo.ts]
  → knowledge-doc RAG (relevance-gated, KNOWLEDGE_THRESHOLD)   [db/vec.ts knnDocs]
  → instruction-profile auto-routing (KNN, AUTO_PROFILE_THRESHOLD) [repositories/instructions.repo.ts]
  → live telemetry (usage/economy/agent_logs/pre-existing full-node scan) [chat/graphrag.ts:135]
  → behavior read (recent-vs-baseline delivery cues)           [persona/behavior.ts]
  → FINANCE SNAPSHOT (balance/bills/spending/GOALS)             [finance/snapshot.ts]
  → PEOPLE snapshot                                             [analysis/people.ts]
  → COGNITIVE snapshot (goals/ideas/skills/identity/Life Vision) [analysis/cognitive.ts]
  → TEMPORAL snapshot (overdue/upcoming/stale/recent changes)   [analysis/temporalContext.ts]
  → INTELLIGENCE snapshot: contradictions, persisting themes,
    supersession, cross-domain causal links, one gated
    clarification suggestion (writes a pending row if asked)   [analysis/intelligence.ts, causal.ts, supersession.ts]
  → EMOTIONAL snapshot (bounded to this message's retrieved ids) [analysis/emotional.ts]
  → INTERACTION PREFERENCE snapshot (durable, evidence-gated)   [analysis/interactionPreferences.ts]
  → clarification resolution (does THIS message answer a
    pending question? if so, appends "CLARIFICATION RESOLVED") [analysis/clarificationResolution.ts]
  → persona ("About Me") + short conversation history
  → Galaxy navigation candidate list (small, bounded, scoped
    to the user's own active Journeys/Goals/Bills)             [analysis/galaxyEntity.ts]
  → ONE LLM answer() call, given all of the above as
    systemExtra + context + knowledge + history + candidates   [llm/adapter.ts, llm/prompts.ts]
  → post-answer learning: record any NEW interaction-preference
    evidence the model's answer proposed (best-effort)         [analysis/interactionPreferences.ts]
  → navigation: server independently re-resolves the model's
    proposed candidate (id+kind only) against real, space-
    scoped data — a raw LLM id never reaches the client         [analysis/galaxyEntity.ts]
  → citation validation (only real, resolvable node ids survive)
  → ChatResponse: { answer, citations, contextIds, tone, mood,
    askBack, appliedRoles, appliedDocs, navigation }
```

Every snapshot step from FINANCE through the clarification-resolution step is independently
wrapped in its own `try/catch` — see §9 (Failure isolation). Steps not shown as chat-called
(entity timeline reconstruction, the standalone relevance combiner) are documented in §4 as
deliberate non-integrations, not omissions from this diagram.

## 3. Capability registry

| Capability | Status | Production path | Notes |
|---|---|---|---|
| GraphRAG retrieval | **Locked** | `chat/graphrag.ts` (`knn`+`keywordSearch`+`fuseRrf`+`multiHopNeighbors`) | Known relevance-floor limitation — see §6, Finding 1. No threshold on the primary memory path (unlike knowledge-doc RAG's `KNOWLEDGE_THRESHOLD`). |
| Temporal reasoning | **Locked** | `chat/graphrag.ts` → `analysis/temporalContext.ts` (`temporalSnapshotText`) | Cross-domain (Money/Wealth/Life Vision/Journeys/Mind/People), deterministic classification (`analysis/temporal.ts`, `analysis/temporalChange.ts`). |
| Entity continuity | **Locked** | `analysis/cognitive.ts` (`linkCognitiveAnchor`/`applyCognitiveGravity`), consumed indirectly via the Cognitive/Mind snapshot | Runs on create/edit + a periodic sweep, not inside `chat()` directly (Phase F's audited, sufficient design — no dedicated extension built). |
| Supersession | **Locked** | `chat/graphrag.ts` → `analysis/intelligence.ts` (`supersessionClaims`) → `analysis/supersession.ts` (`resolveSupersession`) | Pure arithmetic date-order resolver, no LLM call; produces `"outdated"`/`"contradicted"` claims additively. |
| Entity timeline reconstruction | **Locked (standalone)** | `analysis/entityTimeline.ts` (`reconstructEntityTimeline`) | **Not called by `chat()`** — a deliberate Phase C decision, re-confirmed by Phase I's audit: no per-message use case exists yet. Fully tested independently. |
| Deterministic relevance | **Locked (standalone)** | `analysis/relevance.ts` (`computeRelevance`) | **Not called by `chat()`** — same deliberate non-integration, re-confirmed by Phase I. Fully tested independently. |
| Emotional intelligence signals | **Locked** | `chat/graphrag.ts` → `analysis/emotional.ts` (`emotionalSnapshotText`) | Bounded to the message's own retrieved ids (`buildEmotionalTrajectoryAmong`); null unless a real recurring pattern exists. |
| Cross-domain causal reasoning | **Locked** | `chat/graphrag.ts` → `analysis/intelligence.ts` → `analysis/causal.ts` (`possibleDownstreamEffects`) | Covers Money, Wealth, and Mind/Emotional domains; always `"possible"`, capped at `MAX_CAUSAL_LINKS`. |
| Clarification → confirmed knowledge | **Locked** | `analysis/intelligence.ts` (raise) + `analysis/clarificationResolution.ts` (resolve) + `repositories/intelligenceClarifications.repo.ts` | Full lifecycle proven through real, sequential `chat()` calls (Phase I Scenario B, Phase J Test 11). |
| Galaxy entity resolution/navigation | **Locked** | `analysis/galaxyEntity.ts` (`buildNavigationCandidateList`/`resolveNavigationIntent`/`resolveGalaxyEntity`) + `chat/graphrag.ts` + `web/components/ChatDock.tsx` | "Propose, server validates" (Model C) — an LLM-proposed id/kind is never trusted; server independently re-resolves it. Camera moves only on the user's own chip click (`ChatDock.tsx`'s `onClick`), never automatically. |
| Learned interaction preferences | **Locked** | `chat/graphrag.ts` → `analysis/interactionPreferences.ts` + `repositories/interactionPreferences.repo.ts` | Evidence-gated (2+ consistent mentions), confidence-capped at 0.9 (never "certain"), explicitly framed as overridable by the current message. |
| Life Vision | **Locked** | `analysis/cognitive.ts` (`kind:"life_vision"`) + `shared/lifeVision.ts` (`visionRequirementCents`) | Funding narrative surfaced via `temporalContext.ts`; excludes archived goals, tracks open-ended (NULL-target) goals separately, never fabricates a dollar figure. |
| Financial Goals | **Locked** | `repositories/finGoal.repo.ts`/`finAllocation.repo.ts` + `finance/snapshot.ts` | Phase J fix: now counted toward "has data" and rendered by name/target/progress in `FINANCE SNAPSHOT` — previously invisible to chat (§6, Finding 2). |
| Journeys | **Locked** | `repositories/journeys.repo.ts` + `journeyLinking.ts` + web `JourneyChips`/`JourneysPanel` | Fully wired end-to-end per Phase H's product audit; surfaced to chat via `temporalContext.ts`'s activity-recency bucket. |
| Money / Wealth | **Locked** | `finance/snapshot.ts`, `finance/summary.ts`, `finance/forecast.ts` | Aggregated, deterministic-math contract ("cite these numbers, do NOT recompute"). |
| Epistemic safety | **Locked** | `shared/intelligence.ts` (`EpistemicStatus` vocabulary) throughout `analysis/intelligence.ts`/`causal.ts`/`supersession.ts` | `fact\|observation\|inference\|hypothesis\|possible\|unknown\|confirmed\|outdated\|contradicted` — never promoted upward without real evidence. |
| Historical truth preservation | **Locked** | Every write path (`ingest`, `resolveClarificationFromMessage`) only ever ADDS a new node/edge — nothing mutates an existing memory's content | Verified directly, repeatedly, under fresh narratives in Phase J (§6). |
| Cross-domain reasoning | **Locked** | `chat/graphrag.ts` assembling Journeys+Money+Mind+memory snapshots into one prompt | Phase J Test 6: proven structurally (all present in one `systemExtra`), not siloed. |
| Space isolation | **Locked** | Every repo/analysis function takes `spaceId` explicitly; `auth/spaces.ts`'s `TABLES_WITH_SPACE` | Phase I's cross-pipeline isolation test covers the full integrated stack at once. |
| Bounded retrieval/context assembly | **Locked (with the one known exception)** | `opts.k`/`opts.depth` caps, `MAX_*` constants throughout `analysis/*.ts` | The one known unbounded read is `chat/graphrag.ts:135`'s pre-existing telemetry `NodesRepo.all()` — documented since Phase H, unchanged, out of scope for every phase since. |
| Failure-isolated intelligence snapshots | **Locked** | Every snapshot call site in `chat()` wrapped in its own `try/catch` | See §9. |
| Chat → Galaxy navigation | **Locked** | Same as "Galaxy entity resolution/navigation" above | — |
| Integrated real-chat behavior validation | **Locked** | `__tests__/longitudinalIntegration.test.ts` (Phase I), `__tests__/mayaRealityTest.test.ts` (Phase J) | Both drive the real `chat()` entry point end-to-end, not isolated function calls. |

## 4. Locked capabilities

The 22 capabilities listed in the Phase K task brief (GraphRAG retrieval through "integrated
real-chat behavior validation") are all represented in §3 above and are considered **feature-
complete for this development cycle**. Do not redesign them. Two are locked as **standalone,
tested, deliberately-not-wired-into-chat** functions (entity timeline reconstruction, deterministic
relevance) — this is not a gap; it is a considered decision, re-confirmed under Phase I's stricter
integration audit and again in this freeze. Wiring either in requires a demonstrated per-message
use case first, per the architecture change policy (§13).

## 5. Intentional non-features (architectural boundaries, not deficiencies)

Maya deliberately does **not**:

- maintain a new, generic world-state database — the `nodes`/`edges` graph plus the existing
  domain tables (finance, journeys, cognitive) are the only persisted state;
- maintain a generic entity/alias database beyond the existing cognitive-anchor mechanism
  (`analysis/cognitive.ts`) — ambiguous entities are handled by linking to multiple plausible
  anchors, never by inventing a new identity-resolution system;
- run an autonomous personality engine — persona derivation (`persona/derive.ts`) reads observed
  facts, it does not simulate or role-play an evolving personality;
- perform autonomous emotional diagnosis — `analysis/emotional.ts` surfaces a pattern as a
  SIGNAL, never a clinical label, and nothing in the pipeline is permitted to assert "you are X";
- run unrestricted causal inference — `analysis/causal.ts` only ever produces `status: "possible"`
  links, capped in count, always temporally gated;
- perform implicit behavioral profiling — the only behavioral model is the explicit, evidence-
  gated `interaction_preferences` table, never a hidden/opaque user model;
- move the Galaxy camera automatically — navigation only ever happens from the user's own click
  on a chip the server has already validated (`ChatDock.tsx`'s `onClick`);
- let the LLM control arbitrary entity ids — every LLM-proposed id (navigation, preference
  signal) is untrusted data the server independently re-resolves or re-evaluates; never executed
  directly;
- persist a permanent relevance score — `analysis/relevance.ts`'s tiers are computed fresh per
  call, never stored as a fact about a memory;
- automatically rewrite historical memories — every intelligence mechanism only ever ADDS new
  claims/nodes/edges; no code path updates an existing memory's `content`/`label` in response to
  later information;
- run a speculative ML model of any kind — no fine-tuning, custom classifier, or ranking model
  exists anywhere in this pipeline; every "intelligence" mechanism is either deterministic
  arithmetic or a single, already-existing LLM call;
- automatically route chat to external/web context — `webLookup` exists as an autonomous AGENT
  TOOL (`agent/tools/webLookup.ts`), invoked only by the autonomy sweep, never from `chat()`
  itself. See §11 for the future decision criteria.

## 6. Phase J findings

### Finding 1 — GraphRAG relevance floor: **DEFERRED**

GraphRAG's primary memory-retrieval path (`knn` + `keywordSearch` + `fuseRrf` in
`chat/graphrag.ts`) has no minimum-similarity floor, unlike the sibling knowledge-doc RAG path
(`KNOWLEDGE_THRESHOLD = 0.3` gating `knnDocs` hits). Phase J's Tests 1/2/14 demonstrated this
directly: with a sparse memory graph, top-k retrieval returns the "least dissimilar" memories even
when none are genuinely relevant, and they get surfaced to the LLM with the same confidence as a
truly relevant memory. This is a real product-quality limitation, not a fabricated concern.

**It was deliberately NOT fixed in Phase J, and is NOT being fixed in Phase K.** Reasons, recorded
here so the decision isn't re-litigated from scratch later:
- This function sits at the center of every single `chat()` call — a wrong threshold has the
  widest possible blast radius in the entire application.
- The only embedding model this sandbox can measure against (`HashEmbeddingProvider`) is a crude
  word-hash with no real semantic capture — measured directly (Phase J): even clearly-related
  sentences score ~0.20–0.24 cosine similarity, nowhere near representative of a real production
  embedding model (MiniLM/OpenAI). Tuning a threshold against this data would be tuning against
  noise, not signal.
- The existing `KNOWLEDGE_THRESHOLD` precedent presumably reflects real measurement against a real
  embedding model at the time it was set — the same discipline should apply here before copying
  its value or picking a new one by intuition.

**Status: DEFERRED — requires real embedding evaluation** (see §12 for the concrete plan). Do not
implement a relevance threshold, a new ranking model, or heuristic keyword filters against this
finding until that measurement exists. Do not modify core retrieval merely to make sandbox tests
look cleaner.

### Finding 2 — Financial Goal snapshot: **FIXED / LOCKED**

`finance/snapshot.ts`'s `financialSnapshotText` never surfaced Financial Goals at all — its own
closing line told the LLM to "reason from... the user's goals" while never actually giving it any
goal data, and a Goal created before any income/bill was logged produced ZERO finance context in
chat (the `hasData` gate only checked income/bills). This was a genuine, narrow integration defect
with an obvious root cause, not a design question.

**Fixed in Phase J** (commit `4ec0319`): `hasData` now also triggers on `FinGoalRepo(...).list()`
having any rows; the returned text now includes a `Financial Goals (savings buckets): ...` line
with each goal's name, target-or-"no target amount set", and real, deterministic saved-so-far
amount (reusing `FinAllocationRepo.totalsByGoal`, already used identically elsewhere in
`temporalContext.ts`). Three regression tests were added
(`packages/server/src/__tests__/financeStage23.test.ts`): goal-only data counts as "has data";
real progress numbers render correctly including the open-ended (NULL target) case; an
all-archived space with no other data still correctly returns `null`.

**Status: FIXED / LOCKED** — this fix is now part of the frozen baseline; do not revert or
re-litigate it without a new reality-test failure demonstrating a problem with it.

## 7. Architecture boundary audit (duplicate-systems search)

A dedicated read-only search of `packages/server/src` and `packages/shared/src` was run against
the ten categories the task specifies (cross-checked independently by a second pass over the same
categories). Summary — **no accidental or competing duplicate found in any category**; every
additional mechanism turned up below is a distinct, legitimate, already-intentional piece of the
architecture, named explicitly here so the freeze record is complete rather than approximate:

1. **Alternate/duplicate memory or entity stores** — none. The only vector tables are
   `vec_nodes`, `vec_docs`, `vec_profiles`, `vec_journeys` (`db/vec.ts`) — each backs a distinct,
   already-documented feature (memories, uploaded documents, instruction profiles, Journeys), not
   a duplicate of another. `journeys`/`journey_link` explicitly LINK rather than copy content, and
   `intelligence_clarifications` tracks only the question lifecycle — the resolved fact always
   becomes a real `nodes` row, never a parallel fact store. No generic "entities"/"world_state"
   table exists.
2. **Duplicate entity resolution** — none beyond `analysis/cognitive.ts`'s
   `linkCognitiveAnchor`/`applyCognitiveGravity` (name/alias + semantic-KNN linking, in-text
   ambiguous-mention resolution) and `analysis/galaxyEntity.ts`'s `resolveGalaxyEntity`
   (Galaxy-body lookup by kind+id — a rendering/navigation job, not "who is this person"). Two
   further mechanisms exist but solve different problems, not the same one twice:
   `analysis/people.ts`'s `mergeDuplicatePeople`/`suggestPeople` (exact-label roster
   de-duplication and "you mention this name often, add them" surfacing) and `analysis/dedup.ts`'s
   `sweepDuplicates`/`mergeMemories` (near-identical MEMORY content dedup by embedding similarity —
   not entity identity at all).
3. **Duplicate temporal engines** — none. `analysis/temporal.ts` (pure classification),
   `analysis/temporalChange.ts` (period-over-period diffing), `analysis/temporalContext.ts`
   (cross-domain assembly + chat snapshot), `analysis/temporalChains.ts` (evolution-link
   detection, reused by Phase A's supersession work), and `lib/time.ts` (the one shared tolerant
   timestamp parser) are each a distinct layer, not competing implementations of the same job.
   Two more date-arithmetic modules exist but answer different questions: `analysis/future.ts`'s
   `upcomingEvents`/`rollPastEvents` drive a single node-kind's lifecycle transition
   (`future_event` → `memory`) via raw SQL date math rather than classifying a `TemporalState`, and
   `analysis/foresight.ts` predicts whether a recurring pattern is due soon — neither re-implements
   `temporal.ts`'s single-fact classification. `shared/src/temporal.ts` is types-only, correctly
   deferring all logic to `analysis/temporal*.ts`.
4. **Duplicate causal engines** — none. `analysis/causal.ts`'s `possibleDownstreamEffects` is the
   only causal-inference code in the repository; `analysis/intelligence.ts` calls it directly
   rather than re-deriving causal links.
5. **Duplicate emotion systems** — none. `analysis/emotional.ts` (longitudinal trajectory/pattern
   detection over dated, valenced memories) and `analyzeSentiment` (`shared/src/dramatize.ts`, a
   single message's valence at ingestion time, used by `llm/heuristic.ts`) are different jobs at
   different layers, not two implementations of the same thing. A third mechanism,
   `dramatize.ts`'s `toneFrom`/`moodFromTone`/`prosodyFor` (used in `chat/graphrag.ts` to pick the
   chat REPLY's delivery tone/TTS prosody), is a real-time speech-delivery-affect model — it
   internally reuses `analyzeSentiment` rather than re-inferring mood independently, and answers
   "how should THIS reply sound," not "what pattern does this person's history show." **Noted
   limitation, not a duplicate:** `buildEmotionalTrajectory`'s "steady" trend default on zero data
   is a previously-flagged (in `shared/src/temporal.ts`'s own comment), unfixed rough edge — a
   minor cosmetic default, not a correctness issue, and out of scope for this freeze.
6. **Duplicate relevance/ranking systems** — none; the opposite issue, already documented in §3/§4:
   `analysis/relevance.ts`'s `computeRelevance` has **zero production callers** — only its own test
   file and `causal.test.ts` import it. GraphRAG's KNN+BM25+RRF fusion (`chat/graphrag.ts`,
   `db/fts.ts`'s `fuseRrf`) is the only ranking mechanism actually wired into retrieval today. One
   relevance module, one retrieval-fusion module, not wired together — consistent with the
   deliberate non-integration §3/§4 already record, not an accidental duplicate.
7. **New "world state" abstractions** — none. No table or module holds a generic mutable "current
   state of the world" outside the `nodes`/`edges` graph and the named domain tables (finance,
   journeys, cognitive/mind). `space_meta` is narrowly scoped to fuel/streak/presence/research-mode
   toggles, not a world-state store.
8. **Competing personality/persona state** — none. `user_persona` has exactly one writer
   (`persona/derive.ts`'s `refreshPersona`/`derivePersona`, via `UserPersonaRepo`);
   `persona/behavior.ts`'s `deriveBehavior` is a distinct, explicitly-documented, never-persisted
   layer ("who they are" vs. "how to be with them right now"); `analysis/identity.ts` is a
   different concept again (per-node confidence for a user-declared identity statement like "I am
   a runner," not global persona storage); `identity.ts`'s `soulText`/`soulTextFor` is the sole
   soul.md mechanism. No overlap between any of the four.
9. **Redundant preference storage** — none. `interaction_preferences` has exactly one writer
   (`analysis/interactionPreferences.ts`'s `recordPreferenceSignal`) and its own schema comment
   states it's kept separate from both `nodes` and `instruction_profiles` by design (Phase H's
   "category error" reasoning). No other table stores a preference/behavioral setting.
10. **Autonomous/automatic navigation mechanisms** — none. Every navigation-adjacent path
    (`api/routes/graph.ts`, `chat/graphrag.ts`) routes through `buildNavigationCandidateList` → an
    explicitly-UNTRUSTED LLM proposal → `resolveNavigationIntent` as sole authority, itself built
    only from `resolveGalaxyEntity`'s validated descriptor. `resolveNavigationIntent` deliberately
    EXCLUDES the `"node"` kind (memories) specifically to avoid opening a second path to memory
    navigation alongside citations — a defense-in-depth detail worth recording. No timer,
    autonomy-sweep job, or background process navigates the Galaxy; the only camera-moving code
    client-side is `ChatDock.tsx`'s chip `onClick`.

**Conclusion: the architecture is clean.** No accidental duplicate or competing system was found
in any of the ten audited categories; every additional mechanism named above is legitimate and
already serves a distinct, non-overlapping purpose.

## 8. Regression coverage audit

Every invariant the task lists as requiring protection is already covered by existing tests — no
new regression test was needed this phase (only the two already added in Phase J itself, per
Finding 2 above, which remain part of the baseline):

| Invariant | Covered by |
|---|---|
| Historical truth (later info cannot rewrite records) | `analysis/supersession.test.ts`, `analysis/relevance.test.ts`, `__tests__/mayaIntelligenceI1I3.test.ts`, `__tests__/longitudinalIntegration.test.ts`, `__tests__/mayaRealityTest.test.ts` |
| Supersession direction | `analysis/supersession.test.ts`, `analysis/causal.test.ts`, `analysis/intelligence.test.ts`, `__tests__/entityContinuity.test.ts`, `__tests__/longitudinalIntegration.test.ts`, `__tests__/mayaRealityTest.test.ts` |
| Entity identity (no silent merging) | `__tests__/entityContinuity.test.ts`, `__tests__/mayaRealityTest.test.ts` |
| Epistemic safety (possible ≠ confirmed) | `analysis/causal.test.ts`, `analysis/supersession.test.ts`, `__tests__/mayaIntelligenceI1I3.test.ts`, `__tests__/entityContinuity.test.ts` |
| Emotional safety (signal ≠ diagnosis) | `__tests__/emotional.test.ts`, `__tests__/emotionalChat.test.ts`, `__tests__/longitudinalIntegration.test.ts`, `__tests__/mayaRealityTest.test.ts` |
| Causal safety (sequence ≠ causation) | `analysis/causal.test.ts`, `analysis/galaxyEntity.test.ts`, `__tests__/mayaIntelligenceI1I3.test.ts`, `__tests__/longitudinalIntegration.test.ts`, `__tests__/mayaRealityTest.test.ts` |
| Clarification (correction → confirmed knowledge) | `analysis/clarificationResolution.test.ts`, `analysis/entityTimeline.test.ts`, `__tests__/entityContinuity.test.ts`, `__tests__/mayaIntelligenceI1I3.test.ts` |
| Preferences (explicit instruction overrides learned) | `analysis/interactionPreferences.test.ts`, `__tests__/interactionPreferencesChat.test.ts`, `__tests__/longitudinalIntegration.test.ts`, `__tests__/mayaRealityTest.test.ts` |
| Financial hierarchy (Life Vision → Financial Goal) | `__tests__/lifeVisionShared.test.ts`, `__tests__/mayaRealityTest.test.ts` |
| Archived state (never inflates active reasoning) | `__tests__/mayaRealityTest.test.ts` (TEST 9), `__tests__/financeStage23.test.ts` |
| Galaxy (invalid/cross-space rejected) | `__tests__/chatNavigation.test.ts`, `analysis/galaxyEntity.test.ts`, `__tests__/longitudinalIntegration.test.ts`, `__tests__/mayaRealityTest.test.ts` |
| Security (no cross-space leakage) | Present across nearly every `__tests__`/`analysis/*.test.ts` file as a "defensively mis-scoped row" test; `__tests__/longitudinalIntegration.test.ts`'s dedicated cross-pipeline isolation test covers the full integrated stack at once. |
| Performance (no newly introduced unbounded scans) | `vi.spyOn(NodesRepo.prototype, "all")` bounds tests present in `emotional.test.ts`, `entityContinuity.test.ts`, `interactionPreferencesChat.test.ts`, `longitudinalIntegration.test.ts`, `causal.test.ts`, `entityTimeline.test.ts`, `interactionPreferences.test.ts`, `relevance.test.ts`, `temporalChains.test.ts`. |
| Financial snapshot (Goals visible) | `__tests__/financeStage23.test.ts` (3 tests added in Phase J, retained). |

## 9. Failure isolation

Re-verified directly from `chat/graphrag.ts`: every OPTIONAL intelligence component sits behind its
own `try/catch`, independent of every other:

- `financialSnapshotText` (finance snapshot)
- `peopleSnapshotText` (people snapshot)
- `cognitiveSnapshotText` (cognitive/Mind snapshot)
- `temporalSnapshotText` (temporal snapshot)
- `intelligenceSnapshotText` (intelligence snapshot — contradictions/supersession/causal/clarification-raise)
- `emotionalSnapshotText` (emotional snapshot)
- `interactionPreferenceSnapshotText` (interaction preference snapshot)
- `resolveClarificationFromMessage` (clarification resolution)
- `buildNavigationCandidateList` / `resolveNavigationIntent` (navigation build + resolve, two
  separate try/catch blocks)

A failure in any ONE of these degrades gracefully — that section simply contributes nothing to
`systemExtra` (or, for navigation, no candidate list / no resolved intent) — the core retrieval →
answer → citation pipeline is never blocked by an optional component's exception. This pattern
predates Phases A–J and was preserved, never modified, throughout all of them.

## 10. Performance baseline

Confirmed via the existing, passing bounds tests (§8) and Phase I/J's own dedicated performance
checks: the ONLY unbounded read anywhere in the `chat()` call graph is the pre-existing telemetry
scan at `chat/graphrag.ts:135` (`const allNodes = nodesRepo.all();`), which predates every
longitudinal phase and feeds the "CURRENT APP STATE & SYSTEM TELEMETRY" block. `NodesRepo.all()`
is called **exactly once per `chat()` turn**, verified with the full longitudinal stack (Phase I)
and the full Phase J reality-test stack active simultaneously — no phase, including this one,
introduced a second full-space scan, per-candidate embedding generation, duplicate retrieval, or
repeated snapshot computation. No new LLM calls were introduced this phase (`financialSnapshotText`
is pure deterministic arithmetic over already-fetched repo rows).

## 11. Security boundaries

Every repository and analysis function takes `spaceId` explicitly; every new table added across
Phases A–J was added to `auth/spaces.ts`'s `TABLES_WITH_SPACE`. Phase I's dedicated
cross-pipeline isolation test (contradiction + causal + emotional + durable preference + an active
Journey, built in one space, then queried from a second) confirmed nothing leaks across the FULL
integrated stack, not just per-feature. No new space-crossing code was introduced in Phase J or
this freeze phase.

## 12. External context boundary

**Current state:** external-lookup capability exists (`llm/adapter.ts`'s optional `webLookup`,
implemented by `llm/gemini.ts`/`llm/resilient.ts`), but is wired ONLY into the autonomous agent
tool registry (`agent/tools/webLookup.ts`, `agent/tools/registry.ts`) — never into `chat()`.
Automatic external-context routing during a normal conversation is **intentionally deferred**, not
missing by oversight.

**Future decision criteria** — external context should only be introduced into chat when the
product has a clear, demonstrated requirement for questions that need CURRENT external
information the user's own memory graph cannot contain, such as:
- current freight rates
- current regulations
- current company policies
- current job openings
- current market information
- current weather/road conditions

**Non-negotiable design constraint when it IS eventually implemented:** external information must
remain clearly, structurally distinct from personal memory — it must never silently become a
"fact about the user" stored the same way an ingested memory is. It should be tagged/rendered
distinctly in `systemExtra` (a separate "EXTERNAL CONTEXT (not personal, may be time-sensitive)"
block, analogous to how `EMOTIONAL CONTEXT`/`INTELLIGENCE NOTES` are already clearly labeled and
scoped) and never written into the `nodes` table as if the user stated it themselves.

## 13. Future embedding evaluation plan (the next MEASUREMENT, not the next feature)

When a real embedding model becomes available in an environment that can run one:

1. **Build a retrieval benchmark dataset** covering: relevant memories, irrelevant memories,
   similar-but-wrong entities (the "two Jordans" class of case), old-but-important memories,
   recent-but-irrelevant memories, superseded memories, and cross-domain memories.
2. **Measure retrieval quality** at minimum: Precision@K, Recall@K, false-positive rate,
   false-negative rate, citation relevance — against the REAL model's actual score distribution,
   not the hash embedder's degenerate small-corpus numbers measured in Phase J.
3. **Evaluate candidate relevance floors from that data.** Do not choose a threshold by intuition,
   and do not simply copy `KNOWLEDGE_THRESHOLD`'s `0.3` without separately justifying it for the
   primary memory path, which has different retrieval characteristics (multi-hop expansion,
   keyword fusion) than the knowledge-doc path it was set for.
4. **Only then, re-run the Maya Reality Test** (`docs/specs/maya-reality-test.md`,
   `__tests__/mayaRealityTest.test.ts`) to confirm the measured threshold actually improves the
   product's real behavior before shipping it.

This is a measurement task, not a coding task, and is explicitly not part of this freeze.

## 14. Architecture change policy

> **Maya's intelligence architecture is now frozen. Future intelligence changes must be driven by
> measured product failures, not by theoretical capability gaps.**

The required workflow for any future intelligence change:

```
Reality test → identify failure → determine cause → smallest justified fix → regression test
→ reality test again
```

**Not:** idea → new subsystem → implementation. No fine-tuning, personalization model, behavioral
classifier, emotion classifier, custom ranking model, prediction model, reinforcement learning, or
neural entity resolver should be introduced unless a MEASURED product requirement — a specific,
reproducible Reality Test failure, not a hypothetical gap — proves the existing deterministic/LLM
combination cannot solve it. The architecture already has room for ML if it's ever justified; that
is not the same as ML being currently justified.

## 15. Verification (this phase)

- `git status --short`: clean before and after this phase's documentation-only change.
- `npm run typecheck`: clean (server, shared, web).
- `npm test` (server): **97 test files, 844 tests, all passing** — identical to the Phase J
  baseline count (no regression, no drift).
- `npm test` (web): **52 test files, 320 tests, all passing** — identical to the Phase J baseline
  count.
- `npm run build -w @brain/web`: succeeds.
- No code changes were required or made in this phase — every invariant the task asked to protect
  was already covered (§8), and no accidental duplicate system was found (§7). This document
  itself is the only change.

---

## Final verdict

**Architecture Status:** **LOCKED**

**Product Status:** **STABLE**

**Known Intelligence Limitation:** GraphRAG relevance floor (§6, Finding 1) — deferred, not
fixed, pending real embedding measurement.

**Immediate Build Recommendation:** **NO NEW INTELLIGENCE FEATURES.**

**Next Meaningful Intelligence Experiment:** Only once a real embedding model is available:
retrieval measurement → relevance-floor evaluation → Maya Reality Test, re-run.

Phase J found no fundamental missing intelligence subsystem, and Phase K's architecture audit
found no accidental duplication or drift. The correct engineering decision is to stop building
intelligence architecture and let the next phase of work be a different product layer, returning
to this one only when a real, measured Reality Test failure demands it.
