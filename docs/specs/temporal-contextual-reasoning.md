# Spec — Temporal & Contextual Reasoning

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) / [WORKFLOW.md](../../WORKFLOW.md).
> The originating brief for this feature was an exhaustive, audit-first execution order (not a
> proposal) — this doc is written after implementation, as its own required deliverable, per
> that order's §15. Status: **implemented.**

## 🎯 Purpose

Let Soumaya reason about *when* things happened, what's happening now, what changed, and what's
coming next — across Money, Wealth, Life Vision, Journeys, Mind, and People — instead of treating
every stored fact as equally "now." The underlying data stays authoritative; this is a read-only
reframing layer, never a second source of truth. Concretely, this closes a real gap found by
audit: `cognitiveSnapshotText` was already dumping a Life Vision's or `future_event`'s label into
chat with **zero date context**, and no existing code told Soumaya "this bill is 2 days overdue"
vs. "this bill is due in 3 weeks" — she had access to raw dates but no temporal framing of them.

## 📐 Audit findings this design is built on

A full repo audit (four parallel research passes) preceded any code. Key findings, each of which
directly shaped a decision below:

| Finding | Where | Consequence for this design |
|---|---|---|
| `financialSnapshotText` is the only one of the three existing `*SnapshotText` chat-context functions with an injectable `now: Date` | `finance/snapshot.ts:16` | The new `temporalSnapshotText` follows the exact same signature shape. |
| `chat()` assembles context as independent, best-effort, null-safe `try/catch` blocks concatenated into `systemExtra`, in a fixed order (telemetry → behavior → finance → people → cognitive → grounded-insight → instruction-profiles-last) | `chat/graphrag.ts:192-252` | The new temporal block is inserted as a **fourth sibling**, right after cognitive and before the grounded-insight block — zero changes to `chat()`'s signature or call order otherwise. |
| `ToolContext.now: number` and `now: Date = new Date()` (finance engine) are the two existing deterministic-clock conventions; ~104/32 raw `new Date(`/`Date.now()` call sites exist outside them | `agent/tools/types.ts:16`, `finance/summary.ts:16` | New reasoning code takes an explicit `now`, never reads the wall clock internally. |
| The exact "naive SQLite timestamp vs. zoned ISO" tolerant-parse idiom is copy-pasted independently in 15+ server files and 8 web files, with **no shared server-side utility** (and one web copy, `NotificationsBar.tsx`, has already silently diverged from its own canonical helper) | repo-wide grep audit | A single canonical `lib/time.ts` was added for **new code** to use. The 15 existing call sites are **not** retroactively migrated — that is a separate, unrelated refactor, out of scope here (flagged as a V1 limitation below). |
| `FinIncome`/`FinExpense`/`FinAssetSnapshot`/`FinPaystub` all distinguish a **business date** (`date`/`asOf`/`payDate`) from an **audit timestamp** (`created_at`) | schema + type audit | All classification in this feature keys off the business date, never `created_at`. |
| A Life Vision's `remindAt` is a **target date**, semantically the opposite of every other node kind's `remindAt` (a reminder) — already special-cased by `dueReminders.ts`/`reminder.ts`/`dailyDigest.ts`/`awayDigest.ts` | `analysis/cognitive.ts:145-147`, life-vision spec §C2.1 | Reused exactly: Life Vision facts are built from `listCognitive(..., "life_vision")`'s `remindAt`, deliberately routed through the deadline classifier (never the reminder pipeline). |
| Journeys have **no date-range fields at all** — only `createdAt`/`updatedAt` and a `status` enum | `journeys.repo.ts`, schema audit | Journey "activity" temporal state is derived from `updatedAt` only; there is no Journey "duration" to reason about. |
| No dedicated People table exists — a person is a `nodes` row (`kind="person_entity"`) plus `edges(relationship="supports")` | `analysis/people.ts` audit | Reused as-is via a small, behavior-preserving refactor (`recentPeopleSummaries()`, factored out of `peopleSnapshotText`'s existing query) — no new People model. |
| No existing function compares two periods and returns "not enough data" gracefully — the closest precedent, `analysis/emotional.ts`'s `buildEmotionalTrajectory`, silently defaults to a fabricated `"steady"` trend for zero/one data points | `analysis/emotional.ts:53-60,73` | `ChangeResult`'s `"insufficient_history"` variant is a **first-class, impossible-to-ignore** TypeScript union member — the opposite of that precedent, by design. |
| 6 of 9 agent tools share an (unfactored, duplicated) once-per-day `agent_logs` cooldown query; 2 more have their own bespoke rolling-window variants; no shared helper exists | `agent/tools/*.ts` audit | Not touched. This feature adds **no new proactive nudge/tool** (see "Nudge/digest integration" below) — the existing duplication is noted as a separate future cleanup, not part of this pass. |

## Temporal model

Six states (`packages/shared/src/temporal.ts`):

```
past | current | upcoming | overdue | stale | recently_changed
```

Not every classifier can produce every state — each fact *kind* uses one of three purpose-built
classifiers (`packages/server/src/analysis/temporal.ts`):

- **`classifyDeadline(dateIso, now, withinDays)`** → `overdue | current | upcoming | null`. For a
  date something is due/targeted BY (a bill's due date, a Wealth goal's target date, a Life
  Vision's target date). `null` means "a real future date, just not within the notable window" —
  not an error, and not surfaced.
- **`classifyFreshness(lastDateIso, now, staleAfterDays, recentWithinDays)`** →
  `stale | recently_changed | current`. For "how current is this data" (last income date, last
  asset snapshot, last journey activity, last person interaction). `null`/never-happened is
  always `stale`.
- **`classifyEventDate(dateIso, now)`** → `past | current | upcoming | null`. For a plain
  recorded event with no deadline/freshness semantics.

### Authoritative date sources (never invented)

| Domain | Fact | Source |
|---|---|---|
| Money | Bill due date | `getBudgetSummary(...).reserved[].dueDate` (existing Budget Engine) |
| Money | Income freshness | `FinIncomeRepo.mostRecentDate()` (existing, built for `financeFreshness.ts`) |
| Wealth | Goal target date | `FinGoal.targetDate` |
| Wealth | Goal allocation freshness | `FinAllocationRepo.list(goalId, 1)[0].createdAt`, falling back to `FinGoal.createdAt` if never allocated |
| Life Vision | Target date | `nodes.remind_at` via `listCognitive(..., "life_vision")` |
| Life Vision | Funding | `visionRequirementCents()` (`@brain/shared`, pure, already locked to this exact calculation) + `FinAllocationRepo.totalsByGoal()` |
| Journeys | Activity | `Journey.updatedAt` (the only date Journeys have) |
| Mind | Review-due | `analysis/review.ts`'s `dueForReview()` (existing SM-2-ish schedule) |
| People | Last interaction | `recentPeopleSummaries()` (factored out of the existing `peopleSnapshotText` query) |

### Thresholds — reused vs. new (audited first, per the brief's explicit rule)

| Constant | Value | Status |
|---|---|---|
| `INCOME_STALE_DAYS` | 20 | **Reused** — exported from `agent/tools/financeFreshness.ts`, not redefined. |
| `ASSET_STALE_DAYS` | 30 | **Reused** — same file. (Not directly consumed by `temporalContext.ts` today — asset-snapshot freshness is Money/Wealth's own nudge's job; re-exported for completeness/future use.) |
| `BILL_SOON_DAYS` | 7 | **Reused** — exported from `finance/sky.ts`'s `SOON_DAYS`, the Money-sky galaxy view's existing "due soon" horizon. |
| `JOURNEY_INACTIVE_DAYS` | 30 | **New value, reused constant** — re-exports `analysis/dormant.ts`'s `DORMANT_DAYS` directly (the closest existing "N days untouched is notable" precedent), applied to Journeys, which had no threshold of their own. |
| `GOAL_ALLOCATION_STALE_DAYS` | 90 | **New** — no existing Wealth-side threshold covered "hasn't been allocated to in a while." The number itself is the one explicitly given as an example in the originating brief's §6, not invented independently. |
| `VISION_APPROACHING_DAYS` | 14 | **New** — no existing Life-Vision temporal threshold existed. Also the brief's own §6 example number. Reused for Wealth goal target-date "approaching" too (a goal target and a Vision target are the same *kind* of fact — a financial-commitment deadline — and the audit found no goal-specific horizon to use instead of inventing a second one). |
| `RECENT_WINDOW_DAYS` | 7 | **New** — a generic "this just happened" window for facts with no domain-specific recency constant (person interactions), chosen to match `BILL_SOON_DAYS`'s existing week-based cadence rather than an unrelated number. |

One explicit deviation from the brief's own illustrative numbers: §6 gave "no recorded income in
45 days → stale" as an example. `agent/tools/financeFreshness.ts` already defines **20 days** for
this exact concept. Per the brief's own higher-order rule ("audit existing... reuse... the exact
thresholds must not be invented casually"), the existing 20-day value was reused and the 45-day
example was treated as illustrative, not a mandate to redefine.

## "Now" is explicit

Every function in `analysis/temporal.ts`, `analysis/temporalChange.ts`, and
`analysis/temporalContext.ts` takes `now` as an explicit parameter (`number` ms for the pure
classifiers, `Date` for the higher-level assembly functions, matching `finance/summary.ts`'s own
convention) and never reads `Date.now()`/`new Date()` internally. Every test in this feature fixes
`now` to a specific instant (`2026-09-03T00:00:00Z` throughout) and asserts exact results,
including the controlled-clock property explicitly requested: the same stored due date classifies
as `null` → `upcoming` → `current` → `overdue` purely as `now` advances
(`analysis/temporal.test.ts`, "controlled clock" test).

## Timezone handling

`packages/server/src/lib/time.ts`'s `parseTolerantMs()` is the canonical parser: SQLite's own
`CURRENT_TIMESTAMP` format (`"YYYY-MM-DD HH:MM:SS"`, naive, UTC) is detected (no `Z`, no
`±HH:MM` offset) and coerced to a proper UTC ISO string before parsing; an already-zoned string
(full ISO with `Z`/offset) or a bare `YYYY-MM-DD` business date both parse correctly as-is. Every
domain date this feature reads (bill due dates, goal/vision target dates, journey `updatedAt`,
income/allocation dates) goes through this one function. **Not** retroactively applied to the
15+ pre-existing duplicate copies elsewhere in the codebase — see "V1 limitations."

## Facts vs. reasoning

- **Facts** (authoritative, never modified): a bill's due date, a goal's target date, a Vision's
  target date, an income row's date, a journey's `updatedAt`, a person's last interaction. All
  read through existing repositories/summary functions — no new source-of-truth table.
- **Reasoning** (derived, discarded and recomputed on every call, never written back): the
  `TemporalState` a fact is classified into, and the `ChangeResult` a two-period comparison
  produces. `buildTemporalContext()` and `temporalSnapshotText()` perform **zero writes** to the
  database — grep-verifiable (no `INSERT`/`UPDATE`/`DELETE` anywhere in
  `analysis/temporal*.ts`).

## Context model

`buildTemporalContext(handle, spaceId, now)` (`analysis/temporalContext.ts`) — computed fresh on
every call, **never persisted** (per the brief's own instruction to prefer computing over
storing, and because every fact it reframes is already cheap to re-derive from existing
summary functions). Returns:

```ts
interface TemporalContext {
  now: string;                    // the exact instant every fact below was classified against
  recentFacts: TemporalFact[];    // state === "recently_changed"
  upcomingFacts: TemporalFact[];  // state === "upcoming"
  overdueFacts: TemporalFact[];   // state === "overdue"
  staleFacts: TemporalFact[];     // state === "stale"
  recentChanges: ChangeResult[];  // period-over-period trends (may include "insufficient_history")
}
```

**Bounded by construction**: each of the four fact buckets is capped at `MAX_FACTS_PER_BUCKET = 5`
— a domain that produces more notable facts than that simply doesn't get all of them surfaced
(the least-recently-pushed ones win no special priority; this mirrors the "context-building read,
not a hot path" discipline `peopleSnapshotText`'s own 20-row cap and `journeyLinking.ts`'s link
hydration already use). `"past"`/`"current"` facts are computed but intentionally not bucketed —
they aren't notable enough for a bounded snapshot to spend space on.

**Cross-domain, no domain is authoritative over another**: Money, Wealth, Life Vision, Journeys,
Mind, and People are each read independently via their own existing repo/summary function and
merged only at the `TemporalFact[]` array level — there is no shared mutable state between the
per-domain blocks, and a failure/absence in one domain never affects another (verified directly
in `analysis/temporalContext.test.ts`'s "cross-domain coexistence" test, and structurally true
since each block is a self-contained loop with its own repo instances).

## Change detection

`analysis/temporalChange.ts`. Scope, deliberately bounded:

- **Income** (`incomeChange`) — month-over-month from the existing `incomeSeries()` monthly
  buckets, comparing the last two *populated* (nonzero) months.
- **Net worth** (`netWorthChange`) — month-over-month from `netWorthSeries()`, gated on at least
  one `fin_asset_snapshot` ever existing (otherwise every point's cash figure is the same
  flat-projected number and any "delta" would be fake — see the function's own doc comment).
- **Wealth goal allocation velocity** (`goalAllocationChange`) — trailing-30-days vs.
  prior-30-days sum from the existing dated `fin_allocation` ledger (no new persistence needed:
  every allocation already carries its own `createdAt`).

**Explicitly NOT implemented**: Journey progress change and Life Vision progress change. Both
values are stored as a single current number with **no point-in-time history log** anywhere in
the schema — building one would be new persistence infrastructure, which the originating brief's
own scope-control rules (§16, "do not implement new Wealth/Life-Vision features", and the general
"keep bounded") argue against adding as a side effect of a reasoning-layer pass. Flagged as a V1
limitation, not silently skipped.

`ChangeResult`'s `"insufficient_history"` variant is used whenever a genuine second period
doesn't exist yet (verified directly: zero populated months, zero asset snapshots, or a goal's
entire history falling inside the current 30-day window all produce it, never a fabricated
$0/"unchanged" result — see `analysis/temporalChange.test.ts`).

## AI reasoning boundary

`temporalSnapshotText(handle, spaceId, now)` is the **only** way this feature's output reaches
the LLM — a plain, deterministic string, same `null`-when-nothing-to-say contract as
`financialSnapshotText`/`peopleSnapshotText`/`cognitiveSnapshotText`. It:

- Narrates `overdueFacts`/`upcomingFacts`/`staleFacts`/`recentFacts` and only `"compared"`
  `ChangeResult`s (never `"insufficient_history"` ones — telling the LLM "there's no trend" adds
  nothing; the honest behavior is simply not mentioning a trend it can't back up).
- Opens with an explicit instruction: *"reason about timing from THIS, never invent or assume a
  date"* — every date the LLM might reference in a temporal claim is one this function already
  put in front of it.
- Performs **zero writes**. Soumaya can narrate "this bill is overdue" or "your net worth grew
  8% this month" — she cannot alter a balance, create a transaction, change an allocation, modify
  a goal/Vision/journey, or execute anything. Nothing in this feature calls any repository's
  `create`/`update`/`delete` method.

## Chat integration

One new `try/catch` block in `chat/graphrag.ts`, inserted immediately after the existing
cognitive-snapshot block and before the grounded-insight block — structurally identical to the
finance/people/cognitive blocks already there:

```ts
try {
  const temporal = temporalSnapshotText(h, spaceId);
  if (temporal) systemExtra += `\n\n${temporal}`;
} catch {
  /* temporal context is best-effort; never break chat */
}
```

No changes to `chat()`'s signature, `ChatOptions`, the LLM call, citation logic, or ordering of
anything else. Verified end-to-end in `__tests__/temporalChat.test.ts` (mirroring the existing
`people.test.ts` "injected into chat's systemExtra" pattern): the `TEMPORAL CONTEXT` block appears
in `systemExtra` when there's something notable, and is silently absent for an empty space.

**Deliberately not touched**: `agent/tools/router.ts`'s separate `buildBriefing()` (a much
thinner, unrelated context path feeding the tool-router's own optional LLM curation step, not
chat) — a distinct integration point serving a distinct consumer; conflating the two would have
gone beyond "integrate into the existing context path" into redesigning a second one.

## Nudge/digest integration — explicit decision

**No new proactive tool/nudge was added.** The audit found no existing nudge that already
represents "a Wealth goal hasn't been allocated to in 90 days," "a Journey has gone quiet for 30
days," or "a Life Vision's target date is approaching" — per the brief's own §11 instruction
("if temporal reasoning discovers something that existing nudge infrastructure can already
represent, integrate with it"), there was nothing to integrate with, and inventing a new
notification path was judged out of scope for a reasoning-layer pass (risking the brief's own
"do not create notification spam" rule, and its §15 instruction to STOP and report rather than
guess at a genuinely unclear architectural call). The existing `financeFreshness` nudge's weekly
cooldown and message content are completely untouched by this feature. This is flagged as a clear
V2 candidate, not an oversight.

## Privacy & performance

- **Bounded**: 5 facts per bucket per domain, hard cap — never an unbounded scan or a full-table
  dump into the prompt.
- **No new hot-path queries**: every domain read reuses an existing, already-optimized
  repo/summary function (`getBudgetSummary`, `getWealthSummary`, `listCognitive`, `dueForReview`,
  `recentPeopleSummaries`, `JourneysRepo.list()`) — no N+1 (goal allocation totals use the
  existing `FinAllocationRepo.totalsByGoal()` batch method where applicable).
- **Space-scoped throughout**: every repository call here is already space-scoped by
  construction (the same `spaceId` threaded through everything else in this codebase); verified
  directly by a cross-space-isolation test in `temporalContext.test.ts`.
- **No new persistence, no new tables**: `TemporalContext` is computed, never stored.

## V1 limitations (explicit, not hidden)

1. The canonical `lib/time.ts` parser is **not** retroactively applied to the 15+ pre-existing
   duplicate tolerant-parse implementations elsewhere in the server (or the 8 on the web side) —
   a separate, larger, unrelated refactor.
2. Journey and Life Vision **progress change detection** is not implemented — both are single
   current-value fields with no history log; adding one is new persistence, out of scope here.
3. People have no "stale interaction" concept — only "recently interacted with" is surfaced.
   Inventing a staleness threshold for People was judged unnecessary (the brief's own People
   section only asked to reuse existing relationships) and would have been an arbitrary number
   with zero existing precedent to anchor it to.
4. No new proactive nudge/notification was added (see "Nudge/digest integration" above).
5. `agent/tools/router.ts`'s tool-selection `buildBriefing()` was not extended with temporal
   framing — a possible, clearly-scoped future extension, deliberately not bundled into this pass.
6. The existing, duplicated once-per-day `agent_logs` cooldown pattern across 6+ tool files was
   audited and left as-is (no consumer in this feature needed it).

## Future extension rules

- Any new temporal fact kind must go through one of the three existing classifiers in
  `analysis/temporal.ts` (or a clearly-justified fourth, documented the same way) — never a new
  ad-hoc date comparison inline in a context builder.
- Any new threshold must be audited against existing code first, exactly as this pass was;
  document whether it's reused or new, and why, in the same style as the table above.
- Journey/Vision progress-change detection, if ever added, requires a real point-in-time
  progress log (new table) — do not approximate it from a single current value.
- If a future nudge tool is added for one of this feature's classifications (goal-allocation
  staleness, journey inactivity, vision-approaching), it must use the SAME thresholds this module
  already defines (`GOAL_ALLOCATION_STALE_DAYS`, `JOURNEY_INACTIVE_DAYS`,
  `VISION_APPROACHING_DAYS`) rather than redefining them a third time.

## 🧪 Test plan (as implemented)

- `lib/time.test.ts` (11) — tolerant parsing across all three timestamp shapes, malformed/empty
  input, day-math boundaries.
- `analysis/temporal.test.ts` (16) — all three classifiers, exact threshold boundaries, the
  controlled-clock property (same fact, different `now`, different correct result).
- `analysis/temporalChange.test.ts` (11) — `compareTwoPeriods` arithmetic (including
  divide-by-zero-previous → `null` percent, not `Infinity`), and insufficient-history vs. real
  comparison for all three change-detection functions, including space isolation.
- `analysis/temporalContext.test.ts` (14) — per-domain classification correctness, cross-domain
  coexistence, bucket bounding under load (20 stale goals → ≤5 surfaced), full space isolation,
  and `temporalSnapshotText`'s determinism + its refusal to narrate insufficient-history trends.
- `__tests__/temporalChat.test.ts` (2) — end-to-end chat injection, mirroring the existing
  `people.test.ts` pattern exactly.
- Regression: full existing server (554 baseline) and web (308 baseline) suites re-run green.

## ✅ Acceptance criteria

1. Six temporal states, three purpose-built classifiers, zero arbitrary invented timestamps.
2. Every classification takes an explicit, testable `now`.
3. Money + Wealth + Life Vision + Journeys + Mind + People all contribute facts without one
   becoming authoritative over another.
4. Change detection never fabricates a trend from insufficient data.
5. Chat receives a bounded, deterministic, null-safe temporal snapshot via the exact same
   integration pattern as the three existing snapshot functions.
6. Zero writes anywhere in the new code — Intelligence interprets, never becomes the ledger.
7. Full gate green; zero regressions in Money/Wealth/Life Vision/Journeys/People/Reminders/
   Growth/Pay Stubs.
