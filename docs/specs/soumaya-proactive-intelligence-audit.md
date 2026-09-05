# Phase W — Proactive Intelligence & Conversation Trigger Architecture Audit

> Continuation of Phases S–V (`docs/specs/soumaya-shared-communication.md` through
> `soumaya-weekly-review-communication-integration.md`) and the intelligence architecture frozen
> in `docs/specs/maya-intelligence-freeze.md` (Phase K). Baseline commit: `8e94af3`.
> Status: **audit complete. No proactive-trigger code implemented this phase — per the mission's
> own explicit gate ("do not proceed to broad implementation until this audit is complete") and
> its acceptance criteria ("the smallest viable proactive pilot is IDENTIFIED"), this phase's
> deliverable is the audit + design below.** The paystub validation fix (Part B) is separate,
> implemented, and gated green — see the final report.

## A. Existing Intelligence Map

Everything below already exists, is already tested, and is already locked per
`maya-intelligence-freeze.md` unless marked otherwise. This phase adds no new intelligence.

| Domain | What exists | Module | Snapshot only, or real trend/delta? |
|---|---|---|---|
| Money — income | Month-over-month delta (direction/$ delta/%) | `analysis/temporalChange.ts` (`incomeChange`) | **Real delta**, single-step (this month vs. last), no acceleration/reversal detection |
| Money — net worth | Month-over-month delta | `temporalChange.ts` (`netWorthChange`) | **Real delta**, same single-step limitation |
| Wealth — deployable cash | `deployableCents`, `reconciliation: "ok"\|"over_committed"` | `finance/wealth.ts` (`getWealthSummary`) | **Snapshot only** — no persisted prior value, no trend |
| Wealth — per-goal funding velocity | Trailing-30-day allocation vs. prior 30 days, direction/$/%, explicit `"insufficient_history"` state | `temporalChange.ts` (`goalAllocationChange`) | **Real delta**, already epistemically honest (never fabricates a trend from thin data) |
| Life Vision — funding narrative | "funded $X of $Y" | `analysis/temporalContext.ts` + `shared/lifeVision.ts` (`visionRequirementCents`) | **Snapshot only** — no delta on the *requirement* side; confirmed gap, no code anywhere combines "savings trend down" + "requirement trend up" |
| Journeys — activity staleness | `updatedAt` vs. `JOURNEY_INACTIVE_DAYS` | `temporalContext.ts` + `analysis/dormant.ts` | Single-signal freshness only — **no comparison exists** between a Journey's *stated* `progress` value and its *actual* recent linked-activity, because `progress` is a plain manually-set field (`journeys.repo.ts`) with nothing deriving it from behavior |
| Mind / emotional | Recurring pattern detection (Stress cycle/Burnout risk/Downswing/Upswing), full-space or bounded | `analysis/emotional.ts` | Real trajectory analysis, but explicitly **never a diagnosis** — a locked non-feature (see F) |
| Cross-domain causal | `possibleDownstreamEffects(claim)`: relates a claim's evidence date to income/net-worth/goal-allocation/emotional changes in the same ~65-day window | `analysis/causal.ts` | Real, bounded (`MAX_CAUSAL_LINKS`), always `status:"possible"`, confidence `0.35–0.55`. **Only originates FROM Mind claims** (contradictions etc.) — never originates from Money/Wealth, never targets Journey/Life-Vision as an effect domain |
| Relevance | 3-tier (`high/moderate/low`) classification combining durability, reinforcement, supersession, causal connection, topic similarity, cooling | `analysis/relevance.ts` (`computeRelevance`) | Fully built, fully tested, **zero production callers** (confirmed by Phase K's own audit and re-confirmed this phase) |
| Contradictions | Detected via KNN candidate pairs, deduped by pair (`insightsRepo.existsPair`) | `synthesis/contradictions.ts` | `createdAt` exists on the row but **nothing computes age/staleness from it** — no "unresolved for N days" signal anywhere |
| Entity continuity | On-demand historical reconstruction, epistemic status per event | `analysis/entityTimeline.ts` | Read-time only, memory-anchors only (no Money/Journey anchors), no "supported vs. stalled" state |
| Communication boundary | Soul, behavior guidance, evidence-gated preferences, opt-in emotional trajectory | `communication/context.ts` | **Proven across 8 consumers** (bill_risk, check_in, daily_digest, reminder, orphan, review_nudge, finance_freshness, weekly_review) with zero modification — see Phases S–V |
| Delivery / dedup primitive | `agent_logs(action, description, targets, created_at, space_id)` | `db/schema.ts` | `targets` is **still hardcoded to the literal `'[]'`** by `router.ts`'s `logAction()` — carries no real per-node data anywhere in the codebase. `action`+`created_at` ARE real and already power `recentActionCount()` across 8 consumers |
| "Already discussed with the user" | — | — | **Confirmed gap.** Chat's per-turn `contextIds`/GraphRAG retrieval set is computed fresh every turn and threaded through function calls in memory only — **never persisted anywhere queryable.** No mechanism exists to ask "did Soumaya already tell the user about X." |

## B. Proactive Signal Matrix

Classified A (conversation-worthy) / B (notification-worthy) / C (dashboard-only) / D (internal
only, never contacts the user) / E (not meaningful enough to surface at all).

| Signal | Class | Why | Existing delivery today |
|---|---|---|---|
| Bill risk (thin cushion vs. an upcoming non-autopay bill) | **A** | Already proven: real financial magnitude, already communication-adapted (Phase S) | `bill_risk` tool → agent_logs → toast |
| Weekly reflection (mood/highlight over the week) | **A** | Already an LLM-synthesized narrative with full CommunicationContext (Phase V) — the closest existing thing to "Soumaya wants to talk" today | `weekly_review` tool → agent_logs/Telegram |
| Heavy emotional stretch / unresolved contradiction | **A** (contradiction) / **B–D** (heaviness, see below) | Contradiction: already question-worthy, already surfaced via `daily_contact`'s ladder | `check_in` tool + `daily_contact` |
| **Per-goal funding-velocity reversal** (`goalAllocationChange`, 2+ consecutive periods, real direction+magnitude, `insufficient_history` never fabricated) | **A — recommended pilot signal** | The single existing signal with real magnitude, real confidence discipline, AND zero fabrication risk, that is currently computed and then **completely discarded outside chat** | None — chat-pull only, via `temporalContext.ts`; never proactively pushed |
| Income/net-worth single-step MoM delta | B | Real, but single-step only (no reversal/streak logic) — one bad month alone shouldn't interrupt | Chat-pull only |
| Wealth over-committed (`reconciliation`) | **C** | Real-time-computed but no persisted "how long has this been true" or magnitude-tiering; already correctly inline-only in `WealthPanel.tsx` per Phase T's audit | `WealthPanel.tsx` inline warning only, never pushed |
| Journey activity staleness | **D** | Single freshness signal, not a progress-vs-behavior mismatch (that mismatch doesn't exist as intelligence — see A); currently orphaned even from its own domain UI | `temporalContext.ts` chat snapshot only |
| Finance data freshness (income/asset entry staleness) | B | Explicitly self-documented as "a light housekeeping nudge, NOT a real money risk" (Phase S) | `finance_freshness` tool |
| Reminder / orphan / review-nudge | B–C | Useful, but user-initiated-content-driven, not "Soumaya noticed a pattern in your life" | Tool-router → toast |
| Causal links (`possibleDownstreamEffects`) | **D** | Only ever computed *inside* a chat turn about a specific claim already being discussed — never proactively scanned | Chat-only, per-turn |
| Emotional pattern **as a standalone trigger** (not as a tone modifier) | **D, by design** | `maya-intelligence-freeze.md` §5 locks "no autonomous emotional diagnosis" as a non-feature. An emotional pattern may soften HOW something else is said (already proven 4x); it must never itself be the reason Soumaya initiates contact | N/A — never a trigger anywhere today |
| Financial Goal funding milestone crossing (e.g. "fully funded") | **E** | Doesn't exist as intelligence — `progress` is a manually-set field with no crossing-detector; would require NEW detection, out of scope for this phase | None |
| Entity timeline "supported vs. stalled" | **E** | Doesn't exist; `entityTimeline.ts` only labels historical memory nodes by epistemic status, no trajectory-state concept | None |
| Relevance tiers (`computeRelevance`) | **D (currently)** | Dead code today (zero callers) — a strong candidate for FUTURE candidate-ranking (see G), not a trigger source itself | None |

## C. Collision Analysis

Confirmed collision-safe or already-bounded cases:
- **Contradiction double-surfacing**: a scored contradiction can reach both Chat's intelligence
  snapshot AND `daily_contact`'s ladder — but `answerDailyContact()` **consumes** the question
  (deletes the resolved insight), so once either path resolves it, the other naturally stops
  repeating it. Bounded, not a real duplication risk.
- **`check_in`'s own heaviness signal vs. `analysis/emotional.ts`'s trajectory**: two genuinely
  separate computations (confirmed again this phase, matching Phase T's original finding) —
  `check_in` never reads `emotionalPatterns`, so there is no risk of the SAME underlying week
  being described twice with two different heaviness readings.
- **Causal links**: never proactively pushed today, so no collision surface exists yet.

**New collision confirmed by this phase's audit, not previously flagged**: `daily_digest` (daily
cadence) and `weekly_review` (weekly cadence) can both independently narrate the **same
individual memory** — a high-importance memory logged today is `takeFor()`'d in today's digest
AND can become `weekly_review`'s `highlight` at the end of the week. Neither knows about the
other. This is a real, live overlap, not a hypothetical one. **Not fixed this phase** (no pilot
in Part A required it) — flagged for whichever future phase migrates or extends either surface;
the fix would reuse `recentActionCount`-style dedup, not a new mechanism.

**Structural collision-prevention that does NOT yet exist**: nothing today can tell whether a
*specific proactive candidate*, not just "did this tool fire recently," has already been raised.
`recentActionCount()` answers "has this ACTION fired recently" (proven, reused 8x) — it does not
answer "have we already told the user their goal-funding trend reversed, specifically, as
opposed to some other goal." A real per-entity dedup key (e.g. `action = "proactive:goal_funding"`
+ a `targets`-carried goal id) would need `agent_logs.targets` to carry real data for the first
time — currently a `'[]'` no-op for all 9 tool-router consumers. This is the sharpest, most
concrete infrastructure gap the audit found, and is scoped into the pilot design (H) rather than
fixed generically here.

## D. Conversation-Worthiness Criteria

Before Soumaya may initiate contact (not just notify), ALL of the following must hold, using only
existing architecture:

1. **Backed by a real computed signal with direction + magnitude**, not a raw fact. (`ChangeResult`
   already has this shape: `direction`, `deltaCents`/`percent`.)
2. **Evidence-gated across ≥2 periods**, mirroring `interactionPreferences.ts`'s own "≥2 consistent
   observations" bar and `ChangeResult`'s own `"insufficient_history"` refusal — a single data
   point never justifies interrupting someone.
3. **The underlying function must already refuse to fabricate** when data is thin (`temporalChange.ts`
   already does this) — reused, not re-invented.
4. **Not already surfaced through another delivery path recently** — reuse `recentActionCount()`'s
   proven pattern.
5. **Communicable without inventing facts** — the signal must already carry a status/confidence
   value the communication layer can represent honestly (`"possible"`, never promoted to
   certainty — `causal.ts`'s own discipline, reused if causal links are ever a trigger source).
6. **Never an emotional/mental-health signal as the sole trigger** — locked, per B.
7. **Cross-domain combinations (e.g. "savings down AND funding requirement up") must not be
   invented ad hoc inside a proactive job** — if the combining logic doesn't already exist as
   tested intelligence, the candidate is not conversation-worthy yet, full stop. (This is exactly
   why the audit does NOT recommend a "funding gap widened" pilot — that combinator doesn't exist;
   see A.)

## E. Existing-State Reuse (anti-repetition)

- **Cadence/cooldown**: `agent_logs.action`+`created_at`, queried via `recentActionCount()` —
  proven across 8 consumers, zero new tables. The pilot (H) reuses this verbatim.
- **Per-entity dedup** (the sharper "have we discussed THIS goal specifically" need): the smallest
  viable fix is to stop hardcoding `agent_logs.targets` to `'[]'` for the ONE new proactive action
  type this pilot would introduce (not a retroactive fix to the other 9 tools) — store the goal id
  as a JSON array of one element, matching the column's already-declared shape. This is additive,
  changes no existing row, and does not require the shared `router.ts` `logAction()` to change for
  every tool — only the pilot's own log write needs a real `targets` value.
- **"Already discussed in chat"**: confirmed no mechanism exists (A). The pilot is deliberately
  scoped to a domain (per-goal funding trend) that chat rarely narrates unprompted today, which
  bounds the practical blast radius of this gap without solving it generally. Solving it generally
  (e.g., logging cited node/entity ids per chat turn to a queryable store) is flagged as a real,
  separate future need — not built here, since no pilot in this phase strictly requires it.

## F. Architecture Boundary — Intelligence → Communication → Delivery

Unchanged from Phases S–V, restated for the proactive case specifically:

```
INTELLIGENCE (existing, locked)
  goalAllocationChange() → { direction, deltaCents, percent } or "insufficient_history"
        ↓
PROACTIVE CANDIDATE GATE (the ONE new piece of logic this pilot would add)
  2-consecutive-periods check + recentActionCount-style cooldown — deterministic, no LLM
        ↓
COMMUNICATION (existing, unmodified)
  buildCommunicationContext(handle, spaceId, opts) → soul, behaviorGuidance,
  preferences, opt-in emotionalPatterns — EXACT same call every other consumer uses
        ↓
DELIVERY (existing, unmodified)
  tc.notify() + agent_logs (this time with a real, non-'[]' targets value for THIS
  action type only) → the same toast bridge every tool-router consumer already uses
        ↓
[future, not this phase] Chat handoff — see G
```

Nothing here is a new engine. The "gate" is the only new logic, and it is a thin, deterministic
threshold check over an already-existing, already-tested function's output — structurally
identical to how `billRiskTool.detect()` already gates on `getBudgetSummary()`'s output today.

## G. Chat Handoff — without duplicating GraphRAG

The eventual "user taps → Chat opens with context" step should reuse, in this order of
precedent-strength:

1. **`chat(question, journeyId?)`'s existing journey-scoping parameter** (Phase Q) is the closest
   already-shipped precedent for "scope this chat turn to one entity's context" — a `goalId`-scoped
   equivalent (or reusing the SAME parameter generalized) is the smallest plausible extension, not
   a new retrieval pipeline.
2. **GraphRAG's normal per-turn retrieval already surfaces the goal's own linked memories** via
   `journey_link`/`FinAllocationRepo` data already in the graph — no second retrieval mechanism is
   needed merely to "know why Soumaya reached out": if the opening system-injected context names
   the specific goal, GraphRAG's existing KNN+BM25+RRF fusion does the rest, exactly as it does for
   any other chat turn.
3. **`computeRelevance()`** (currently dead code, zero callers — confirmed again this phase) is
   flagged as the natural future mechanism for ranking MULTIPLE simultaneous proactive candidates
   against each other (it already combines durability/recency/causal-connection into an auditable
   tier) — **not wired in this phase**, since exactly one candidate class (goal-funding trend) is
   being piloted and there is nothing yet to rank against.
4. **`buildNavigationCandidateList`/`resolveGalaxyEntity`** (Galaxy navigation, locked) is the
   existing "focus the right entity" mechanism — reusable as-is if a future phase wants the
   proactive event to also fly the camera to the goal, with the same "propose, server validates"
   discipline already in place.

No second retrieval pipeline, no second "proactive chat brain," no new context-assembly function
is proposed.

## H. Smallest Pilot — identified, not implemented this phase

**Signal**: `goalAllocationChange()` (`analysis/temporalChange.ts`, already exists, already
tested, already consumed by `causal.ts` and `temporalContext.ts`) — a per-Financial-Goal
30-day-vs-prior-30-day funding-velocity trend, already refusing to fabricate a trend from thin
history.

**Exact scope, if/when this pilot is approved for implementation**:
1. A new deterministic gate function (NOT a new tool-router "intelligence" — a thin wrapper) that
   calls `goalAllocationChange()` for each of a space's active goals, keeps only `direction:
   "decreased"` results above a magnitude threshold reused from an existing codebase convention
   (matching how `INCOME_STALE_DAYS`/`ASSET_STALE_DAYS` are already shared, reused constants —
   not a newly-invented number), and requires this to be true in the CURRENT read only after
   having also been true in the prior period (2-consecutive-periods evidence, per D).
2. `recentActionCount`-style cooldown on a new `action = "proactive:goal_funding"` — reusing the
   exact existing helper, no new mechanism.
3. `agent_logs.targets` populated with the real goal id for this ONE new action type only (E) —
   the smallest structural step toward per-entity dedup, without touching the other 9 tools'
   shared `logAction()`.
4. `buildCommunicationContext(handle, spaceId, { includeFullSpaceEmotionalTrajectory: true })` —
   identical call to every other pilot; a real recurring stress pattern would soften the opener,
   never the reported numbers.
5. Delivery: the existing `agent_logs` → toast bridge, unchanged.
6. Chat handoff: deferred per G — the pilot's message would name the goal so the user can open
   Chat and ask about it normally; GraphRAG already retrieves the goal's linked context without
   any new plumbing.

**Why this signal and not another**: it is the only candidate in the entire matrix (B) that
already has real magnitude, real direction, and a built-in epistemic refusal to fabricate — with
zero new intelligence required. Bill risk (already A) is not a new pilot; it's already proven.
Wealth over-committed and Journey staleness are real but currently only snapshots/single-signals,
not deltas, and would need new intelligence work first (out of scope for a proactive-*trigger*
phase, per the mission's own "audit existing intelligence, don't build new" framing).

**Not implemented this phase.** This is a design, not code — consistent with the mission's
"do not proceed to broad implementation until this audit is complete" and the acceptance
criterion asking the pilot to be *identified*.

## I. Explicit Non-Goals (this phase)

Not built, not started, and not silently implied by anything above:
- No new proactive-event table, generic event bus, or event contract beyond the one `targets`
  population named in H.
- No new LLM call anywhere.
- No wiring of `computeRelevance()` into anything.
- No general "already discussed with the user" tracking mechanism (E's confirmed gap stands,
  scoped around rather than solved).
- No emotional-state-triggered contact of any kind.
- No cross-domain "funding gap widened" detector (doesn't exist; not built here).
- No toast-navigation/`ToastAction` wiring for server-originated proactive messages (a real,
  separate, already-flagged-in-Phase-T gap — still not built).
- No automatic Chat-opening, no messenger UI, no notification-architecture redesign.
- No changes to any of the 8 already-migrated communication consumers.
- No changes to `communication/context.ts`, `analysis/emotional.ts`, `analysis/causal.ts`,
  `analysis/relevance.ts`, or any locked intelligence module.

## Recommendation for the next phase

If this audit is approved, the smallest next implementation phase is exactly the 6-step scope in
H — one signal, one gate function, the existing communication/delivery boundary, and the one
narrow `agent_logs.targets` population needed for per-entity dedup. Everything else identified
here (Journey progress-vs-behavior mismatch, Wealth over-committed repetition-awareness, general
"already discussed" tracking, `computeRelevance` wiring, the digest/weekly-review overlap) is a
real, separately-scoped future candidate — not bundled into the same phase as this pilot, per the
mission's own explicit "smallest pilot, not the complete architecture" instruction.
