# Phase X — Goal Allocation Proactive Conversation Pilot

> Implements the smallest pilot identified in Phase W's audit
> (`docs/specs/soumaya-proactive-intelligence-audit.md` §H). Baseline commit: `cf0b667`.
> Status: **implemented, tested, gated green.**

## 1. Implementation — exactly what changed and why

| File | Change |
|---|---|
| `analysis/temporalChange.ts` | **Unchanged.** `goalAllocationChange()` is called, never modified. |
| `communication/context.ts` | **Unchanged.** Called via the identical `buildCommunicationContext(handle, spaceId, opts)` every other consumer uses. |
| `agent/tools/types.ts` | `ToolResult` gains one new optional field, `targets?: number[]`. Every pre-existing tool leaves it unset, so `logAction()`'s output for them is byte-identical to before. |
| `agent/tools/router.ts` | `logAction()`'s `INSERT INTO agent_logs` now writes `JSON.stringify(result.targets ?? [])` instead of the hardcoded literal `'[]'`. Additive only — verified via a dedicated regression test that a tool which never sets `targets` (`check_in`) still logs `'[]'` through the same real router call. |
| `agent/tools/goalFundingTrend.ts` (new) | The pilot tool: `detect()`/`run()`, the two-period evidence gate, the per-goal dedup helper, and the deterministic message builder. |
| `agent/tools/registry.ts` | Registers `goalFundingTrendTool` — the 11th tool-router tool. |

No other file changed. `computeRelevance()`, `analysis/emotional.ts`, `analysis/causal.ts`, Chat, GraphRAG, and every already-migrated communication consumer (billRisk through weekly_review) are untouched.

## 2. Intelligence — how `goalAllocationChange()` flows into the candidate

`detect()` calls the existing function **twice per active goal**, at `now` and at `now` shifted
back by exactly one allocation window (30 days — the same private constant
`goalAllocationChange()` itself uses, mirrored as a local, documented constant since the
original isn't exported). This reuses the SAME function to read the prior period's own trend,
rather than inventing a second comparison algorithm:

```
current = goalAllocationChange(handle, spaceId, goal, now)
prior   = goalAllocationChange(handle, spaceId, goal, now - 30 days)
```

Both calls independently decide, using only their own existing logic, whether there's a genuine
second period to compare (`status: "compared"`) or not enough history
(`"insufficient_history"`). Neither call is told the answer in advance.

## 3. Evidence — the two-period gate, exactly

A goal becomes a proactive candidate only when ALL of the following hold:
1. `current.status === "compared"` (not insufficient history).
2. `current.direction !== "unchanged"`.
3. `Math.abs(current.deltaCents) >= MIN_MEANINGFUL_DELTA_CENTS` ($50 — a documented, single
   dollar-magnitude threshold; no percent-based algorithm was invented).
4. `prior.status === "compared"` (the prior period must ALSO have had a real comparison).
5. `prior.direction === current.direction` (the same direction must hold across both periods).

If `current` returns `"insufficient_history"`, the loop `continue`s immediately — there is no
path where thin data becomes a fabricated candidate. Verified directly: Test 1 (only one valid
period) and Test 2 (a real change occurring only once, with no genuine prior-period comparison
possible) both correctly produce zero candidates.

## 4. Deduplication — how `agent_logs.targets` is now used

`ToolResult.targets` is a new, optional, additive field. `goal_trend`'s `run()` sets it to
`[goalId]` — the exact same `JSON.stringify([id])` shape `analysis/cognitive.ts`'s
`goal_completed` write already uses elsewhere in this codebase (confirmed, not invented).
`detect()`'s `wasGoalRecentlySurfaced()` reads `agent_logs` directly (`action = 'tool:goal_trend'`,
`created_at >= now - 30 days`), parses each row's `targets` JSON, and skips a goal whose id
appears in any recent row. No new table. The cooldown window (30 days) mirrors the underlying
signal's own natural period — the intelligence itself cannot report genuinely new evidence more
often than that, so a shorter cooldown would only ever re-surface the identical evidence.

**Scoped correctly, not globally**: the check is keyed on the specific goal id, so Goal A's
recent surfacing never suppresses Goal B's independent, genuinely new signal — verified directly
(Test 8).

## 5. Communication — how `CommunicationContext` shapes the message

`run()` calls `buildCommunicationContext(handle, spaceId, { includeFullSpaceEmotionalTrajectory:
true })` — identical to `bill_risk`/`daily_digest`/`weekly_review`'s own precedent for a
background/non-chat-hot-path firing. `comm.preferences` (verbosity/directness) and
`comm.emotionalPatterns` (opt-in, full-space) shape the deterministic template exactly like
every other tool-router pilot:
- A learned "concise" preference shortens the message.
- A learned "directness" preference drops the softer closing clause.
- A real, recurring emotional pattern (Stress cycle/Burnout risk/Downswing) softens ONLY the
  opener of a "decreased" message ("No pressure, but I noticed...") — it is never read by
  `detect()`, so it can never itself trigger the pilot, satisfying the Phase W/X lock that
  emotional patterns remain tone modifiers only.
- `comm.soul`/`comm.behaviorGuidance` are read (the full context object is built, exactly like
  every deterministic-template pilot before it) but — same as `billRisk`/`check_in`/
  `finance_freshness`'s own established pattern — a deterministic template cannot literally quote
  free-text identity/behavior prose the way weekly_review's LLM call does; a space-level soul
  override is verified not to break the pilot (Test 10c).

The message never invents a cause. It states which goal, which direction, and how much — nothing
about WHY the allocation changed (Phase X §7's explicit requirement).

## 6. Delivery — the existing toast path, unchanged

`run()` calls `tc.notify(msg)` exactly like every other tool. The router's `logAction()` (now
additionally carrying `targets`) writes the message to `agent_logs.description`, which the
existing web-side `agent_logs` → toast bridge (`App.tsx`) already surfaces for
`tool:`-prefixed actions — no new delivery code, no new UI.

## 7. Chat — minimal handoff intentionally deferred

Per Phase X §10's explicit instruction, the full proactive-to-Chat architecture was **not**
built. The toast today identifies the relevant goal by NAME in its own text (e.g. `"Emergency
Fund"`) — sufficient for a user to bring it up in Chat themselves, and GraphRAG's existing
per-turn retrieval already surfaces that goal's own linked memories/allocations without any new
plumbing once it's mentioned. A structured tap-to-open-Chat-with-context handoff would require
extending `ToastAction`/the `agent_logs` → toast bridge to carry a navigation payload — this is
the exact gap Phase T/W already flagged and explicitly did not build; still not built here, since
this pilot's `agent_logs.targets` addition is not itself sufficient to wire a UI click-through
(that's a separate, client-side change). **Recommended as the concrete next step**, not expanded
into this phase's scope.

## 8. `computeRelevance()` — untouched

Not wired into this pilot. The goal-allocation signal already carries its own real
magnitude/direction/confidence discipline (via `ChangeResult`) sufficient for this single-signal
pilot; `computeRelevance()` remains dead code (zero production callers), exactly as Phase W found
it. It becomes relevant once multiple SIMULTANEOUS proactive candidate classes exist and need
ranking against each other — not yet the case with one signal.

## 9. Collision with daily/weekly communication — checked, none introduced

`daily_digest` and `weekly_review` narrate raw MEMORY content (`nodes` rows); this pilot narrates
a `fin_goal`/`fin_allocation` financial signal that neither of those surfaces reads or describes
in any form. No new collision was introduced. The pre-existing digest/weekly-review overlap Phase
W flagged (§C) is unrelated to this pilot and was not touched.

## 10. LLM calls

**Zero.** `goalFundingTrendTool` is fully deterministic, matching the codebase's standing
no-hard-cloud-dependency rule.

## 11. Testing

23 new tests in `goalFundingTrendPilot.test.ts`, covering all 12 required scenarios from Phase X
§14 plus the required full-chain test (§15) that drives the REAL `runToolRouter()` production
entry point end-to-end and reads back the actual `agent_logs` row:

1. Insufficient history → no candidate.
2. A meaningful change occurring only once (no genuine prior-period comparison) → no candidate.
3. Two consecutive periods of decrease → eligible (plus an increase-direction mirror case, plus
   a below-threshold-magnitude case, plus an "unchanged" case).
4. Direction preserved into the message (both directions).
5. Magnitude preserved into the message.
6. Correct goal identity attached (`res.targets`).
7. Same goal recently surfaced → no duplicate (plus: eligible again after the cooldown expires).
8. A different goal's own real signal is not suppressed by goal A's recent surfacing.
9. A recurring emotional pattern with NO goal-allocation signal → no candidate (plus: a pattern
   correctly softens tone without ever naming the emotion, when a real financial signal exists).
10. CommunicationContext: preferences (concise/direct) demonstrably change the message; a
    space-level soul override doesn't break the pilot; no evidence produces the neutral default.
11. Space isolation: another space's goal/allocation/preference data never leaks in.
12. A pre-existing tool (`check_in`) still logs `targets: '[]'` through the same real router.
15. **Full chain**: `goalAllocationChange()` → evidence gate → eligibility → dedup →
    `CommunicationContext` → message → real `runToolRouter()` delivery + `agent_logs` row
    (with the goal id correctly in `targets`) → re-running the router immediately does NOT
    re-fire for the same goal.

Full gate: typecheck clean; **993 server tests** (970 baseline + 23 new) + **343 web tests**
(unchanged), all passing; web build succeeds.

## 12. Performance

- `detect()` runs once per tool-router tick (~60s, same cadence as every other tool) and reads:
  the space's active goals (`FinGoalRepo.list()`, already a cheap indexed read) × 2
  `goalAllocationChange()` calls per goal (each a single `fin_allocation` ledger read, capped at
  500 rows, already an existing, already-cheap function) + 1 `agent_logs` dedup read per goal
  (bounded to this ONE tool's own rows in a 30-day window).
- `run()` (only invoked for actually-eligible candidates, which are rare by construction) adds
  the same ~4-5 cheap reads every other `buildCommunicationContext` consumer already pays.
- No GraphRAG, no causal analysis, no emotional full-space scan unless a real candidate is
  actually about to fire (and even then, only the bounded emotional trajectory read every other
  background pilot already uses).

## 13. Non-Goals — explicitly not built

- No new proactive-event table, generic event bus, or event contract.
- No wiring of `computeRelevance()`.
- No general "already discussed with the user" tracking (Phase W's confirmed gap).
- No structured Chat handoff / navigation payload (deferred, per §7).
- No new LLM call.
- No changes to any of the 8 already-migrated communication consumers.
- No changes to `communication/context.ts`, `analysis/emotional.ts`, `analysis/causal.ts`,
  `analysis/temporalChange.ts`, or `analysis/relevance.ts`.
- No cross-domain "funding gap widened" detector (doesn't exist; Phase W confirmed this, not
  built here).
- No global fix for the daily_digest/weekly_review memory-narration overlap.

## 14. Next recommendation

The smallest next step toward the full "Soumaya notices → understands → decides it matters →
knows how to talk → reaches the user → opens the right Chat context → continues the conversation"
arc is the **toast navigation payload**: extend `ToastAction`/the `agent_logs` → toast bridge
(already flagged in Phase T, still not built) so a proactive toast like this pilot's can carry a
`{kind: "chat", value: goalId}`-shaped hint, letting a tap open Chat pre-scoped to the goal
(reusing Phase Q's existing `journeyId`-scoped chat pattern, generalized) rather than requiring
the user to bring it up themselves. This is a client-side delivery change, not a new intelligence
or communication system — the smallest concrete increment that doesn't require duplicating
GraphRAG or building a messenger.

## Final verdict: KEEP

One real, already-trustworthy longitudinal signal was proven end to end through the exact chain
Phase W designed: reused intelligence → a deterministic two-period evidence gate → per-entity
deduplication via the existing `agent_logs` table → the existing `CommunicationContext` boundary
→ the existing deterministic-template communication pattern → the existing toast delivery
surface. Zero new intelligence, zero new LLM calls, zero new architecture beyond one additive
`ToolResult` field. 993+343 tests green; full gate clean.
