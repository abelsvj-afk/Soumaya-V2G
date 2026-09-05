# Phase T — Soumaya Proactive Communication Migration: Audit & Pilot

> Continuation of Phase S (`docs/specs/soumaya-shared-communication.md`), itself the smallest
> next step from Phase R's audit (`docs/specs/soumaya-communication-intelligence-audit.md`).
> Status: **audit complete; two-consumer pilot implemented, tested, and gated green.**

## 1. What this phase is (and is not)

Phase S built `communication/context.ts` and proved it on exactly one surface (`billRiskTool`)
per its own explicit "intentionally small" scope. This phase's job was to (a) audit every
*remaining* proactive/non-Chat communication surface Phase R only sketched at a high level, (b)
determine whether `CommunicationContext` actually generalizes to consumers that are NOT financial
single-event nudges, and (c) migrate the smallest representative set that proves it — not to make
every proactive surface intelligent in one phase. Per the mission's own explicit instruction, this
phase does **not** rewrite Chat, does not touch the other 8 already-audited tools beyond the two
selected, does not build a notification/messenger UI, and adds **zero new LLM calls**.

## 2. Audit — complete surface inventory

Three parallel research passes covered every remaining surface Phase R's table named. Findings
below are condensed from those passes; file:line evidence lives in the commit history's research,
this table is the synthesis.

### 2.1 Tool-router (10 registered tools — `agent/tools/registry.ts`)

| Tool | Intelligence source | Mechanism today | CommContext? | Repetition signal | Class | Priority |
|---|---|---|---|---|---|---|
| `bill_risk` | Budget Engine | Deterministic, communication-aware | **Yes (Phase S)** | `recentActionCount` | **A** | done |
| `check_in` | Own 5-day mean-of-`emotional_weight` + contradiction insight | Deterministic, communication-aware | **Yes (this phase)** | `recentActionCount` | **A** (migrated) | done |
| `reminder` | `remind_at` due | Fixed template, `overdueMs` computed but unused | No | fire-once flag only | C | medium |
| `orphan` | Unlinked-node SQL | Fixed template, `importance` computed but unused | No | daily cap only | C | low |
| `review_nudge` | `dueForReview()` spaced-repetition ranking | Fixed template | No | daily cap + snooze | C | low |
| `task_creator` | Regex commitment extraction | Fixed template | No | dedup edge (idempotency, not repetition) | E | n/a — correctness-critical |
| `weekly_review` | Week's `emotional_weight`/`importance` | Template, **optionally LLM** via a separate `generateDailyLog` prompt (not `composeSystem`) | No | 7-day cadence cap | C | medium (see §2.4) |
| `web_lookup` | LLM grounded search | LLM content in a fixed shell | No | daily cap + dedup edge | F (LLM call is search, not styling) | n/a |
| `chart_discovery` | Structural graph milestones | Fixed lore templates (count already embedded in text) | No | per-entity once-only key | E — deliberately flavorful/static | low |
| `finance_freshness` | Income/asset staleness days | 3 fixed templates, magnitude computed but not tiered | No | 7-day cooldown | C | low |

### 2.2 Maintenance / digest / insight generators

| Generator | Trigger | LLM? | CommContext? | Class | Priority |
|---|---|---|---|---|---|
| Maintenance job `agent_logs.description` | Autonomy loop (5 min) | Mixed (synthesis/research/sector_vibe/daily_log call LLM; pruning/calibration/harmonization/patrol don't) | **`daily_log` only** (already calls `deriveBehavior` + persona directly, not through the shared module) | C (fragmented — daily_log has its own parallel behavior read) | medium |
| Job rationale (`jobRationale.ts`) | Same tick | No | No | C — and a genuine internal bug: `pickResearchTarget()`'s scored `factors` reach `description` but never `rationale.why` | medium (bug, not a Phase T pilot) |
| **Daily digest** (`dailyDigest.ts`) | On-demand + hourly Telegram sweep | No — explicit "NO LLM call" contract | **Yes (this phase)** | **A** (migrated) | done |
| Contradiction insight | On-demand (`POST /api/digest/contradictions`) | Yes — own `CONTRADICTION_SYSTEM`, not `composeSystem` | No | C | low (score computed, never phrased) |
| Synthesis insight | Autonomy rung 1 | Yes — own `SYNTHESIS_SYSTEM` | No | C | low |
| Daily-contact question | On-demand, cached/day | No | No | E — already has real anti-repeat consumption logic; a good model for others | low |
| Foresight heads-up | On-demand (folded into daily-contact) | No | No | **A-adjacent** — already threads its count into wording, the one generator with no real gap | n/a |
| Away digest | On-demand | No | No | D — computed magnitudes (`newContradictions`, `awayMs`) never reach the greeting | low |

### 2.3 Delivery plumbing

`agent_logs` (id, action, description, targets, result, created_at, space_id) has no
urgency/navigation column. `ToolResult.message` is what `logAction()` persists verbatim and what
the web bridge (`App.tsx`'s log-polling effect) toasts. Three genuine backend Mind-lifecycle
detectors (`goal_completed`, `intention_fulfilled`/`expired`, `event_passed`) already write
hand-authored `description`s through this exact pipeline via a hardcoded `MIND_ICON` map — so
"proactive detection → agent_logs → toast" is a real, already-multi-domain pipeline, not
tool-router-only. Separately, the client's own `Toast`/`InboxNotification` types (`Toasts.tsx`)
**already carry** `priority` and `action: {kind: "focus"|"tab"|"panel"|"chat", value}` — including
a `"chat"` navigation kind already used elsewhere (`HelpPanel.tsx`, `SearchBox.tsx`,
`DigestPanel.tsx`) — but the `agent_logs`→toast bridge never populates `action`, so every
server-originated toast today is non-clickable. **Classification: D (delivery architecture gap),
narrow and well-understood, not touched this phase** — see §7.

### 2.4 Journey / Mind / Wealth "meaningful state change" copy

- `WealthPanel.tsx`'s over-committed warning IS server-driven (`summary.deployableCents`,
  `summary.reconciliation`) but renders inline-only — never an `agent_logs` row, never a toast. A
  user who doesn't open Wealth never learns their position flipped. **Class D** — this would
  require building a NEW proactive detector (a periodic wealth-state check), which is
  intelligence/detection work, not a communication migration — **explicitly out of scope**, per
  the mission's own "do not make every proactive surface intelligent in one phase."
- Journeys already have a server-computed staleness classification
  (`temporalContext.ts`'s `journey_activity`, keyed on `JOURNEY_INACTIVE_DAYS`) — but it is
  **orphaned**: its only consumer is chat's `temporalSnapshotText`, never rendered in
  `JourneysPanel.tsx` and never pushed. **Class D**, same reasoning — surfacing it is a UI/wiring
  project, not this phase's communication-boundary migration.
- `cognitiveSnapshotText`'s flat per-kind progress line and `emotionalSnapshotText`'s
  fixed-per-pattern-strength intervention wording are unchanged Phase-R findings (§7 items 3-4 of
  that audit) — real but narrow, lower priority than closing the chat-vs-everything-else gap,
  **not touched this phase** either.

## 3. Pilot selection

**Selected: 2 consumers, not 3** — `check_in` (non-financial) and `dailyDigest` (scheduled/
job-generated). `bill_risk` (financial) is cited as the already-proven Consumer A from Phase S,
not re-touched. Rationale for 2 over 3, per the mission's own "if the audit finds a better
representative set, explain why" clause:

- A second financial tool (`finance_freshness`) would reproduce billRisk's exact architectural
  shape (single-event tool-router message, `agent_logs`+toast delivery, cadence-cap repetition) —
  the mission explicitly warns against "three nearly identical financial consumers," and adding a
  second instance of an already-proven shape teaches nothing new about generality.
- A Journey/Wealth consumer would require building NEW proactive detection (neither has one
  today) — that is intelligence-layer work the mission explicitly says this phase should not do
  ("do not make every proactive surface intelligent in one phase").
- `check_in` and `dailyDigest` are genuinely, structurally different from `bill_risk` AND from
  each other:
  - `bill_risk` (Phase S): single financial event, deterministic template, `agent_logs`+toast.
  - `check_in` (this phase): single **emotional/non-financial** event, with a pre-existing
    *separate* emotional-detection signal — a real test of "access vs. relevant" (§4 below).
  - `dailyDigest` (this phase): a **periodic, multi-item composition** read on three different
    call sites (API GET, Telegram `/digest`, an hourly sweep), with **no `agent_logs` row at
    all** — an entirely different delivery shape than either tool-router consumer.

This set proves the boundary across event-driven vs. scheduled, financial vs. non-financial, and
single-item vs. multi-item composition — the axes the mission asked to be proven, without
building a third near-duplicate of an already-proven shape.

## 4. Architecture — does `CommunicationContext` generalize?

**Yes, with zero code changes to `communication/context.ts` itself.** Both new consumers call the
exact same `buildCommunicationContext(handle, spaceId, opts)` Phase S shipped. This is itself the
clearest evidence for this section's question: the shared module needed no widening, no new field,
no new option to serve a non-financial single-event tool and a scheduled multi-item digest.

**Access vs. relevance, demonstrated concretely, not just asserted:**
- `check_in.run()` calls `buildCommunicationContext(handle, spaceId)` with **no options** —
  `emotionalPatterns` stays structurally null (zero extra query). This is deliberate: `check_in`'s
  own `detect()` already performs the emotional-detection role for this specific message (a
  separate, pre-existing 5-day mean-of-`emotional_weight` read). Reading `emotionalPatterns` too
  would mean two independent emotional signals feeding one message — the mission's "available vs.
  relevant" distinction made concrete: the field is available, and this consumer correctly does
  not use it.
- `dailyDigest`, by contrast, **does** opt into `includeFullSpaceEmotionalTrajectory: true` — it
  has no domain-specific emotional signal of its own, so the shared field is the only source for
  "should this greeting soften."
- Both consumers use `preferences`; neither uses `soul` or `behaviorGuidance` directly (both are
  deterministic-template consumers, so there's nothing for raw identity/behavior text to attach
  to — reserved for a future LLM-backed proactive path, see §9).

**What correctly stays OUTSIDE `CommunicationContext`** (unchanged from Phase S, reconfirmed):
Journey/Wealth/Mind facts, the Budget Engine's numbers, `check_in`'s own heaviness math, and
`dailyDigest`'s cooling/reminder/connection queries all remain in their own domain-specific
services — `CommunicationContext` never absorbs event-specific intelligence, exactly per the
mission's "bad: `communicationContext.reason = ...`" warning.

**Intelligence → Communication → Delivery, preserved:**
- Intelligence: `check_in.detect()` and every one of `dailyDigest`'s SQL reads are byte-for-byte
  unchanged.
- Communication: the only new code is a `buildCheckinMessage()` (in `checkin.ts`, domain-owned —
  same precedent as billRisk's own `buildBillRiskMessage`) and `buildGreeting()`/`buildClosing()`
  plus a `preferConcise` parameter on `takeFor()` (in `dailyDigest.ts`).
- Delivery: `tc.notify()`/`agent_logs` (check_in) and the unchanged `DailyDigest` return shape
  consumed by the API route/Telegram formatter (digest) — neither touched.

## 5. Intelligence preservation

`check_in.detect()` — the once-a-day `agent_logs` guard, the 5-day mean-of-`emotional_weight`
computation, and the contradiction-insight query — has **zero changed lines**. `dailyDigest`'s
fresh-node query, cooling-entropy SQL, expired-actions parser, and due-reminders query all have
**zero changed lines**; only `takeFor()`'s already-computed classification gained a second,
shorter phrasing per bucket (same bucket, same fact). Verified by direct diff review, not
assumption: `git diff` on both files shows the only additions are the new pure message-builder
functions, the new `buildCommunicationContext` read at the top, and the parameter threaded into
existing calls.

## 6. Communication — how it adapts

- **Evidence gating**: both consumers filter `comm.preferences` through the exact same
  `SURFACE_CONFIDENCE_THRESHOLD`/`MIN_EVIDENCE_TO_SURFACE` bar `interactionPreferences.ts` already
  enforces (imported, not re-derived) — a single mention never surfaces, matching Phase S's own
  contract.
- **Priority order, not a cross-product**: both new consumers follow the exact discipline
  billRisk established — an explicit learned preference (concise) wins outright over a
  pattern-driven softer tone, so the two axes never combine into a combinatorial explosion of
  variants. Proven directly by test (`dailyDigestCommunicationPilot.test.ts` #4: concise +
  pattern present → concise wins).
- **Emotional context never becomes identity**: `dailyDigest`'s `leadGently` only ever softens an
  opener's WORDING ("A gentle pass today...") — it never names the pattern, never claims a fact
  about the user, and is recomputed fresh every call (no persisted "user is currently stressed"
  state). Same rule `check_in` already honored before this phase (it never names "heavy" as a
  diagnosis, only as an observation) — unchanged.
- **Repetition affects communication, not detection**: `check_in`'s new `recentActionCount` read
  (7-day window, `tool:check_in`) only changes the OPENER of an already-detected heavy signal
  ("Still a heavy stretch —" vs. "The last little while..."); it does not affect whether `detect()`
  fires (that stays a strict once-per-calendar-day guard, untouched).
- **Facts stay deterministic**: neither pilot's message construction can alter a dollar amount, a
  date, a count, or the underlying classification bucket — only the WORDING of an already-computed
  fact varies. `dailyDigest`'s concise `takeFor()` variants describe the exact same
  emotionalWeight/importance quadrant as the default variant, just more tersely.

## 7. Proactive event contract — audited, not built

Per the mission's explicit instruction to design "the smallest compatible contract" only if a
selected pilot needs it, and to stop there: **neither pilot needs it.** `check_in`'s message still
flows through the existing `ToolResult.message` → `agent_logs.description` → toast pipeline
unchanged; `dailyDigest`'s output shape is unchanged. The audit (§2.3) found that the *client-side*
contract already has almost everything a future event contract would need
(`ToastAction{kind:"chat"|"focus"|"tab"|"panel", value}`, already used by hand-authored toasts
elsewhere) — the actual gap is narrow and specific: the `agent_logs`→toast bridge in `App.tsx`
never populates `action` for server-originated toasts. **Recommendation for a future phase, not
built here**: extend `ToolResult` with an optional `navigation?: ToastAction`-shaped field,
threaded through `logAction()` and the bridge. Deliberately not implemented in Phase T because it
would be scope creep with no pilot consumer that needs it — building it now would violate "do not
build the whole messenger" and "do not build a new schema unless a pilot requires it."

## 8. Security / space isolation

Both pilots reuse `buildCommunicationContext`'s existing space-scoping (unchanged since Phase S —
zero new scoping logic was needed). Verified by dedicated tests: `checkinCommunicationPilot.test.ts`
#9 (another space's learned preference never leaks into `s1`'s check-in message) and
`dailyDigestCommunicationPilot.test.ts` #5 (another space's preference AND emotional-pattern data
never leaks into `s1`'s digest).

## 9. Performance / cost

- **Zero new LLM calls** in either pilot — both remain fully offline-safe, matching this
  codebase's standing no-hard-cloud-dependency rule and `dailyDigest`'s own pre-existing "NO LLM
  call" contract (unchanged).
- **`check_in`**: +5 cheap deterministic reads per firing (soul, behavior, preferences,
  `recentActionCount`; `emotionalPatterns` stays unread — zero extra query by design), gated
  behind `detect()`'s existing once-per-day guard.
- **`dailyDigest`**: +5 cheap deterministic reads per BUILD (not per fresh-node — the context is
  read ONCE at the top and threaded down into `takeFor()`/`buildGreeting()`/`buildClosing()`, not
  re-fetched per item). Called from three sites (API GET, Telegram `/digest`, hourly sweep) — the
  hourly sweep is already itself idempotent-per-UTC-day via `last_digest_date`, so the added cost
  is bounded to at most once per space per hour-check, same order of magnitude as billRisk's own
  once-per-day cost.
- No repetition-tracking table was added for `dailyDigest` (an open question Phase R's own §21
  already flagged as unresolved) — deliberately deferred; the digest's existing once-per-day
  idempotency already provides a coarse form of restraint, and inventing a new "last said" table
  for one generator was judged premature per the mission's "no new database model unless the
  audit proves it necessary."

## 10. Testing

- `checkinCommunicationPilot.test.ts` (10 new tests): ordinary heavy check-in matches baseline;
  concise preference shortens it; directness preference produces genuinely different wording;
  repeated-within-a-week check-in acknowledges repetition; contradiction kind (default, concise,
  direct); absent-preference behaves like a fresh space; space isolation; `detect()` unaffected by
  any communication-context data.
- `dailyDigestCommunicationPilot.test.ts` (7 new tests): baseline wording matches exactly (byte
  comparison against the ORIGINAL pre-Phase-T strings — the explicit regression-safety proof);
  concise preference shortens greeting/closing/take; a real detected emotional pattern softens the
  greeting without naming it; concise wins outright over a softer pattern-driven tone (no
  cross-product); space isolation; absent data behaves like a fresh space; closing also compacts
  under concise.
- **Existing regression, confirmed green unchanged**: `features.test.ts`'s pre-existing
  `buildDailyDigest` coverage (non-empty greeting/closing on both a populated and a fresh brain)
  passed without modification — proof the default path is unchanged.
- Full gate: typecheck clean; **907 server tests** (890 baseline + 17 new) + **343 web tests**
  (unchanged), all passing; web build succeeds.

## 11. Reality-test scenarios (per the mission's required 6)

| # | Scenario | Result |
|---|---|---|
| 1 | Direct/concise-preferring user | `check_in` #2 and `dailyDigest` #2/#7: materially shorter, verified by length assertion |
| 2 | Explanatory user (no concise preference) | Default branch in both — unchanged elaborate wording |
| 3 | Recent repeated warning | `check_in` #4: "Still a heavy stretch" instead of re-explaining from scratch |
| 4 | Emotional context adapts register | `dailyDigest` #3: gentler greeting, pattern never named |
| 5 | Different domain, same boundary | `check_in` (non-financial) + `dailyDigest` (scheduled) both consume the identical `buildCommunicationContext` call billRisk (financial) already proved |
| 6 | No evidence → neutral default | `check_in` #1/#8, `dailyDigest` #1/#6: byte-identical to pre-Phase-T wording |

## 12. What was explicitly NOT done (per the mission's prohibition list)

No rewrite of Chat, `soul.md`, `persona/behavior.ts`, or `interactionPreferences.ts`. No new
personality taxonomy, emotional engine, preference store, or intelligence engine. No LLM call
added anywhere. `check_in.detect()`'s pre-existing separate emotional signal was **not**
consolidated into `analysis/emotional.ts`'s pattern detector — that would be an intelligence-layer
change, explicitly out of scope for a communication migration (flagged in §4 as a real but
deliberately untouched fragmentation, same as Phase R's own §21 open question #2). The other 8
router tools, all maintenance-job branches, contradiction/synthesis insight text, and the
Journey/Wealth panel copy gaps found in the audit are **not** touched — each is logged in §2 with
a classification and priority for a future phase, not attempted here.

## 13. Recommended next phase

Ordered by the audit's own priority column:
1. **`reminder`/`orphan`/`review_nudge`/`finance_freshness`** — same shape as `check_in`
   (single-event tool-router tools with an already-computed-but-unused magnitude signal), lowest
   risk to extend next using the identical pattern this phase proved twice.
2. **The jobRationale/description factors bug** (§2.2) — a real, narrow, pre-existing internal
   inconsistency (a scored diagnosis reaches one user-facing surface and not its sibling), fixable
   independent of any CommunicationContext work.
3. **The delivery-contract gap** (§7) — populate `ToolResult.navigation` and thread it through
   `logAction()`/the web bridge, once a pilot actually needs a clickable proactive toast.
4. **Journey/Wealth proactive detection** — genuinely new intelligence work (a periodic
   over-committed check, surfacing the already-computed Journey staleness classification), correctly
   deferred out of this phase.
5. **`weekly_review`/contradiction/synthesis's independent LLM prompts** — route through shared
   prompt-assembly infrastructure so they at least inherit soul/persona/preferences, closing the
   "second-class LLM call" gap Phase R's §6 named.

## 14. Final verdict: KEEP

`CommunicationContext` generalized to two structurally different, non-financial/non-single-event
consumers with zero modification to the shared module itself — the strongest possible evidence the
Phase S boundary is a genuine reusable architecture, not a billRisk-shaped one-off. Both migrations
are small (a domain-owned message-builder function each), fully tested, zero new LLM calls, zero
regressions (907+343 tests green, byte-identical default-path wording verified), and leave every
locked intelligence system — `check_in.detect()`, `dailyDigest`'s SQL, `analysis/emotional.ts`,
`interactionPreferences.ts`, Chat's own architecture — completely untouched.
