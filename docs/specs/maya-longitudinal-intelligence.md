# Spec — Maya Longitudinal Intelligence: Architecture Foundation

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) / [WORKFLOW.md](../../WORKFLOW.md).
> Parent docs: [maya-intelligence-architecture.md](./maya-intelligence-architecture.md) (I1–I3:
> causal reasoning, clarification lifecycle, Galaxy entity intelligence, Chat → Galaxy
> Navigation — all locked, all reused here, none redesigned) and
> [temporal-contextual-reasoning.md](./temporal-contextual-reasoning.md) (the deterministic
> temporal layer this document builds directly on top of).
>
> **Status: ARCHITECTURE ONLY. Nothing in this document has been implemented.** Per the
> brief's own explicit instruction, this pass is inspection + design, not code. The one
> exception, tracked and delivered separately from this document, is a small, verified,
> unrelated bug fix (pay stub saving silently failing) — see the session's commit log, not
> this spec.

## 1. Mission

Evolve Maya from *"a chatbot that retrieves memories and reasons over some structured
context"* into a longitudinal personal reasoning system: one that understands what was true,
when it was true, what changed it, what is probably true now, what remains uncertain, how a
change in one part of the user's life affects the rest of it, and how the user's current
context changes the meaning and relevance of the past.

**Locked invariant** (carried forward verbatim, the organizing constraint for every decision
below): *Historical truth must remain historical truth. Current truth must be derived
conservatively. Inference must remain distinguishable from fact.*

## 2. Design Principles

1. **Reuse before invention.** Every capability below is checked against this repo's existing
   mechanisms first (Section 4). Three concepts in this document are genuinely new; everything
   else extends something that already exists.
2. **Derive, never duplicate.** State-over-time is *computed* from authoritative domain data on
   read, the same way `graph/service.ts`'s `enrich()`, `finance/summary.ts`'s
   `getBudgetSummary()`, and `analysis/temporalContext.ts`'s `buildTemporalContext()` already
   do it for three unrelated domains — never a second, persisted "world state" database.
3. **Confidence and epistemic status stay separate, always.** The one architectural mistake
   already made once in this codebase (`analysis/dreamCycle.ts` folding LLM confidence into
   `importance`) must never be repeated, including here.
4. **The LLM proposes; the server verifies.** Every new LLM-facing capability follows the exact
   trust boundary already proven twice this session (`citations: number[]` validated against
   `ctxNodes`; `navigationCandidates` validated via `resolveGalaxyEntity`) — an LLM output is
   *never* trusted as authoritative identity, only as a candidate.
5. **Bounded by construction.** No new capability scans the whole memory graph on a chat
   message. Section 18 documents an *existing* violation of this rule that must be fixed before
   adding more reasoning on top of it.
6. **History is never rewritten.** A memory's content, once written, is never mutated to
   reflect later information. "Current" is a *label applied by the reasoning layer*, never a
   destructive edit.
7. **Smallest coherent architecture.** Do not create a new subsystem where extending an
   existing one closes the same gap.

## 3. Current Architecture (verified this pass)

The full pipeline, as it exists on commit `9a4419b` (before this pass's one bug-fix commit):

```
User message
  → chat() (chat/graphrag.ts)
     ├─ hybrid retrieval: embed → knn() + keywordSearch() → fuseRrf() → multi-hop expand
     ├─ 8 best-effort snapshot/side-effect blocks, in order:
     │    telemetry → behavior → finance → people → cognitive → temporal →
     │    intelligence (I1 causal + contradiction/continuity) →
     │    I2 clarification resolution (may write ONE memory node + edge)
     ├─ deps.llm.answer(question, context, {..., galaxyCandidates})   — ONE LLM call
     ├─ citations validated against ctxNodes (server-authoritative)
     ├─ navigation candidate validated via resolveGalaxyEntity (server-authoritative)
     └─ ChatResponse { answer, citations, navigation?, ... }
```

Each snapshot function shares one exact contract: `(handle, spaceId?, now?) => string | null`,
independent `try/catch`, best-effort, null-safe (`chat/graphrag.ts`). This contract is the
single most important existing convention for this document — every new longitudinal capability
that needs to reach the LLM's context should be a ninth function of the same shape, not a new
delivery mechanism.

## 4. Existing Intelligence Capabilities (the reuse inventory)

This is the load-bearing section: everything the Gap Matrix (Section 5) and the proposed
architecture (Section 6+) are checked against.

| Area | What exists | Where |
|---|---|---|
| Time on memories | `created_at`, `occurred_at`, `remind_at`, `reminder_fired_at`, `expires_at`, `last_tended_at`, `deleted_at`, `completed_at`, `next_review_at`/`last_reviewed_at` + SM-2 fields | `db/schema.ts`, `db/client.ts`'s `migrateSchema()` |
| Canonical time parsing | `parseTolerantMs`/`toIsoDate`/`daysBetween`/`daysSince`/`daysUntil` — **not** retroactively applied to 15+ duplicate parsers elsewhere (documented debt) | `lib/time.ts` |
| Cross-domain "now" snapshot | `buildTemporalContext()` — Money/Wealth/Life Vision/Journeys/Mind/People, **computed fresh every call, never persisted**, capped 5 facts/bucket | `analysis/temporalContext.ts` |
| Period-over-period change | `incomeChange`/`netWorthChange`/`goalAllocationChange`, with an explicit `"insufficient_history"` status (never fabricates a 0%/100% delta) | `analysis/temporalChange.ts` |
| Genuine point-in-time snapshots | `fin_asset_snapshot` — the **only** table in the whole schema that is a dated balance reading rather than a recomputed-on-read aggregate | `db/schemaSql.ts`, `finAssetSnapshot.repo.ts` |
| Append-only event ledgers | `fin_income`/`fin_expense`/`fin_allocation` — each row is a dated event, never mutated; "current state" (budget, net worth, goal funding) is always `SUM(...)` on read | `finance/summary.ts`, `finance/wealth.ts` |
| Derived, non-persisted graph state | `GraphService.enrich()` computes `mass`/`degree`/`celestial`/`val` fresh on every read, **never written back** to `nodes` | `graph/service.ts` |
| Entity continuity (proven pattern) | `linkCognitiveAnchor()` — two-pass matcher: (1) name/keyword/alias whole-word match, (2) semantic kNN ≥ 0.75 cosine, capped at 12 links/anchor; the `aliases` field it uses is already generalized (used today for people: `["girlfriend","my girl"]`) | `analysis/cognitive.ts`, `GraphNode.aliases` |
| Durability distinction | `COGNITIVE_META[kind].durable` — goal/skill/person_entity/identity/mental_model/motivation/**life_vision** are entropy-exempt; idea/intention/future_event are not | `shared/celestial.ts` |
| Ephemeral → durable pipeline (proven pattern) | Working memory: decay 0.008/hr, reinforcement +0.3, **auto-promotes to a real node after 3 reinforcements** | `analysis/workingMemory.ts` |
| Revision without destruction (proven pattern) | Dream-cycle belief re-consolidation appends the prior belief text as a lore chapter (`evolveLore(...,"revised")`) and updates in place — **never silently overwritten** | `analysis/dreamCycle.ts` |
| Emotional signal + trajectory | Static `emotionalWeight` per memory (`analyzeSentiment`); trajectory (`average`/`volatility`/`trend`, pattern detection: stress cycle/burnout risk/upswing/downswing) computed **fresh on read, never persisted** | `shared/dramatize.ts`, `analysis/emotional.ts` |
| Relationship vocabulary | `resolves \| complicates \| is_analogous_to \| builds_on \| relates_to \| contradicts \| caused_by \| documentation \| summarizes \| supports` — **no** `supersedes`/`is_same_as`/`evolves_into` | `shared/types.ts` |
| Thought continuity (candidate, unmaterialized) | `buildEvolutionLinks()` finds same-theme memories ≥14 days apart, cosine ≥ 0.84 — explicitly documented as never mutating the graph | `analysis/temporalChains.ts` |
| Contradiction detection (batch) | `runContradictionScan()` — full-space same-topic kNN scan, LLM/heuristic verdict, persisted as `kind:"contradiction"` insights — **confined to the digest route, never per-chat-message** | `synthesis/contradictions.ts`, `api/routes/digest.ts` |
| Epistemic vocabulary | 9-value `EpistemicStatus`, `ProvenanceRef`, `IntelligenceClaim` (confidence kept as its own field, deliberately), `CausalLink`, `ClarificationRecord`, `GalaxyEntityDescriptor`/`NavigationIntent`, `GalaxyNavigationCandidate` | `shared/intelligence.ts` |
| LLM trust boundary (proven pattern, applied twice) | Model proposes (`citations`/`navigationCandidates`); server independently re-resolves against space-scoped data before trusting anything | `chat/graphrag.ts`, `analysis/galaxyEntity.ts` |
| Bounded LLM choice (proven pattern) | `LlmProvider.route?()` — the model picks **indices** into a small deterministic candidate array; it never invents an id | `agent/tools/router.ts` |
| Person continuity | Exact-normalized-label merge only (`mergeDuplicatePeople`) — deliberately **not** fuzzy ("a person's name is sacred"); relationship state (tone, interaction count) is fully derived at read time from `supports` edges, never stored as history | `analysis/people.ts` |
| Life Vision | Not a separate table — `CognitiveKind:"life_vision"`, `durable:true`, `hasProgress:true`, progress is **manual only**, deliberately never auto-derived from linked `fin_goal.visionNodeId` funding | `shared/celestial.ts`, `docs/specs/life-vision.md` |

## 5. Gap Matrix

| Capability | Exists | Partial | Missing | Reusable mechanism | Required evolution |
|---|:-:|:-:|:-:|---|---|
| Event/reference time | ✅ | | | `occurred_at` | none |
| Memory creation time | ✅ | | | `created_at` | none |
| Validity intervals | | | ✅ | — | new, narrow (Section 7) |
| Supersession (stored) | | ✅ | | `EpistemicStatus.outdated`/`contradicted` — **defined but zero producers today** | a small resolver (Section 12) |
| State reconstruction (entity timeline) | | ✅ | | `linkCognitiveAnchor` (continuity) + `temporalChange.ts` (financial) as two domain-specific instances | one small, generic function (Section 9) |
| Relevance decay | | ✅ | | `entropy`/`DURABLE_COGNITIVE_KINDS`/spaced-repetition `reviewStrength` | reframe as one model, no new mechanism (Section 13) |
| Entity continuity | ✅ | | | `linkCognitiveAnchor` + `aliases` | extend the pattern to non-cognitive-anchor entities (Section 8) |
| Cross-domain reasoning | | ✅ | | `temporalContext.ts`, `causal.ts` | extend `causal.ts`'s domain coverage (already flagged in the parent spec's V1 limitations) |
| Causal reasoning | ✅ | | | `analysis/causal.ts` (I1) | none new; reuse as-is |
| Contradiction detection | ✅ | | | `synthesis/contradictions.ts` | direction-of-currency labeling is missing (Section 12) |
| Clarification | ✅ | | | I2 lifecycle | none new |
| Emotional context | | ✅ | | `analysis/emotional.ts` trajectory | reframe as epistemic input, don't rebuild (Section 10) |
| People continuity | ✅ | | | `mergeDuplicatePeople`, `supports` edges | none new for continuity; relationship-over-time framing only (Section 8) |
| Current-state reasoning | | ✅ | | `temporalContext.ts` pattern | generalize to arbitrary entities (Section 9) |
| External context | | | ✅ | none | boundary design only, no integration (Section 14) |
| Learned interaction style | | | ✅ | none | boundary design only, not implemented (Section 13) |
| ML personalization | | | ✅ | none | explicitly deferred (Section 15) |
| ML pattern detection | | ✅ | | `analysis/emotional.ts`'s pattern rules are deterministic, not ML | deferred; deterministic version already exists |
| Provenance | ✅ | | | `ProvenanceRef` | none new |
| Epistemic confidence | ✅ | | | `IntelligenceClaim.confidence` | none new |
| Longitudinal summaries | | | ✅ | `dreamCycle.ts`'s belief consolidation is the closest analog | not attempted this pass |
| Scalable retrieval | | ✅ | ⚠️ | hybrid KNN+BM25 for memories | **`buildEvolutionLinks` is an existing full-scan on every chat message — a real, pre-existing performance bug, not hypothetical (Section 18)** |
| Galaxy integration | ✅ | | | I3 + Chat Navigation Model C | none new |

## 6. Critical Design Question 1 — Does Maya need a first-class "Temporal State / World State"?

**No — investigated and rejected, not assumed.**

Three independent parts of this codebase already answer this question the same way, for three
unrelated domains:

1. `graph/service.ts`'s `enrich()` — mass/degree/celestial computed fresh on every read, never
   written back to `nodes`.
2. `finance/summary.ts`/`finance/wealth.ts` — current budget and net worth are `SUM(...)` over
   `fin_income`/`fin_expense`/`fin_allocation` on every call, never a stored "current balance of
   record" beyond the literal cash account.
3. `analysis/temporalContext.ts`'s `buildTemporalContext()` — explicitly documented: "computed
   fresh from authoritative data on every call, NEVER persisted."

This is not a coincidence — it is a repeated, deliberate architectural choice, and it is the
correct one for the same reason each time: a persisted "world state" table would immediately
become a second source of truth that domain data could silently drift from, and every domain in
this codebase that could have built one chose read-time derivation instead.

**Decision: no new "World State" table.** The longitudinal layer gets one new *function shape*
(not a table) that generalizes this exact pattern to an arbitrary entity — see Section 9.

## 7. Time Model

| Concept from the brief | Existing support | Verdict |
|---|---|---|
| Memory creation time | `nodes.created_at` | ✅ sufficient |
| Event/reference time | `nodes.occurred_at` | ✅ sufficient |
| Validity interval | Nothing (`fin_paystub.period_start/end` and `timeline_chapters.period_start/end` are domain-specific date ranges, not a general "this fact was true from X to Y") | **Genuinely missing, but do not build a general validity-interval column now.** A claim's validity is *derived* — "this was true until a newer, contradicting fact arrived" — which is exactly what Section 12's supersession resolver computes on demand from two existing timestamps (the old fact's `occurred_at`/`created_at` vs. the new fact's). A stored interval would need constant maintenance as new facts arrive; a derived one never goes stale. |
| Conversation time | `history` array passed into `chat()`, not persisted beyond localStorage (client) | ✅ sufficient for its purpose |
| Current time | `now: Date = new Date()` threaded through every temporal/causal/navigation function already | ✅ sufficient |
| Future/projected time | `remind_at`, `fin_goal.targetDate`, `nodes` for `future_event`/`intention` cognitive kinds | ✅ sufficient |

**Conclusion: no new time-field additions.** The one real gap (validity intervals) is better
solved by computation than by a new column, per the reasoning above.

## 8. Entity Continuity Model

**Already exists, closer to complete than the brief assumes.** `linkCognitiveAnchor()`
(`analysis/cognitive.ts`) is the *general* entity-resolution mechanism this codebase already
runs: name/keyword/alias matching plus a semantic kNN pass, capped and re-run periodically via
`applyCognitiveGravity()`. It is **kind-agnostic** — it already works for `goal`/`identity`/
`mental_model`/etc., not just people. "My car" and "my Altima" resolving to the same entity is
not a new capability; it is *creating a cognitive anchor for the vehicle* (a user could already
do this today via any cognitive-node-creating flow) and letting the existing anchor mechanism do
the matching.

**What's missing is not resolution logic — it's a first-class *place* for non-durable,
non-"life-goal" entities to live.** Today's `CognitiveKind` enum (`goal | idea | skill |
person_entity | identity | mental_model | intention | future_event | motivation | life_vision`)
has no obvious slot for "a physical possession" (a vehicle, a piece of equipment) or "an
external commitment" (an employer, a specific contract). Two options, not decided here (see
Section 24, Open Questions):

- (a) Add a new `CognitiveKind` value (e.g. `"asset_entity"` or `"possession"`) using the exact
  same `COGNITIVE_META`/`linkCognitiveAnchor` machinery a `goal` already uses — smallest change,
  fits the existing pattern exactly.
- (b) Don't add a new kind; let the LLM's entity-recognition (already happening implicitly in
  `chat/graphrag.ts`'s citation retrieval) be "good enough" and only formalize an anchor when a
  user explicitly tracks something (e.g. inside a future Journey).

**People-over-time**: `mergeDuplicatePeople`'s exact-match-only design is a deliberate,
documented choice ("a person's name is sacred") and should **not** be loosened for fuzzy
matching — the brief's own instruction not to infer sensitive personal attributes from
association reinforces this. Relationship *history* (not just current tone) would be a genuinely
new capability, but per Section 5 it is `⚠️ partial, not missing` — the raw event log already
exists (every `supports`-linked memory, dated); only a longitudinal *view* over it (analogous to
`analysis/emotional.ts`'s trajectory) would be new, and it is explicitly **not** proposed for
this pass (Section 22).

## 9. Entity State Reconstruction — the "entity → timeline → state transitions" question

**Answer: yes, as a reusable *function*, not a new persistence layer.** This is the second
critical design question, and the same reasoning as Section 6 applies: two domain-specific
instances of this pattern already exist independently —

- `analysis/temporalChains.ts`'s evolution links (memory continuity over time)
- `analysis/temporalChange.ts`'s period comparators (financial state over time)

Generalizing them means one new function shape:

```ts
// analysis/entityState.ts (NOT built this pass — signature only, for design review)
interface EntityStateEvent {
  at: string;                 // occurredAt ?? createdAt, via lib/time.ts
  source: ProvenanceRef;      // the real row this event comes from — never copied
  statement: string;          // the memory's own text, or a domain fact's own label
  status: EpistemicStatus;    // fact | observation | outdated | contradicted | ...
}

function reconstructEntityTimeline(
  handle: DbHandle, spaceId: string, anchor: ProvenanceRef, now: Date = new Date(),
): EntityStateEvent[]
```

Built entirely from EXISTING reads: `linkCognitiveAnchor`'s already-linked memories (via
`supports` edges) ordered by `occurred_at`/`created_at`, folded with any `CausalLink`/
`ClarificationRecord`/contradiction `insight` whose evidence references the same anchor or its
linked memories. No new table. No new relationship type required to build this specific
function (see Section 12 for the one relationship-adjacent gap that *is* real).

This generalizes to vehicle/job/business/goal/relationship/asset/etc. **without per-entity-type
logic** because it only ever asks two already-general questions: "what's linked to this anchor"
(the existing `supports` mechanism) and "in what order did it happen" (existing `lib/time.ts`).

**Status: fixed (Phase C, shipped).** `analysis/entityTimeline.ts`'s `reconstructEntityTimeline(handle,
spaceId, anchor, now?)` is the function sketched above, built close to the original signature with
one deliberate scope narrowing: `anchor` must be `{ domain: "memory", kind: "node" }` — every
evidence mechanism this reuses (`"supports"`/`"resolves"` edges, contradiction insights, evolution
links) is keyed on `nodes` ids, so a money/journey anchor would need before/after relationship data
those domains don't have yet; a non-memory or nonexistent/out-of-space anchor returns `[]` rather
than being force-fit. The working node set is built in ONE bounded pass per mechanism (never
recursive/transitive): the anchor itself, its `"supports"` supporters (already capped at 12 by
`linkCognitiveAnchor`'s own write-time guard), contradiction insights and evolution links touching
that set (each newly capped at 5), then `"resolves"` edges (clarification-confirmed replacements)
targeting anyone found so far — a hard `MAX_TIMELINE_NODES = 25` ceiling on the final hydrated set
regardless of how many of the above exist. Status per event: `"fact"` by default (a memory's own
text), `"confirmed"` when the node is the source of a `"resolves"` edge (i.e. it IS a real
clarification-confirmed replacement, never guessed), and `"outdated"`/`"contradicted"` from Phase
B's `resolveSupersession` — reused verbatim, no second supersession algorithm — applied to
whichever side a resolved pair names `superseded`. `"observation"`/`"inference"`/`"hypothesis"`/
`"possible"`/`"unknown"` are deliberately never produced by this function: those describe
CROSS-NODE claims (`IntelligenceClaim`, built by `analysis/intelligence.ts` from a PAIR of
memories), not a single memory's own statement — a per-node `EntityStateEvent` has no natural
claim-level counterpart for them, so this function doesn't fabricate one. `CausalLink` integration
was considered and deliberately declined: a `CausalLink`'s `cause` is a claim's evidence ref, not a
distinct timeline node with its own real row, so folding it into the ordered array would mean
inventing a synthetic `source` — exactly the "no invented IDs" rule this function otherwise
enforces. Any genuinely relevant causal signal remains reachable the same way `intelligenceSnapshotText`
already reaches it (`openContradictionClaims` + `possibleDownstreamEffects`), so nothing new was
needed to preserve it. **Not wired into chat** in this phase — no existing per-message signal
identifies "which entity is this message about" beyond GraphRAG's own retrieval (which already
surfaces raw node content directly), and calling this once per candidate anchor without a clear
trigger would expand chat context without a demonstrated need; it ships as a standalone, tested,
reusable capability for a future phase (e.g. Phase D's relevance combiner, or an explicit
"tell me about X" tool) to call. Verified via `analysis/entityTimeline.test.ts` (26 tests) covering
the Section 25 car walkthrough end-to-end (using the REAL write paths — an `insights` row and a
`"resolves"` edge, not a synthetic fixture), temporal ordering, epistemic status, historical-record
immutability, provenance, clarification integration, space isolation (including a defensively
mis-scoped edge), and bounds (an `NodesRepo.prototype.all` instrumentation spy, plus explicit caps
tested by bypassing the write-time guards that normally make them moot).

## 10. Cross-Domain Reasoning Model

Already real, already working, for two chains named in the brief:

- **Financial setback → goal funding → Life Vision timing**: `temporalChange.ts`'s
  `goalAllocationChange` + `netWorthChange` are already surfaced in `temporalContext.ts`
  alongside Life Vision target-date classification and `visionRequirementCents` funding math —
  the chain already flows through one function today.
- **Contradiction → downstream financial effect**: I1's `analysis/causal.ts` already implements
  exactly this shape (a contradiction claim → `incomeChange`/`netWorthChange`/
  `goalAllocationChange` checked for temporal consistency).

**What's genuinely missing**: `causal.ts`'s domain coverage is Money/Wealth only (documented in
`maya-intelligence-architecture.md`'s own V1 limitations). Extending it to Journey progress,
People, and Life Vision changes as possible downstream effects is real future work, but it is
**the same function, more domains** — not a new cross-domain reasoning engine. No new
architecture is proposed here; this is a scoping note for Section 16 (roadmap).

## 11. Emotional / Contextual Model

`analysis/emotional.ts` already implements almost exactly what the brief asks for, just not yet
wired to the epistemic layer:

- A single emotional statement (`emotionalWeight`) is already treated as **one data point**, not
  a permanent trait — nothing in the codebase currently promotes a single emotional memory into
  a stored "user fact."
- **Recurrence already has a name**: `buildEmotionalTrajectory`'s `EmotionalPattern` detection
  ("Stress cycle" ≥2 dip-days, "Burnout risk" bright→heavy, "Volatile stretch") is precisely the
  distinction the brief asks for between "temporary frustration" (one heavy memory, no pattern)
  and "something durable enough to matter" (a detected, named pattern across many memories).

**What's missing**: this trajectory is currently a UI-facing computation (feeding whatever panel
renders it), not fed into `chat/graphrag.ts`'s intelligence snapshot. The correct, smallest
integration is a ninth snapshot function (`emotionalSnapshotText`, same
`(handle, spaceId?, now?) => string | null` contract as the other eight) that narrates a
DETECTED PATTERN (never a single memory's raw valence) as an `"observation"` — never upgraded to
a stored user fact, exactly mirroring how `openContradictionClaims` already narrates a detected
conflict without asserting it as settled. "I can't do this anymore" becomes citable evidence
inside a pattern, never itself a confirmed fact — the epistemic vocabulary already has the
right vocabulary (`observation`) for this; nothing new needs inventing.

## 12. Contradiction / Uncertainty Model — the one real epistemic gap found this pass

**A concrete, previously-undiscovered finding**: `EpistemicStatus` was extended this session
(I1–I3) to include `"outdated"` and `"contradicted"` — but a full read of `analysis/
intelligence.ts` confirms `openContradictionClaims()` **always** returns `status: "observation"`.
**Nothing in the codebase produces `"outdated"` or `"contradicted"` today.** The vocabulary
exists; nothing writes it.

This is the smallest genuinely-new piece this document identifies as required:

**A deterministic direction-of-currency resolver.** Given two contradicting memories (already
detected — `synthesis/contradictions.ts` does the hard part), determine which side is
*currently* believed true using ONLY already-stored timestamps:

```ts
// Not built. Conceptually: given an existing contradiction insight's two node ids,
function resolveContradictionDirection(a: GraphNode, b: GraphNode): { current: GraphNode; superseded: GraphNode } | null
```

- If one memory's `occurred_at` (or `created_at` when `occurred_at` is absent) is clearly later,
  label the earlier one `"outdated"` and the later one stays whatever it already was (typically
  still `"observation"` until further evidence, or `"fact"` if it's a plain, undisputed
  statement).
- If the two are too close in time to call, or dates are missing/equal, return `null` — deferring
  to I2's clarification mechanism (already built) rather than guessing.
- **The older memory's content is never touched.** Only the *claim* built from it (a
  transient, computed `IntelligenceClaim`, never persisted) gets the `"outdated"` label.

This directly answers the "I have one car" / "my other car" example: the contradiction is
already detected today; what's missing is a five-line, purely-arithmetic function that decides
which side wins by date, producing exactly `"outdated"` vs. current — no LLM call, no new
persistence, reusing 100% of the existing pipeline up to this point.

**The car-accident example, walked through end to end** (Section 25 has the full worked
narrative) hinges on this same resolver plus I1's causal check plus I2's clarification gate —
all three already exist; only the direction-of-currency step is new.

**Status: fixed (Phase B, shipped).** `analysis/supersession.ts`'s `resolveSupersession(a, b,
kind)` is the resolver sketched above, built almost exactly as designed — pure arithmetic over
`lib/time.ts`'s `parseTolerantMs(occurredAt ?? createdAt)` (event time preferred over creation
time, per Section 7), a `MIN_CONFIDENT_GAP_MS = 60_000` floor below which it returns `null` rather
than guessing, and it never mutates either memory. One refinement beyond the original sketch: the
resolver takes an explicit `kind: "contradiction" | "continuity"` argument rather than inferring
intent from the pair alone — a same-theme **continuity** pair (`temporalChains.ts`'s evolution
links — "I drive a Ford" → "I drive a Chevy") always resolves to `"outdated"`, never
`"contradicted"`, because nothing in that detector ever asserted the two statements were
incompatible, only that one is older. A genuine **contradiction** pair (already LLM-verified by
`synthesis/contradictions.ts`, reframed by `openContradictionClaims()`) resolves to
`"contradicted"` once direction is known — a stronger claim than mere staleness, because an
upstream detector already judged the two mutually exclusive. This satisfies the task's own
distinguishing example (a legitimate transition must not become `"contradicted"`) by tying each
status to a *different* upstream detector rather than inventing new conflict-classification logic.

Wired via the new `analysis/intelligence.ts` export `supersessionClaims(handle, spaceId,
contextNodeIds?)`, which is ADDITIVE to (never replacing) `openContradictionClaims`'s/
`thoughtContinuityClaims`'s existing `"observation"` framing — for each already-detected
relationship whose two evidence memories resolve confidently, it also emits one stronger,
transient claim naming the superseded side, capped at `MAX_SUPERSESSION_CLAIMS = 2`.
`intelligenceSnapshotText()` surfaces this as a new line ("No longer current...") only when a
direction was actually resolved; when `resolveSupersession` returns `null` (insufficient
evidence), the pair is silently skipped and the existing `"observation"` claim is left exactly as
it was — never promoted, never guessed. Verified via `analysis/supersession.test.ts` (10 pure
unit tests) and 7 new integration tests in `analysis/intelligence.test.ts` covering both
directions, space isolation, provenance preservation, and historical-record immutability.

## 13. Current vs. Historical Truth / Relevance Model

These two are really one model, and the codebase already has the raw material for it:

- **Durability** (`COGNITIVE_META.durable`) already distinguishes "ages out" (idea, intention,
  future_event) from "doesn't age out just from disuse" (goal, identity, life_vision, ...).
- **Reinforcement** (spaced-repetition `reviewStrength`, working-memory's reinforcement bump)
  already distinguishes "mentioned once" from "mentioned repeatedly."
- **Recency** (`entropy`, "cooling") already distinguishes "just tended" from "gone cold."

**The brief's "3-year-old preference vs. 3-year-old Life Vision" distinction is already
represented — durability and recency are already two separate axes, not one "older = less
relevant" scalar.** No new field is needed; what's missing is a single deterministic function
that COMBINES the three existing signals into one relevance judgment for the purposes of
"should this appear in current reasoning" — narrower in scope than a full ranking/ML system:

```
relevant_now = durable OR reinforced_repeatedly OR NOT superseded (Section 12) OR
               causally_linked_to_something_current (I1's CausalLink.evidence)
```

This is a pure boolean/scoring function over already-computed inputs, not a new subsystem, and
explicitly NOT a machine-learned relevance model (Section 15 explains why not, yet).

**Historical truth**: already correctly modeled by discipline, not by a field — I2's
`resolveClarificationFromMessage()` already proves the pattern end-to-end (the evidence memory
is never rewritten; the confirmed statement is a newer, separate node). Section 12's
`"outdated"` label generalizes this same discipline to ordinary (non-clarification) contradiction
resolution.

## 14. Learned Interaction Model (design only — explicitly not implemented)

Three distinct concepts, kept structurally separate per the brief's own instruction:

1. **User facts** — what Maya believes about the user's *world*. Lives entirely in existing
   domains (memories, cognitive nodes, Money/Wealth/Journeys/People). Nothing here changes.
2. **Interaction preferences** — how Maya has learned to *communicate*. Proposed as a NEW,
   small, space-scoped table (not built this pass) — e.g. `interaction_preferences(space_id,
   signal, value, confidence, updated_at)` for things like preferred verbosity/directness — kept
   completely separate from `nodes` so a communication-style signal can never be mistaken for a
   fact about the user's life, and separate from the AI Companion's existing `instruction_
   profiles` (user-authored, explicit) since these would be *observed*, not authored.
3. **Maya's stable identity/behavioral boundaries** — `identity.ts`'s `soulTextFor()` (Layer 1,
   already the highest-precedence, non-negotiable system-prompt layer) is the correct home for
   the boundaries the brief asks never be overridden by a mood. **No change needed here** — the
   existing layering (`composeSystem`: Layer 1 identity → About-Me → Layer 2 instructions)
   already puts identity above anything derived from conversation.

**The safety property the brief asks for** ("the user should never be able to accidentally
cause a permanent personality change") is already structurally satisfied by this layering, as
long as (2) is implemented as *additive* prompt guidance layered below Layer 1, never as a
rewrite of the soul text itself. This is a real, if small, future capability — not attempted
this pass.

## 15. External / Environmental Context Boundary (design only)

No integration exists or is proposed. The boundary, if built later: any web/tool result
(`webLookup?()` already exists on `LlmProvider` as an optional capability, currently unused by
`chat()`) must be surfaced to the LLM as a clearly domain-tagged block — e.g. `EXTERNAL CONTEXT
(from the web, not your memory — may be wrong or outdated; never state it as something the user
told you)` — mirroring exactly how `KNOWLEDGE DOCUMENTS` is already a separately-labeled block
in `buildAnswerPrompt` today, distinct from `MEMORIES`. **This document does not propose
building the integration** — only that IF it is built, it must never be merged into the
`MEMORIES` block or `ProvenanceRef.domain` (which has no `"external"` value today and would need
one).

## 16. ML vs. LLM vs. Deterministic Responsibility Matrix

| Technique | Already used for | Should also be used for (this pass's findings) | Should NOT be used for |
|---|---|---|---|
| Deterministic | dates, financial math, state transitions, `EpistemicStatus` gating, entropy/durability | Section 12's direction-of-currency resolver; Section 13's relevance combination | anything requiring language understanding |
| Retrieval/embeddings | memory KNN, contradiction/continuity candidate-finding, cognitive-anchor semantic pass | entity resolution for a new `CognitiveKind` (Section 8) — same kNN pass already used | replacing exact structural checks (space isolation, existence) |
| Graph reasoning | multi-hop expansion, `supports` edges | Section 9's entity-timeline walk | — |
| LLM | `detectContradiction`, `interpretClarificationAnswer`, navigation candidate proposal, chat synthesis | Section 12's *detection* step (already done, unchanged); a future emotional-pattern *narration* step (Section 11) — narration only, never fact promotion | inventing a causal link, inventing an entity id, inventing a navigation reason (all already forbidden and enforced) |
| ML models | **nothing today** — `analysis/emotional.ts`'s "pattern detection" is deterministic threshold rules, not a trained model | genuinely not needed yet — every gap this pass found is closeable with deterministic logic or existing retrieval | do not add merely because the brief mentions it; no concrete task in this pass fails without one |

**This pass's finding, stated plainly: zero new ML models are justified by anything in the gap
matrix.** Every capability gap traces to either (a) a deterministic function that doesn't exist
yet (Section 12, 13) or (b) an existing mechanism not yet wired into chat (Section 11). This is
consistent with the brief's own instruction not to add ML "simply because it is available."

## 17. Epistemic Model (evolution, not replacement)

The existing 9-value `EpistemicStatus` + `ProvenanceRef` + `IntelligenceClaim` (confidence kept
separate) already distinguishes every case the brief asks for:

- *"The user explicitly said this"* → `fact`
- *"Strongly supported by several memories"* → `observation` with high `confidence`
- *"A reasonable inference"* → `inference`
- *"A possibility"* → `possible` / `hypothesis`
- *"These facts conflict"* → `observation` today, **should become `contradicted`/`outdated` once
  Section 12's resolver exists**
- *"I need to ask"* → the existing `ClarificationCandidate`/`ClarificationRecord` lifecycle

**No new epistemic concept is proposed.** The one change this document recommends is *closing
the gap between the vocabulary and its producers* (Section 12) — using what's already defined,
not defining more.

## 18. Retrieval / Scaling Architecture

**An existing, real performance debt, found during this pass's own inspection (not
hypothetical):** `analysis/intelligence.ts`'s `thoughtContinuityClaims()` calls
`analysis/temporalChains.ts`'s `buildEvolutionLinks()`, which does `NodesRepo.all()` (every
memory in the space) plus one KNN lookup per node — **and this runs on every single chat
message** via `intelligenceSnapshotText()`. Contrast with `synthesis/contradictions.ts`'s
structurally identical full-scan (`findContradictionCandidates`), which is correctly confined to
the on-demand digest route and never touches the chat hot path.

**This must be fixed before adding more longitudinal reasoning on top of chat**, or every new
capability in this document inherits an O(N) cost per message.

**Status: fixed (Phase A, shipped).** The originally-sketched fix above (a periodic cache,
mirroring `fin_asset_snapshot`'s snapshot-instead-of-recompute pattern) was NOT what got built —
on reflection, a cache introduces staleness and a new invalidation surface for a problem that
doesn't need either. Instead: `analysis/temporalChains.ts` gained a new `buildEvolutionLinksAmong(h,
spaceId, relevantIds, opts)` that bounds the OUTER loop to an explicit `relevantIds` list — no new
persistence, no cache invalidation, always exactly as fresh as a live query. `chat/graphrag.ts`
already computes a small, bounded GraphRAG context id set (`ids`, typically a few dozen ids
regardless of total memory count — the hybrid KNN+keyword seeds plus one hop of expansion) for
every message; this same set is now threaded through `intelligenceSnapshotText(handle, spaceId,
now, contextNodeIds)` → `thoughtContinuityClaims(handle, spaceId, contextNodeIds)` →
`buildEvolutionLinksAmong`, so the chat hot path's per-message cost is `O(|relevantIds|)` instead
of `O(every memory in the space)`, with **zero** growth as unrelated memory count grows.

One deliberate correctness choice: only the OUTER loop is bounded. The INNER `knn()` lookup per
outer node is still free to find a counterpart anywhere in the space (via a single bounded
`getById()` fallback for any hit outside `relevantIds`) — narrowing that too would silently drop
real evolution links to memories outside the immediate chat context, which is a correctness
regression the performance fix must not introduce. `buildEvolutionLinks()` itself (the original,
full-space function) is UNCHANGED and still the one used by `GET /api/digest/evolution` — full
scans remain correct and intentional in that on-demand, user-opened route; they are simply no
longer paid for on every chat turn. Both entry points share one `evolutionLinksFor()` core so the
bounded path can never silently diverge in behavior from the full-space one. Verified via 7 new
tests in `__tests__/temporalChains.test.ts`, including a non-timing instrumentation test that
spies on `NodesRepo.prototype.all` and asserts it is never called from the bounded path.

**Bounded-by-construction patterns already established, to extend rather than replace**:
`MAX_FACTS_PER_BUCKET = 5` (`temporalContext.ts`), `MAX_CAUSAL_LINKS = 3` (`causal.ts`),
`MAX_CANDIDATES_PER_KIND = 3` / `MAX_TOTAL_CANDIDATES = 6` (`galaxyEntity.ts`'s navigation
candidates). Every new function in this document (Section 9's entity timeline, Section 12's
resolver, Section 13's relevance combiner) must adopt an equivalent small, explicit cap.

## 19. Privacy / Security

Unchanged, and non-negotiable: every function above takes `spaceId` explicitly, sourced from
`spaceOf(res)`/the caller's own context, **never** from an LLM. Any new table (the proposed
`interaction_preferences` in Section 14, if ever built) must be added to `TABLES_WITH_SPACE`
(`auth/spaces.ts`) on day one. The LLM boundary established this session (propose, never
authoritative) extends to every new LLM touchpoint in this document without exception —
Section 12's resolver is deliberately 100% deterministic specifically so a future "which fact is
current" decision is never delegated to a model.

## 20. Future Intelligence Pipeline (target, not a build order)

```
User message
  → intent/topic understanding (existing: hybrid retrieval)
  → entity identification (existing: linkCognitiveAnchor pattern, extended per Section 8)
  → temporal interpretation (existing: lib/time.ts, temporal.ts)
  → relevant history retrieval (existing: KNN/keyword/multi-hop)
  → state reconstruction (NEW, Section 9: reconstructEntityTimeline)
  → change detection (existing: temporalChange.ts, extended per Section 10)
  → contradiction/uncertainty analysis (existing + NEW: Section 12's direction resolver)
  → cross-domain reasoning (existing: causal.ts, extended per Section 10)
  → causal reasoning (existing: causal.ts, I1)
  → current-state reasoning (derived per Section 6, never a stored table)
  → external context when necessary (boundary only, Section 15 — not built)
  → epistemic evaluation (existing vocabulary, Section 17)
  → response planning + natural-language response (existing: chat/graphrag.ts)
  → optional Galaxy navigation (existing: Chat → Galaxy Navigation, Model C)
  → post-conversation learning/update (boundary only, Section 14 — not built)
```

Every existing box is a real, shipped mechanism. Every NEW box is small (Sections 9, 12, 13) and
reuses everything to its left.

## 21. Implementation Roadmap (proposed phase ordering — derived from THIS repo, not assumed)

Ordering rationale: fix the existing performance debt before adding reasoning that depends on
it; close the epistemic-vocabulary gap before building anything that depends on directionality;
defer anything requiring a new persisted concept until the derived approach is proven
insufficient.

- **Phase A — Performance foundation (do this first, it's already broken). Done.** Fixed Section
  18's `buildEvolutionLinks()` per-chat-message full scan via a new bounded entry point,
  `buildEvolutionLinksAmong`, fed by the chat hot path's already-computed GraphRAG context ids —
  see Section 18's Status note for the as-built design. Verified via 7 new tests (including a
  non-timing instrumentation check), full regression gate green.
- **Phase B — Direction-of-currency resolver (Section 12). Done.** Closed the
  "outdated"/"contradicted" producer gap via `analysis/supersession.ts`'s `resolveSupersession` +
  `analysis/intelligence.ts`'s `supersessionClaims` — see Section 12's Status note for the as-built
  design. Verified via 10 pure unit tests plus 7 integration tests, full regression gate green.
- **Phase C — Entity timeline reconstruction (Section 9). Done.** Shipped
  `analysis/entityTimeline.ts`'s `reconstructEntityTimeline`, reusing Phase B's
  `resolveSupersession` for the "which side is current" question exactly as this roadmap
  anticipated — see Section 9's Status note for the as-built design and scope narrowing.
  Verified via the scripted car-accident fixture this roadmap called for (built from the real
  `insights`/`"resolves"`-edge write paths, not a synthetic mock) plus 25 further tests, full
  regression gate green. Not wired into chat this phase (see Section 9) — ships as a standalone,
  reusable function for Phase D or a future explicit caller.
- **Phase D — Relevance combiner (Section 13).** Depends on Phase C (needs the timeline to know
  what's superseded). Independently useful for chat context bounding even before any UI change.
- **Phase E — Emotional snapshot wiring (Section 11).** Independent of B/C/D — can ship any time
  after Phase A, since it only wires an existing computation into the existing 9th-snapshot
  pattern.
- **Phase F — Entity continuity extension (Section 8).** Depends on a product decision (Section
  24, Open Question 1) about whether to add a new `CognitiveKind`.
- **Phase G — Cross-domain causal extension (Section 10).** Extends `causal.ts`'s domain
  coverage — independent of everything else, can slot in any time after Phase A.
- **Phase H — Learned interaction model (Section 14) and external context (Section 15).**
  Deliberately last: both require new persistence/integration decisions this document
  intentionally leaves open, and neither is needed to prove the rest of the architecture.

No ML phase is proposed. Per Section 16, nothing in the gap matrix requires one yet.

## 22. Test Strategy (design-level — to be written per-phase, not now)

| Scenario | Mechanism under test | Phase |
|---|---|---|
| Temporal: old fact → later change → current-state inference | Section 9's `reconstructEntityTimeline` | C |
| Supersession: historical fact stays historically true, not treated as current | Section 12's resolver + I2's existing "never rewrite" discipline | B |
| Ambiguity → clarification | Already covered by I2's existing 5 tests (`clarificationResolution.test.ts`) | none new |
| Cross-domain: change in one domain affects another | Already covered by I1's existing causal tests; extend per new domains only | G |
| Relevance: old irrelevant info doesn't dominate | Section 13's combiner | D |
| Durable knowledge: old Life Vision stays relevant | Section 13's combiner (durability branch) | D |
| Contradiction stays unresolved until clarification | Already covered by existing contradiction + I2 tests | none new |
| Emotional context: temporary emotion ≠ permanent identity | Section 11's pattern-gated narration | E |
| Entity continuity: aliases resolve correctly | Already covered by `linkCognitiveAnchor`'s existing tests; extend only if Section 8's new kind ships | F |
| Epistemic safety: inference never silently becomes fact | Already covered by I1–I3's existing "never promoted upward" tests | none new |
| Privacy: no cross-space leakage | Every new function takes `spaceId` explicitly — same isolation test pattern as every I1–I3 function | every phase |
| Performance: context stays bounded as memory grows | A synthetic large-space benchmark on `intelligenceSnapshotText()` before/after Phase A | A |

## 23. Explicit Non-Goals (this pass, and near-term)

- No persisted "World State"/"Temporal State" table (Section 6).
- No new validity-interval schema column (Section 7).
- No fuzzy/ML-based person matching (Section 8) — exact-match stays deliberate.
- No ML models of any kind (Section 16) — nothing in the gap matrix requires one.
- No autonomous navigation, multi-target navigation, external web intelligence, or massive
  schema migrations (all explicitly out of scope per the brief).
- No adaptive-personality implementation (Section 14 is a boundary design only).
- No `supersedes`/`is_same_as`/`evolves_into` relationship type added yet — Section 12's
  resolver produces a transient, computed label, not a new persisted edge; if a persisted
  supersession edge later proves necessary, it should be added the same deliberate way `I2`
  added `"resolves"` reuse rather than invention — but this document does not conclude it's
  needed today.

## 24. Open Architectural Questions

1. **Section 8**: does a new `CognitiveKind` (e.g. `"asset_entity"`) get added for
   vehicles/equipment/possessions, or does the existing `linkCognitiveAnchor` mechanism apply
   without a new kind? This is a product-scope decision, not an architecture one — the
   mechanism works either way.
2. Should Section 12's direction-of-currency resolver run automatically inside
   `intelligenceSnapshotText()` (every chat message, cheap since it's pure arithmetic over
   already-fetched contradiction claims) or only on-demand (e.g. from the digest route, where
   the full contradiction scan already lives)? This document leans toward "inline, since it's
   O(1) per already-detected contradiction claim (capped at 3)," but flags it for review since
   it's the one new function proposed to run on the hot path.
3. If Phase D's relevance combiner later needs a numeric score rather than a boolean, should
   that score be a NEW field on `IntelligenceClaim`, or computed and discarded per-request? This
   document has no evidence yet that a numeric score (vs. the boolean combination described) is
   needed — flagged rather than decided.
4. Does `analysis/emotional.ts`'s trajectory belong in the 9th chat snapshot unconditionally, or
   only when a genuine `EmotionalPattern` is detected (never a raw single-memory valence)? This
   document recommends the latter (Section 11) but the exact wording/framing needs product
   review before implementation.

## 25. Example Walkthroughs

### The car scenario (mandatory test case)

1. *"I have one car, a 2016 Civic."* → ingested as an ordinary memory, `occurred_at` = today.
2. *"Using it for delivery work now."* → a second memory, likely `linkCognitiveAnchor`-linked to
   a `goal`/`intention` node about delivery income if one exists, or just a plain memory.
3. *"Got in an accident with the car."* → a third memory. `synthesis/contradictions.ts`'s
   *existing* same-topic scan (or, faster, I1's causal window) surfaces this alongside memory #1
   as same-topic.
4. **Today**: `openContradictionClaims()` returns an `"observation"` — a genuine conflict is
   flagged, but Maya cannot yet say which side is current.
5. **With Phase B (Section 12)**: the resolver compares `occurred_at` across the two memories —
   the accident is later — and labels memory #1's "I have one car, available" implication
   `"outdated"`, **without touching memory #1's actual text**.
6. **I1's existing causal check** (`possibleDownstreamEffects`) already looks for a temporally
   consistent income/net-worth change following the accident — if the user's delivery income
   dropped afterward, this surfaces as a `"possible"` (never asserted) causal link.
7. *"I want to do delivery work again."* Maya now has: an `"outdated"` vehicle-availability
   claim, a `"possible"` causal link to reduced income, and — per I2's existing, unmodified
   clarification gate — if this uncertainty clears the priority bar, she asks: *"Is this about
   the same car that was in the accident — do you have a working vehicle now?"* This is I2's
   existing mechanism, unchanged; Phase B only makes the *underlying claim* correctly labeled
   going into that decision.
8. User answers *"Yes, I got a new one."* → I2's existing `resolveClarificationFromMessage()`
   creates a new, `origin:"user"` memory, linked via the existing `"resolves"` edge — **memory
   #3 (the accident) is never rewritten**; the new memory is simply the newest, most-current
   statement.
9. Nothing above required a new table, a new relationship type, or an LLM call beyond the ones
   I1–I3 already make. The only new code is Phase B's arithmetic resolver.

### The trucking/education chain (cross-domain, Section 10)

*"New trucking job"* (a memory, possibly linked to an `intention`/`goal` anchor) → I1's
`possibleDownstreamEffects` already checks `incomeChange` in the following weeks → if income
rose, the claim is `"possible"`, never asserted → a linked Financial Goal's
`goalAllocationChange` (already computed, already surfaced in `temporalContext.ts`) shows
whether savings actually accelerated → a linked Life Vision's `visionRequirementCents` funding
narrative (already computed) reflects whether the timeline moved. Every link in this chain
already exists independently; Section 10 does not propose new mechanism, only broader coverage
in a future phase (G).

---

## Final honesty check

Per the brief's own instruction: **do not claim implementation of capabilities that were not
actually built.** Nothing in Sections 6–21 has been implemented. The only code change delivered
alongside this document is the separately-committed pay stub save-failure fix, which is
unrelated to longitudinal intelligence and is not claimed as part of this architecture.
