# Soumaya Shared Communication Boundary (Phase S)

> Design + implementation record. Baseline: `847da55` (Phase R audit). Status: **implemented,
> KEEP.** Follows `docs/specs/soumaya-communication-intelligence-audit.md`'s own recommended
> "smallest next phase" (its §20, steps 1-2) exactly.

## 1. Why Phase R found the communication fragmentation

Phase R traced every user-facing text surface in the product and found that Chat already
assembles a real communication-strategy layer (`ANSWER_SYSTEM`'s style rules, `soul.md`,
`persona/derive.ts`'s "about me" profile, `persona/behavior.ts`'s current-state delivery
guidance, and `analysis/interactionPreferences.ts`'s evidence-gated learned preferences) — but
every proactive surface (the tool-router's 9 tools, maintenance jobs, digests, toasts) is an
independently hand-authored template system with zero access to any of it. The clearest,
most concrete example named: `billRiskTool` correctly detects a real financial risk using the
same Budget Engine chat relies on, then fires one of exactly two hardcoded sentences forever,
regardless of anything else already known about the user or their current situation.

## 2. What `CommunicationContext` is

A single, small, read-only, space-scoped function —
`buildCommunicationContext(handle, spaceId, opts)` in `packages/server/src/communication/context.ts`
— that bundles the outputs of four already-existing, already-locked functions:

```ts
export interface CommunicationContext {
  spaceId: string;
  soul: string;                                  // identity.ts's soulTextFor() — unchanged
  behaviorGuidance: string;                       // persona/behavior.ts's deriveBehavior() — unchanged
  preferences: InteractionPreferenceRow[];        // interactionPreferences.ts's own rows, same evidence filter
  emotionalPatterns: EmotionalPattern[] | null;   // analysis/emotional.ts's own pattern detection, opt-in
}
```

Plus one small, generic, reusable helper: `recentActionCount(handle, spaceId, action, sinceDays)`
— a bounded `agent_logs` read ("has this fired recently") mirroring the exact query shape
`billRiskTool.detect()`'s own once-a-day guard already uses. This is a communication concern
(how much has already been said), not a detection concern, which is why it lives here rather
than in any tool's own detection logic.

**Every field is produced by a function that already existed before this phase.** Zero new
intelligence was written. Zero new tables. Zero new columns. Zero LLM calls — the function's own
signature (`(handle, spaceId, opts)`) structurally cannot make one; it doesn't accept an `llm`
or `embeddings` argument at all.

## 3. What it is NOT

- **Not a giant "everything about the user" dump.** It carries exactly the four inputs Chat's
  own prompt assembly treats as *communication* inputs (as opposed to fact/content inputs).
  Nothing about Journeys, Money, Wealth, People, or memory content lives here — a caller that
  needs those still goes to the same `*SnapshotText` functions/repos Chat already uses for facts.
- **Not a new personality/preference database.** `preferences` is `InteractionPreferencesRepo`'s
  own rows, unmodified, filtered by the exact constants (`SURFACE_CONFIDENCE_THRESHOLD`,
  `MIN_EVIDENCE_TO_SURFACE`) `interactionPreferenceSnapshotText()` itself already uses —
  imported, not re-derived or duplicated.
- **Not a closed personality schema.** No `directness: 7`, no demographic/cultural buckets. The
  open-taxonomy, evidence-gated design of `interactionPreferences.ts` is reused exactly as-is.
- **Not a second emotional-intelligence system.** `emotionalPatterns` is `analysis/emotional.ts`'s
  own `EmotionalPattern[]`, produced by its own unchanged detection logic
  (`buildEmotionalTrajectory`/`buildEmotionalTrajectoryAmong`).
- **Not a numeric "communication strategy" dial system.** No `urgencyScore`, no `warmthLevel`.
  Phase R's own dimension-by-dimension review (its §15) found that every dimension the mission
  brainstormed (directness, verbosity, formality, warmth, whether to ask a question, whether to
  lead with insight) already has a home in an existing mechanism or is correctly left emergent
  from the LLM's own judgment. Inventing a parallel scored schema would be exactly the
  "configuration hell" this phase was explicitly warned against.

## 4. What existing Chat architecture remains authoritative

Nothing in `chat/graphrag.ts`, `llm/prompts.ts` (`ANSWER_SYSTEM`, `composeSystem`),
`persona/derive.ts`, `persona/behavior.ts`, `identity.ts`, or `analysis/interactionPreferences.ts`
was modified. Chat's own communication-strategy layer is untouched, byte-for-byte. Verified
directly (not assumed): `git diff` shows zero changed lines in any of these files; the full
existing test suite for chat (`mayaRealityTest.test.ts`, `journeyScopedChatExperiment.test.ts`,
`journeyAwareRetrievalAudit.test.ts`, and every other chat-adjacent test) passes unchanged.

## 5. What intelligence remains outside communication

Every locked intelligence system named in Phase R's own §19 and this phase's own §13/§24 lock
list — temporal reasoning, causal reasoning, contradiction/supersession, entity continuity,
relevance, embeddings, BM25/RRF, graph traversal, Journey-aware retrieval, Galaxy entity
architecture, the historical truth model, the epistemic model — has zero changed lines. This
phase touched exactly one detection-adjacent file (`billRisk.ts`), and even there, the detection
function (`detect()`) is provably unchanged: a new regression test
(`billRiskCommunicationPilot.test.ts`, "financial reasoning (detect()) is completely unaffected
by any communication context") inserts preference and emotional-pattern rows and asserts
`detect()`'s output is identical to what it would have been without them.

## 6. How proactive surfaces consume the boundary

```
existing financial reasoning (Budget Engine, unchanged)
        ↓
bill risk detected (detect(), unchanged thresholds/math)
        ↓
buildCommunicationContext(handle, spaceId, { includeFullSpaceEmotionalTrajectory: true })
        ↓
a small, tool-owned, deterministic branching function (buildBillRiskMessage) —
NOT baked into the shared module, since a different proactive surface would derive
different branching from the SAME context shape
        ↓
user-facing Soumaya message (still 100% deterministic — no LLM call added)
```

`billRiskTool.run()` now calls `buildCommunicationContext()` (with the full-space emotional
opt-in — see §9) and `recentActionCount()`, derives three simple local booleans
(`leadGently`, `preferConcise`, `preferDirect`) plus the repetition flag, and passes them into
`buildBillRiskMessage()` — a pure function selecting among several deterministic phrasings
instead of the previous fixed pair. The priority order (documented in the code) is: an explicit
learned preference for concision wins outright and produces the shortest form regardless of
anything else; otherwise the OPENING clause is chosen by repetition-awareness, then emotional
gentleness, then the original default; a learned directness preference swaps the closing clause
for a plainer one. This is a genuine removal of Phase R's "fixed-sentence bottleneck": the
message space is no longer 2 hardcoded strings, it now varies meaningfully with context while
remaining fully deterministic, fully offline-safe, and fully testable.

## 7. How Chat consumes it

**Chat does not consume `CommunicationContext` in this phase, by design.** Chat already computes
every one of these four inputs itself, directly, inline in `chat/graphrag.ts` — refactoring those
call sites to route through the new shared function was evaluated and deliberately deferred (see
§14 below) because Chat's own bounded-vs-full-space emotional read
(`buildEmotionalTrajectoryAmong` with the message's own retrieved `ids`) has a subtly different
calling contract than a proactive surface's (which has no "current retrieved context" concept and
must explicitly opt into a full-space read). Forcing both shapes through one call without
first proving the boundary on a real second consumer risked exactly the kind of behavior-changing
refactor Phase S's own Part 14 says to stop and document rather than force. The module's
`CommunicationContextOptions` already models both cases correctly (see §9); migrating Chat's own
four call sites to use it is a safe, mechanical follow-up now that a second real consumer exists
to prove the shape against — explicitly deferred, not forgotten (§15).

## 8. How future notifications/messenger surfaces should work

Per this phase's own required distinction (Intelligence → Communication → Delivery):

```
INTELLIGENCE                 COMMUNICATION                  DELIVERY
(detect / decide it          (CommunicationContext +        (where the user
 matters / gather             a surface-owned strategy       actually receives it:
 relevant reasoning)           function, producing ONE        Telegram, an in-app
                               message string)                 toast, a future
                                                                 "Soumaya wants to
                                                                 talk" notification,
                                                                 a proactive Chat
                                                                 thread)
```

A notification should be a **delivery surface**, never a second intelligence system. The
existing `notify: (text: string) => Promise<void>` contract on `ToolContext` already models this
correctly — the tool decides WHAT and produces the fully-formed message; `notify()` (Telegram
today) and the `agent_logs.description` → toast relay (App.tsx) are pure delivery, and neither
has (or should ever gain) its own phrasing logic. This pattern generalizes directly: a future
Journey-update or Life-Vision-update proactive surface would follow the exact same shape —
its own detection, `buildCommunicationContext()`, its own small branching function — without
inventing a second "notification Soumaya."

## 9. Access vs. invocation

`buildCommunicationContext`'s options parameter is the concrete embodiment of this phase's own
"available intelligence vs. relevant intelligence" distinction:

```ts
export interface CommunicationContextOptions {
  relevantNodeIds?: number[];                       // chat's own bounded scope
  includeFullSpaceEmotionalTrajectory?: boolean;     // proactive/background opt-in
}
```

`soul` and `behaviorGuidance` are always cheap enough to read unconditionally (both are simple
SQL aggregates, already proven cheap by being called on every chat turn today). `preferences` is
likewise always cheap (a small, indexed, space-scoped table — at most one row per distinct kind
of feedback ever observed). `emotionalPatterns` is the one field that could be expensive at
scale (a full-space scan), so it is the one field gated behind an explicit opt-in — omitting both
options is a genuinely free no-op (returns `null`, runs zero extra queries). This is "available
intelligence" (the function CAN provide emotional context) vs. "relevant intelligence" (a caller
only pays for it when its own communication genuinely needs it) made structurally real, not just
a design principle stated in prose.

## 10. Security / space boundaries

Every field in `CommunicationContext` is produced by a function that already takes `spaceId` and
scopes its own query — `buildCommunicationContext` adds no new scoping logic of its own, it only
threads the same `spaceId` through to four already-space-scoped readers. Verified directly with a
dedicated test (`communicationContext.test.ts`, "never leaks another space's soul, preferences,
behavior, or emotional context") that populates a second space ("alice") with a soul override, a
learned preference, and a heavy emotional history, then confirms a context built for a different
space ("bob") shows none of it. The bill-risk pilot has its own equivalent test (scenario 9,
"authenticated space isolation").

## 11. Cost/performance rules

- **Zero new LLM calls anywhere in this phase.** `billRiskTool` remains 100% deterministic and
  offline-safe, matching this codebase's own standing "no feature may hard-depend on a cloud
  key" architecture rule.
- **Additional DB reads for the pilot, measured, not estimated**: one `InteractionPreferencesRepo.list()`
  call (was already a small, indexed, space-scoped table), one `deriveBehavior()` call (already
  proven cheap — called on every chat turn), one `soulTextFor()` call (already proven cheap —
  called on every chat turn), one `buildEmotionalTrajectory()` full-space call (a real but
  bounded aggregate — already the exact query the Digest panel's own on-demand route runs; NOT
  the chat hot path, so this precedent is the correct one to apply), and one `recentActionCount()`
  call (a single indexed `agent_logs` count query). **Total: 5 additional cheap, deterministic
  reads per bill-risk firing — which itself is gated to at most once per space per day.** This is
  not a meaningful cost increase against a once-daily background job.
- **Zero additional latency-sensitive impact on Chat** — Chat's own call sites for these same four
  functions are completely untouched; nothing about this phase changes chat's per-message cost.
- **Explicit anti-pattern avoided**: no LLM call was added purely to "rewrite" the bill-risk
  sentence into something more Soumaya-sounding. The richer, context-aware template already
  removes the literal fixed-sentence bottleneck without that cost.

## 12. How new proactive surfaces should integrate

The recommended pattern for the NEXT proactive surface to adopt this boundary (not built in this
phase — see §15):

1. Keep its own detection logic (`detect()`) completely unchanged.
2. In `run()`, call `buildCommunicationContext(handle, spaceId, opts)` — pass
   `includeFullSpaceEmotionalTrajectory: true` for a background/proactive job (no chat-style
   bounded retrieval concept of its own), or `relevantNodeIds` if the surface DOES have a natural
   small set of currently-relevant memory ids (e.g. a future Journey-update nudge could pass the
   Journey's own linked node ids).
3. Write a small, LOCAL, tool-owned function that derives a handful of booleans/flags from the
   context (mirroring `leadGently`/`preferConcise`/`preferDirect` here) and branches a
   deterministic template — or, once this pattern is validated across 2-3 more surfaces, migrate
   to sharing chat's own `deps.llm.answer()` call (see §15) if a template genuinely can't capture
   the needed nuance.
4. Never let the branching logic itself live in `communication/context.ts` — that module stays a
   pure, domain-agnostic READER; each surface's own communication decision belongs with the
   surface that owns the message, exactly as `billRisk.ts`'s new `buildBillRiskMessage` does.
5. Add tests mirroring `billRiskCommunicationPilot.test.ts`'s 9 scenarios where relevant to the
   new surface (ordinary case, learned preference present, different preference, serious current
   context, repetition, uncertainty, absent data ×2, space isolation).

## 13. What must never become a duplicate system

Explicitly re-affirmed, matching this phase's own §24 "what not to do" list and Phase R's own
findings: no second `soul.md`, no second interaction-preference table, no second emotional
pattern detector, no second GraphRAG/retrieval system, no new database, no new relationship
table, no personality slider schema, no demographic/cultural classification. Every future
proactive surface that needs one of these four inputs MUST call `buildCommunicationContext()` (or
the underlying functions it wraps) — never re-derive its own version.

## 14. Chat impact — explicit statement

**None.** `chat/graphrag.ts` has zero changed lines. This was a deliberate choice, not an
oversight: Phase S's own Part 14 explicitly instructs "if extraction would risk changing Chat
behavior, stop and document the risk rather than forcing the abstraction." Chat's four inline
calls to `soulTextFor`/`deriveBehavior`/`interactionPreferenceSnapshotText`/`emotionalSnapshotText`
already work correctly and are already tested by the full existing chat test suite (confirmed
still green, unchanged, after this phase). Migrating them to call through
`buildCommunicationContext()` instead is a safe, mechanical, LOW-RISK follow-up (the module's
`relevantNodeIds` option already matches chat's own bounded-emotional-context contract exactly)
but was deliberately left undone in this phase to keep the change surface to exactly what was
needed to prove the boundary on one real second consumer, per this phase's own explicit
"intentionally small" framing.

## 15. Deferred / future migration path

1. **Migrate Chat's own four inline calls to `buildCommunicationContext()`.** Low risk (the
   module already matches chat's exact calling contract via `relevantNodeIds`), not done this
   phase to keep the diff minimal and risk-free while the boundary was still unproven.
2. **Extend the pattern to the other 8 tool-router tools** (reminder, orphan, check-in,
   review-nudge, chart-discovery, finance-freshness, weekly-review, web-lookup) — explicitly NOT
   done in this phase per its own Part 21 ("do not overgeneralize the pilot"). Each would follow
   the exact §12 recipe.
3. **A future LLM-backed proactive path**, reusing `deps.llm.answer()` (the SAME method chat
   uses) for surfaces where a template genuinely can't express the needed nuance — deferred, not
   attempted here, because it requires resolving a real open question (framing a "PROACTIVE
   COMMUNICATION EVENT, not a live user question" instruction entirely inside the existing
   `systemExtra` parameter, without ever touching the shared `ANSWER_SYSTEM` text) that deserves
   its own focused design pass rather than being bolted onto this pilot.
4. **The eventual proactive-chat contract** (a notification carrying `{ event, sourceDomain,
   sourceEntity, reason, relevantContext, communicationContext, message, navigationTarget?,
   urgency? }` into a live Chat thread, so tapping "Soumaya wants to talk to you" arrives at a
   conversation that already knows what she noticed and why) — documented here as the target
   shape per this phase's own Part 16, not implemented. `CommunicationContext` as built is
   already a natural `communicationContext` field candidate for that future contract, requiring
   no redesign when that phase arrives.
5. **True bill-specific repetition tracking** (today's `recentActionCount` is deliberately
   coarser — "any bill_risk nudge in the last N days," not "this exact bill's nudge") — a
   bill-id-specific version would need `agent_logs.targets` (an existing JSON column, currently
   hardcoded to `'[]'` by the shared `router.ts` `logAction` function for every tool) to actually
   carry a real value, which means touching a function shared by all 9 tools. Deliberately
   deferred rather than risking that shared change for a coarser-vs-finer refinement that isn't
   required to prove the architecture.

## Architectural invariants — confirmed after Phase S

All 13 invariants listed in the mission remain true, verified directly rather than assumed:

1. One Soumaya identity — `soul.md`/`soulTextFor()` unchanged, single source, now also readable
   (not redefined) by `CommunicationContext`.
2. One authoritative interaction-preference system — `interactionPreferences.ts` unchanged;
   `CommunicationContext` reads its rows, never writes or reinterprets them.
3. No new personality database — confirmed via `git diff`: zero new tables/columns.
4. No demographic/cultural personality classification — `preferences` remains the existing
   open-taxonomy string pairs; no new schema was introduced.
5. Chat retains its existing intelligence access — `chat/graphrag.ts` has zero changed lines;
   full existing chat test suite green.
6. Proactive surfaces can consume shared communication context — proven end-to-end by the
   bill-risk pilot's 10 passing tests.
7. Reasoning remains separate from communication — `detect()` (reasoning) is provably unchanged
   (dedicated regression test) while `run()`'s message construction (communication) is what
   changed.
8. Communication remains separate from delivery — `buildBillRiskMessage()` (communication)
   produces a string; `tc.notify()` (delivery, Telegram today) and the `agent_logs` → toast relay
   remain untouched pure-delivery mechanisms.
9. Historical truth is never rewritten to improve prose — no memory content was touched by this
   phase; `CommunicationContext` is entirely read-only (verified by a dedicated "does not mutate"
   test).
10. Communication cannot manufacture certainty reasoning doesn't establish — verified directly:
    a dedicated test asserts the "pace" (uncertain/not-yet-short) mode's message never claims a
    missed payment as fact, and the emotional-pattern-driven tone softening never names or
    asserts a specific emotion about the user.
11. Ordinary chat should not pay for Journey/proactive context unless explicitly relevant — chat
    was not touched at all this phase, so this remains trivially true; the module's own
    opt-in-by-default-null design for `emotionalPatterns` embodies this principle for any FUTURE
    chat integration too.
12. A proactive surface must not create a new independent Soumaya personality — `billRiskTool`'s
    messages source their identity-adjacent inputs (behavior, preferences, emotional context)
    from the SAME functions Chat uses; no bespoke "bill-risk Soumaya" voice was invented.
13. The shared communication boundary is reusable by future proactive surfaces — `communication/context.ts`
    contains zero bill-risk-specific logic; every field and helper is generic by construction.

## Final Verdict: KEEP

The shared communication boundary is clean (a ~120-line, dependency-light, LLM-free, fully
read-only module), reusable (proven by being consumed by a real second surface with zero
duplication), and the bill-risk pilot demonstrates — with passing regression tests covering
every scenario this phase required — that proactive communication can use the same Soumaya
communication architecture Chat already relies on, without destabilizing Chat (zero changed
lines, full existing test suite green) and without introducing unnecessary cost (zero new LLM
calls, five cheap deterministic reads gated behind an existing once-daily trigger).
