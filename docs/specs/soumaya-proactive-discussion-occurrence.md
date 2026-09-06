# Phase AB — Proactive Discussion-Occurrence Primitive

> Closes the gap identified by Phase AA's audit (docs/specs — see the Phase AA report in
> conversation history; no separate audit doc was produced, per that phase's audit-only scope):
> `{source, targetId}` (Phase Y/Z) explains WHY a Chat turn was opened, but the fact that the
> exchange ever happened vanished the instant the response was sent. Baseline: Phase Z's commit
> `f70a359`. Status: **implemented, tested, gated green.**

## 1. Step 1 finding — the chosen discussion-occurrence event, and why

Traced the real `/api/chat` lifecycle in `chat/graphrag.ts` before writing any code. The
candidate events from the mission (notification fired → displayed → tapped → Chat opened →
request received → LLM answer generated → response returned → follow-up sent) are **not**
equally trustworthy:

- Steps 1–4 (fired/displayed/tapped/Chat opened) are entirely client-side and never reach the
  server as discrete events — no code path exists to record them durably even in principle.
- Step 5 (request received) is too early: the `proactiveContext` in the body hasn't been
  validated yet — recording here would create a record for a forged/cross-space/garbage id.
- **Step 6 is the critical finding.** `chat()`'s final `deps.llm.answer(...)` call
  (`chat/graphrag.ts:410`) is **not** wrapped in a `try/catch`. If the LLM provider throws (a
  real, non-hypothetical failure mode — network error, quota, outage), `chat()` itself throws,
  the route's `await chat(...)` rejects, and Express's central error handler returns an error
  response — `res.json()` is never reached. `proactiveContextSnapshotText()` runs at
  `chat/graphrag.ts:348`, **before** this unguarded call. Recording an occurrence there (as the
  syntactically-similar existing precedent `recordClarificationAsked()` does inside
  `intelligenceSnapshotText()`) would therefore risk a **false positive**: a "discussion
  occurred" record for a turn that actually failed and the user never saw.
- Step 7 (response successfully generated) is therefore the smallest defensible definition:
  record the occurrence **only after `chat()` has returned without throwing** — i.e., from the
  route, after `await chat(...)` resolves, before `res.json(result)`.
- Step 8 (user sends a follow-up) was considered and rejected as the definition — it would
  require tracking additional state across requests for no evidentiary gain; a request that
  received a real answer already satisfies "an interaction occurred," and requiring a *second*
  message would under-count genuine single-message exchanges.

**Chosen event: a real `/api/chat` request, carrying a proactive context that re-validates
successfully, for which `chat()` returned an answer without throwing.**

## 2. Was `agent_logs` semantically suitable?

**Yes — no concrete semantic problem found**, so no new table was created (per Step 12's
explicit instruction to stop and report rather than invent a replacement if one had been
found). `agent_logs` already stores exactly the four fields this fact needs (`space_id`,
`action`, `targets`, `created_at`), already supports free-form `action` naming beyond the
`tool:*` family (confirmed by grepping every existing `INSERT INTO agent_logs` call site —
`intelligence:clarification`, `people_merged`, `goal_completed`, `idea_promoted`,
`event_passed`, etc. all coexist as distinct, independently-queryable `action` values with no
shared schema conflict), and the router's own dedup queries are already scoped by exact
`action` string match — a new, distinct action string is guaranteed never to be read by any
existing query.

## 3. Exact action name used

**`chat:proactive_discussion`** — following the established `domain:subaction` convention
already in this codebase (`intelligence:clarification` is the direct precedent, found via a
repo-wide grep of every `INSERT INTO agent_logs` call site), rather than inventing a new naming
scheme or reusing the `tool:*` prefix (which is reserved for autonomous tool-router firings —
this fact originates from the Chat route, not a tool).

## 4. Exact target representation used

Unchanged from Phase X/Y/Z: `targets = JSON.stringify([input.targetId])` — a one-element array
containing exactly the same `targetId` the `{source, targetId}` contract already carries.
`description` holds only `` `proactive-context Chat exchange occurred (${input.source})` `` —
the source name for a human skimming `agent_logs`, nothing else (no entity name, no amount, no
message text).

## 5. Files changed

| File | Change |
|---|---|
| `analysis/proactiveContext.ts` | New exported function `recordProactiveDiscussion(handle, spaceId, input, now)`. Doc comment updated to describe this one deliberate exception to the module's otherwise-ephemeral design. |
| `api/routes/chat.ts` | One new import; one new call to `recordProactiveDiscussion(...)` inserted between `await chat(...)` and `res.json(result)`, gated on `parsed.data.proactiveContext` being present. |
| `__tests__/proactiveDiscussionOccurrence.test.ts` (new) | The 13 required scenarios (§12). |

**`chat/graphrag.ts` and `ChatResponse` (`packages/shared/src/types.ts`) have a `git diff` of
zero bytes** — confirmed directly. The Chat pipeline itself was never touched.

## 6. Existing systems reused

- `agent_logs` (schema, insert pattern, `domain:subaction` naming convention) — 100% reused,
  zero schema change.
- `proactiveContextSnapshotText()` (Phase Y/Z) — reused as the **sole** validation path.
  `recordProactiveDiscussion()` calls it internally and only writes when it returns non-null;
  it does not re-implement space-scoping, entity resolution, or "does the signal still hold"
  logic a second time.
- The route's existing `spaceOf(res)` request-scoping — identical authorization boundary
  `chat()` itself already uses for the same request.
- The existing `{source, targetId}` contract (Phase Y/Z) — completely unchanged; this phase
  adds no new field to it.

## 7. Security / space-isolation verification

`recordProactiveDiscussion()` performs no independent trust decision — it delegates entirely to
`proactiveContextSnapshotText()`, which resolves `targetId` through each source's own
space-scoped repository (`FinGoalRepo.get`/`FinBillRepo.get`, both constructed with the
**request's own** `spaceId`). A cross-space or forged `targetId` therefore resolves to `null`
in exactly the same way it already does for the chat framing itself — no occurrence row is
written. Verified directly: test 5 confirms a real cross-space goal id produces **zero** rows
in either the requesting space or the target's actual space.

## 8. What the new record proves

Exactly one fact: **"a real, successfully-answered `/api/chat` exchange, carrying a validated
proactive context, occurred for this entity at this time."** Nothing more.

## 9. What it intentionally does NOT prove

Per Step 7, explicitly and by construction this record does **not** establish: that the user
read or agreed with the reply, that they took any action, that the underlying issue was
resolved, that the conversation covered the topic in any depth, or that the user's own message
was even about the entity in question (the server cannot verify conversational relevance — only
that a validated proactive context was attached to a successful exchange). The doc comment on
`recordProactiveDiscussion()` states this explicitly so a future reader can't accidentally
over-interpret the row.

## 10. Confirmation: no transcript/content persistence added

No question text, answer text, citation, or any other conversational content is written by this
phase. Verified directly: test 11 sends a message containing a unique, unmistakable sentence and
confirms it appears in **no** table anywhere — not in the occurrence row's `description`
(checked directly) and not in `nodes` (a broad `content =` / `label =` scan).

## 11. Confirmation: no new database/table/framework added

`agent_logs` is the only table touched, via a plain `INSERT` using its existing columns — no
`ALTER TABLE`, no migration, no new repository class, no event bus, no registry. Verified
directly: test 12 confirms the `nodes` table's row count is unchanged by an occurrence-recording
call.

## 12. Tests added and results

14 tests in `proactiveDiscussionOccurrence.test.ts` (one of the 13 required scenarios — #2 and
its sibling framing checks — needed a slight scenario split, landing at 14), driving the real
`/api/chat` HTTP route for every scenario the mission listed as preferring real entry points:

1–2. A valid `goal_trend` / `bill_risk` proactive exchange creates the occurrence.
3. The correct target id (not some other value) is stored.
4. The row's `created_at` is a real, current server-side timestamp (bounded check against
   `Date.now()` immediately before/after the request).
5. A cross-space target creates **no** occurrence, in either space.
6. An invalid/stale (nonexistent) target creates no occurrence.
7. Ordinary Chat with no `proactiveContext` creates no occurrence.
8–9. `goal_trend`'s per-goal dedup and `bill_risk`'s once-a-day gate are both unaffected by the
   new action existing alongside them.
10. Multiple real exchanges for the same entity are each independently represented, and the
    ORIGINAL `tool:goal_trend` firing row remains exactly one row, untouched.
11. No chat transcript is persisted anywhere (see §10).
12. No durable memory (`nodes` row) is created merely by the occurrence write (see §11).
13. Phase Y/Z's own proactive → Chat framing behavior (via direct `chat()` calls) remains
    intact — split into a `goal_trend` and a `bill_risk` case.

**Full gate**: typecheck clean across all 3 workspaces; **1039 server tests** (1025 baseline +
14 new) + **343 web tests** (unchanged, Phase AB touches no web code), all passing; `npm run
build -w @brain/web` succeeds.

A real subtlety surfaced and fixed while writing these tests: the real `/api/chat` route has no
injectable clock, so fixture data anchored to a fixed historical date (the pattern every prior
phase's tests used, since they always call `chat()`/`runToolRouter()` with an explicit `now`)
silently fails validation when driven through the real HTTP route at actual wall-clock test-run
time — `goalAllocationChange()`/`getBudgetSummary()` find no "current period" activity and
report "unchanged"/"not at risk." Fixed by anchoring the real-route tests' fixtures to
`Date.now()` at test-file load time instead of a fixed epoch — a testing-methodology finding
worth flagging since Phase Y/Z's own full-chain HTTP tests share this same latent gap (their
assertions only checked `res.status`/`answer` truthy, never that framing text was actually
produced, so they happened not to be affected).

## 13. Typecheck/build results

Clean. See §12.

## 14. Performance impact

- **Ordinary Chat (no `proactiveContext`): zero new work** — the route's `if
  (parsed.data.proactiveContext)` guard means `recordProactiveDiscussion()` is never even
  called.
- **Proactive Chat**: one additional call to `proactiveContextSnapshotText()` (the same
  function `chat()` itself already called once for framing — one more indexed-row read +
  bounded budget/allocation query, no LLM call, no GraphRAG) plus, only on success, one `INSERT`
  into an already-indexed table. O(1) relative to the interaction, exactly as required.
- No background job, no event bus, no polling, no extra intelligence subsystem invoked.

## 15. Regression verification for goal_trend and bill_risk

Confirmed both at the unit level (tests 8–9: `detect()`'s own dedup/cooldown behavior is
identical before and after a real Chat interaction plus an occurrence write) and via the full
pre-existing suite: `goalFundingTrendPilot.test.ts`, `billRisk.test.ts`,
`billRiskCommunicationPilot.test.ts`, `proactiveContextHandoff.test.ts`, and
`billRiskProactiveChatHandoff.test.ts` all pass unmodified. `chat/graphrag.ts` has zero diff, so
none of Phase Y/Z's own framing/re-derivation logic could have regressed.

## 16. Future combination example (not implemented)

Illustrative only — no code for this exists yet. Given an occurrence row
`{targets: [42], created_at: "2026-03-01 10:00:00", action: "chat:proactive_discussion"}` for a
`bill_risk` interaction, a future phase could compare `fin_bill_occurrence.paid_at` (or a fresh
`fin_allocation` row's `created_at`, for `goal_trend`) against this timestamp to answer "did the
bill get paid (or the goal get funded) *after* this discussion" — exactly the "state at
discussion vs. current state" comparison Phase AA's audit found was already fully supported by
existing finance/temporal primitives, once the entity + timeframe anchor (this phase's own
contribution) exists to check against. **This comparison is explicitly out of scope for Phase AB
and was not built.**

## 17. Smallest recommended next step, if justified

**None recommended at this time.** The primitive is minimal, tested, and closes exactly the gap
Phase AA identified — no further generalization, no state-change detection, no follow-up
messaging is justified until a concrete future need for the §16 comparison actually arises.
Building it speculatively now would be exactly the "solving future architecture problems
preemptively" the mission explicitly ruled out.

## Final verdict: KEEP

One additive `agent_logs` action, reusing 100% of the existing table, the existing
`domain:subaction` naming convention, and the existing Phase Y/Z validation function — zero
changes to `chat/graphrag.ts`, `ChatResponse`, the `{source, targetId}` contract, or any
existing dedup/firing behavior. 1039+343 tests green; full gate clean.
