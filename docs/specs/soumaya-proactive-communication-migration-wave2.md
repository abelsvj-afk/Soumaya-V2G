# Phase U — Proactive Communication Migration Wave 2 & Intelligence Preservation

> Continuation of Phase T (`docs/specs/soumaya-proactive-communication-migration.md`), itself
> built on Phase S's `communication/context.ts` boundary. Baseline commit: `784a5ef`.
> Status: **audit complete; four-consumer migration wave implemented, tested, gated green.**

## 1. What this phase is

Phase T proved `CommunicationContext` generalizes across a financial single-event tool
(`bill_risk`), a non-financial single-event tool with its own separate emotional signal
(`check_in`), and a scheduled multi-item digest (`daily_digest`). Phase T's own audit named four
more stale consumers — `reminder`, `orphan`, `review_nudge`, `finance_freshness` — as the next
wave, plus a narrow internal bug in `jobRationale`'s research-job wiring. This phase's job is
**intelligence preservation**, not new intelligence: every one of these four tools already
computes a magnitude/severity/timing signal during detection and then discards it before building
the user-facing message. Nothing in `detect()` changed in any of the four; nothing in
`communication/context.ts` changed either.

## 2. Audit — what was found before any code changed

| Consumer | Signal already computed, previously discarded | Existing repetition mechanism |
|---|---|---|
| `reminder` | `overdueMs` (used only to decide silent retirement, then thrown away) | fire-once flag (`reminder_fired_at`) — no cross-reminder signal existed |
| `orphan` | `importance` (used only to RANK candidates in `ORDER BY`, never mentioned in the message); the orphan's own age (implicit in the cutoff query, never retained) | coarse once-a-day `agent_logs` cap only |
| `review_nudge` | `importance`, `review_count`, and `memoryStrength()`'s decay read (all already columns on the SAME row `detect()` picked) | none at the tool level — but a MORE precise per-node signal already exists (`review_count`, whether THIS memory has ever been reviewed) |
| `finance_freshness` | `assetDays` — computed by `detect()`, placed in `args`, and then **never read by `run()` at all** in the assets-only branch (confirmed by inspecting the original source: the branch's template string has no `${assetDays}` interpolation) | 7-day cooldown cap only |

Also audited, per the mission's explicit scope limits, and **left alone**:
- `weekly_review`'s LLM path: confirmed it calls `generateDailyLog()` — a separate, narrower
  prompt (`LOG_SYSTEM` in `llm/prompts.ts`) that does not route through `composeSystem`/
  `ANSWER_SYSTEM` and has no CommunicationContext access. This is a real, separate gap (Phase T's
  §2.2), but migrating an LLM-backed generator is a materially different kind of change than the
  four deterministic pilots here — deferred, per the mission's explicit instruction not to migrate
  it this phase.
- Maintenance job descriptions, contradiction insight text, synthesis insight text: confirmed each
  still has zero `CommunicationContext` access and (except contradiction's stored-but-unused
  `verdict.score`) largely intact intelligence reaching their existing LLM prompts already —
  real future candidates, not migrated here per the mission's explicit "do not mass-migrate"
  instruction.
- `task_creator`, `chart_discovery`, `daily_contact`: reconfirmed correctly deterministic and
  already reasonably intelligence-aware (chart_discovery already embeds its counts directly in its
  lore text; daily_contact already has genuine anti-repeat consumption logic) — not migrated,
  per Phase T's own classification.

## 3. The `jobRationale` bug — fixed, isolated

**Confirmed reproducible**: `maintenance/agent.ts`'s two `research` job call sites (the standalone
`researchGapJob()` and the ladder's rung 2) both compute `pickResearchTarget()`'s scored `factors`
(e.g. "emotional intensity", "contradiction") and embed them in the job's `description` string —
but `mkJob()` → `buildRationale()` → `rationaleFor("research", a, b)` never received `factors`, so
the rationale card's `why` field always read the same generic sentence regardless of what actually
made this node research-worthy. Two "explainable why" surfaces silently disagreed.

**Fix, independently scoped**: `rationaleFor()` gained one new, fully optional 4th parameter,
`detail?: string`, consumed ONLY by the `"research"` case (every other of the 8 job types is a
verified no-op — see the new "no-op for every other job type" test). `buildRationale()`/`mkJob()`
thread it through. Both `research` call sites now pass `pick.factors.join(", ")` as `detail`
instead of only folding it into `description`. Zero changes to `pickResearchTarget()`'s own
detection/scoring logic. 2 new regression tests in the existing `jobRationale.test.ts`.

## 4. Migration — the four consumers

### `reminder.ts`
- **detect() preserved**: byte-for-byte unchanged — same due/grace-window SQL, same
  `MAX_PER_TICK`/`GRACE_MS` constants.
- **Communication changed**: a new `buildReminderMessage()` folds `overdueMs` (already computed
  by `run()` to decide silent retirement) into the wording — "on time" stays the original sentence,
  genuine lateness now says how late in hours/days. Also reads `CommunicationContext.preferences`
  (verbosity) and a new repetition signal (`recentActionCount("tool:fire_reminder", 1 day)` — has
  another reminder already fired today).
- **Intelligence preserved**: the lateness magnitude that used to be computed-then-discarded now
  reaches the user; the retirement threshold (`GRACE_MS`) is completely untouched.
- **Context used**: `preferences` only — `emotionalPatterns` was judged irrelevant for a routine
  reminder ping (no plausible emotional relevance), consistent with Phase T's "access vs.
  relevant" discipline.

### `orphan.ts`
- **detect() preserved**: byte-for-byte unchanged — same `ORDER BY importance DESC, created_at
  ASC` selection query.
- **Communication changed**: `run()`'s already-necessary row re-fetch (needed to re-confirm the
  node is still unlinked) now also selects `importance`/`created_at` — the SAME row, not a new
  query. A new `buildOrphanMessage()` composes at most one magnitude clause (age, importance, or
  both) onto a stable template, plus an independent repetition-aware opener
  (`recentActionCount("tool:surface_orphan", 3 days)`).
- **Intelligence preserved**: `importance` was already the ranking signal that CHOSE this orphan
  over others; it now also explains why it was chosen. Age was implicit in the selection cutoff
  and now reaches the message when it's genuinely long (≥14 days).
- **Context used**: `preferences` (verbosity) only, same reasoning as `reminder`.

### `review_nudge.ts`
- **detect() preserved**: byte-for-byte unchanged — same `dueForReview()` ranking (importance,
  then weakest-first).
- **Communication changed**: `run()`'s row re-fetch now also selects `importance`/`review_count`/
  the columns `memoryStrength()` needs (`created_at`, `last_reviewed_at`, `review_interval_days`)
  — the SAME already-scheduled row. `memoryStrength()` itself (an existing, exported pure function
  in `analysis/review.ts`) is REUSED, not duplicated. A new `buildReviewNudgeMessage()` picks at
  most one reason clause (faded / never-reviewed / significant), by priority, appended to the
  stable template.
- **Intelligence preserved**: strength/importance/review-history were already computed to select
  and rank the candidate; they now also explain the nudge.
- **Context used**: `preferences` (verbosity) only. Deliberately does **not** call
  `recentActionCount` — `review_count` (a per-node, domain-specific signal already on the row) is
  a strictly more precise "has this come up before" read than a generic tool-level repetition
  count would be, so the generic signal is correctly left unused here (a second concrete instance
  of Phase T's "available vs. relevant" principle, this time choosing a domain signal over the
  generic one rather than skipping both).

### `finance_freshness.ts`
- **detect() preserved**: byte-for-byte unchanged — same `INCOME_STALE_DAYS`/`ASSET_STALE_DAYS`
  thresholds, same combined-vs-single-condition logic.
- **Communication changed**: a new `buildFinanceFreshnessMessage()` fixes the confirmed bug (the
  assets-only branch never mentioned `assetDays`) and distinguishes "never snapshotted"
  (`assetDays` arriving as a placeholder `0`) from "genuinely N days stale" — a real correctness
  improvement, not just added detail, since the OLD wording ("in a while") was actively misleading
  for an asset that was never tracked at all. Also reads `preferences` (verbosity) and a
  repetition signal (`recentActionCount("tool:finance_freshness", 21 days)` — wider than the
  7-day cooldown, to detect a genuinely recurring pattern rather than just last week's nudge).
- **Intelligence preserved**: `assetDays` was ALREADY in `detect()`'s returned `args` — it simply
  never reached `run()`'s message construction. No new financial calculation, no new staleness
  threshold, no change to the financial truth model.
- **Context used**: `preferences` only — no `emotionalPatterns` read, per this tool's own explicit
  doc comment (a housekeeping nudge, not a money risk, matching its Phase-S-era framing relative
  to `bill_risk`).

**Default-wording note, stated plainly rather than glossed over**: unlike `reminder`/`orphan`, the
income-only branch of `finance_freshness` is the ONLY one of these four where the true "no
evidence" default is guaranteed byte-identical to the pre-Phase-U string in every case (it already
used `incomeDays` correctly). The assets-only and combined branches' default wording CHANGES
(gains the restored `assetDays`/never-snapshotted distinction) even with no preference/repetition
evidence present — this is the deliberate, in-scope purpose of this phase (restoring already-
computed intelligence to communication), not an unrelated wording tweak, and is called out
explicitly rather than claimed as a silent no-op. Likewise, `review_nudge`'s true byte-identical
default only occurs for a RETURNING (`review_count > 0`), moderately-strength, unremarkable-
importance memory — a real, reachable case, but not the most common one, since most memories reach
this tool on their first-ever nudge (`review_count === 0`), which now correctly explains itself.

## 5. Communication architecture — Intelligence → CommunicationContext → Communication → Delivery

All four consumers follow the identical shape Phase S/T established, with zero duplication:
- **Intelligence** stays entirely inside each tool's own `detect()`/row-fetch — unchanged.
- **CommunicationContext** is read via the exact same `buildCommunicationContext(handle, spaceId,
  opts)` all six prior consumers use — zero changes to `communication/context.ts` itself, the
  fourth-through-seventh confirmation that the Phase S boundary generalizes without modification.
- **Communication** is a small, domain-owned `build*Message()` function per tool (matching
  billRisk/check_in/dailyDigest's own precedent) — never inside the shared module, since each
  tool's branching logic is genuinely domain-specific.
- **Delivery** (`tc.notify()`, `agent_logs.description`, the web toast bridge) is completely
  untouched in all four files.

No new personality, preference, emotional, or intelligence system was created. No new database
table or schema change. `recentActionCount()` (Phase S) is reused verbatim by three of the four
(`reminder`, `orphan`, `finance_freshness`); `review_nudge` deliberately opts out of it in favor of
a more precise domain-specific signal already on hand (§4).

## 6. `jobRationale`: fixed

Fixed, not deferred — see §3. Independently scoped (one optional parameter, one call site's
logic unchanged for 7 of 8 job types), low risk, verified with 2 new regression tests plus the
full existing `jobRationale.test.ts` suite passing unchanged.

## 7. LLM calls

**Zero new LLM calls** across all four consumers and the `jobRationale` fix. Every new
`build*Message()` function is a pure, deterministic string composer over already-computed data.
`weekly_review`'s existing LLM call (audited, per §2) was not touched, added to, or migrated.

## 8. Performance

- `reminder`: +5 cheap reads per firing (soul, behavior, preferences via `buildCommunicationContext`
  with no opts; `recentActionCount`), gated behind `detect()`'s existing due-window filter and
  `MAX_PER_TICK=5` cap.
- `orphan`: +5 cheap reads per firing (same shape), plus 2 extra COLUMNS (not queries) on the
  already-required re-fetch — gated behind the existing once-a-day cap.
- `review_nudge`: +4 cheap reads per firing (no `recentActionCount` — see §4), plus 4 extra
  columns on the already-required re-fetch — gated behind the existing once-a-day cap.
- `finance_freshness`: +5 cheap reads per firing — gated behind the existing 7-day cooldown.

All four remain firmly within Phase S/T's established cost discipline: no GraphRAG, no repeated
embedding calls, no duplicate financial/emotional computation — every added read is either already
a proven-cheap `communication/context.ts` primitive or a column already present on a row the tool
was fetching anyway.

## 9. Testing

- `reminderCommunicationPilot.test.ts` (9 tests), `orphanCommunicationPilot.test.ts` (9),
  `reviewNudgeCommunicationPilot.test.ts` (8), `financeFreshnessCommunicationPilot.test.ts` (8) —
  36 new tests total, covering per consumer: the true default matches the original baseline
  wording (where one exists — see §4's honest exception notes), a learned preference produces
  materially different/shorter wording, the restored magnitude signal reaches the message,
  repetition acknowledgment without altering detection, absent-evidence graceful degradation,
  space isolation, and (for reminder/orphan/review_nudge) a dedicated `detect()`-unaffected
  regression test.
- `jobRationale.test.ts` (+2 tests): the fix reaches `why` correctly, and is a verified no-op for
  every other job type.
- **Existing regression, confirmed green unchanged**: `financeFreshness.test.ts`'s full existing
  `detect()` suite (8 tests, including its own `run()` smoke test) passed without modification.
- Full gate: typecheck clean; **943 server tests** (907 baseline + 36 new pilot tests + 2 new
  jobRationale tests) + **343 web tests** (unchanged), all passing; web build succeeds.

## 10. Reality-test scenarios

| # | Scenario | Result |
|---|---|---|
| Reminder, different context | Same on-time reminder: default vs. concise-preference vs. same-day-repeat all produce distinguishably different wording | Confirmed (tests #1, #2, #5) |
| Orphan communicates why it matters | A 30-day-old, importance-0.9 orphan explicitly names both its age and that it seems to matter, instead of a generic warning | Confirmed (test #4) |
| Review nudge preserves its reason | A never-reviewed memory says so; a genuinely faded one says so; a significant-but-fresh one says so; each reads differently | Confirmed (tests #2, #3, #4) |
| Finance freshness magnitude not flattened | Assets-only stale for 45 days now names "45 days"; never-snapshotted assets read distinctly from that | Confirmed (tests #2, #3) |
| Repeated event, not identical wording | Reminder's "Another one:", orphan's "Another one drifting", finance's "Still nothing new" — three independent implementations of the same principle | Confirmed (reminder #5, orphan #6, finance #6) |
| No preferences → neutral default | All four consumers tested with no preference/repetition data: no throw, sensible neutral wording | Confirmed (all four consumers' "absent data" test) |
| Emotional context changes register, not facts | Not applicable to this wave by design — none of these four consumers read `emotionalPatterns` (all judged irrelevant per §4/§5); this is the correct outcome per Phase T's "access vs. relevant" discipline, not a gap |
| Cross-domain generalization | All four consumers call the identical, unmodified `buildCommunicationContext` six prior consumers already use | Confirmed by code inspection + zero diff to `communication/context.ts` |

## 11. Security / space isolation

Every consumer's dedicated test file includes a space-isolation case (another space's learned
preference never leaks into this space's message) — all pass, reusing `communication/context.ts`'s
existing, unmodified space-scoping. No new cross-space paths were introduced.

## 12. Remaining gaps (unchanged from Phase T except where narrowed above)

- `weekly_review`'s LLM path — audited (§2), not migrated. Recommendation: a future phase should
  route its `generateDailyLog()` call through shared prompt-assembly infrastructure so it at least
  inherits soul/persona/preferences, closing the "second-class LLM call" gap Phase R originally
  named.
- Maintenance job descriptions, contradiction/synthesis insight text — audited, not migrated.
- `WealthPanel` proactive delivery, Journey staleness proactive delivery, the `agent_logs`→toast
  navigation contract — untouched, exactly as instructed; nothing in this phase makes any of them
  harder to build later (no new schema, no new delivery path invented).
- Proactive → Chat event architecture — not implemented; no pilot in this wave needed it.

## 13. Recommendation for the next phase

Based on the evidence gathered here, not speculation: the four-consumer pattern (thread already-
computed row columns into a domain-owned message builder, reuse `buildCommunicationContext`
verbatim, add `recentActionCount` only where a domain-specific repetition signal doesn't already
exist) has now been proven **six times** across financial, non-financial, scheduled, and now four
more single-event tools, with zero modification to the shared boundary itself. The remaining
tool-router surface is exhausted — every registered tool now either uses the shared boundary or
was deliberately classified as correctly deterministic/out of scope. The next highest-evidence
phase is **not** another tool-router migration; it is either (a) `weekly_review`'s LLM-path
integration (the one remaining tool with a real, audited gap), or (b) the deferred
intelligence-preservation work already flagged but out of scope for a communication migration
(the `jobRationale` fix's sibling surfaces — maintenance descriptions — and the WealthPanel/Journey
delivery gaps, which require new proactive detection, not new wording).

## 14. Final verdict: KEEP

Four structurally similar but individually distinct consumers were migrated with zero changes to
`communication/context.ts`, zero new LLM calls, zero new intelligence/detection logic, and one
independently-scoped, tested bug fix. Every consumer's already-computed magnitude/severity/
repetition signal now reaches the user instead of being silently discarded, while every
deterministic fact (thresholds, dates, amounts, classifications) remains exactly as computed by
the unchanged detection logic. 943+343 tests green; full gate clean.
