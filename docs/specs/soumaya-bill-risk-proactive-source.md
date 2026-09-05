# Phase Z — Bill Risk as Second Proactive → Chat Source

> Extends Phase Y's `{source, targetId}` handoff (docs/specs/soumaya-proactive-chat-handoff.md)
> to `bill_risk`, proving the contract generalizes to a second, independent proactive signal
> without a generic framework. Baseline: Phase Y's commit `6ab6dd3`. Status: **implemented,
> tested, gated green.**

## 1. Audit findings

1. **Bill identity.** `billRiskTool.detect()` picks `atRisk = budget.reserved.filter(r =>
   !autopay.get(r.billId))[0]` (the earliest-due, non-autopay reserved bill) and passes
   `billId` through `args`. `run()` resolves it via `FinBillRepo.get(billId)` (space-scoped).
   `billId` is a real, stable, space-scoped `fin_bill` primary key — the exact same shape as
   Phase X/Y's `goalId`.
2. **Stability/sufficiency.** Sufficient, with one gap: `run()`'s returned `ToolResult` did
   **not** set `targets`, so `agent_logs.targets` was `'[]'` for `tool:bill_risk` — the one
   concrete defect this audit found and fixed (§2).
3. **Risk/severity.** Deterministic, LLM-free, unchanged by this phase: once-per-space-per-day
   gate → `getBudgetSummary()` → only non-autopay reserved bills → "tight" iff
   `shortfallCents > 0` OR `safeToSpendCents <= atRisk.amountCents` → mode `"short"` or
   `"pace"` with a cents `threshold`.
4. **Message construction.** `buildBillRiskMessage()`, a local communication-only function
   branching on `CommunicationContext` — untouched.
5. **`CommunicationContext` usage.** `run()` calls `buildCommunicationContext(handle, spaceId,
   {includeFullSpaceEmotionalTrajectory: true})` — identical precedent to `goal_trend`.
   Untouched.
6. **Delivery.** `tc.notify(msg)` → `router.ts`'s `logAction()` → `agent_logs` → the web's
   `agent_logs` → toast bridge, which already special-cased `tool:bill_risk` for `"high"`
   priority but attached no `action` — same original gap Phase Y closed for `goal_trend`.
7. **`agent_logs.targets`.** Already generic in `router.ts` (`result.targets ?? []`) for any
   tool — `goal_trend` was the only populated one. `bill_risk`'s own dedup (the once-a-day
   `didToday` check, scoped to `action = 'tool:bill_risk'`) is completely independent of
   `targets` and of `goal_trend`'s own `wasGoalRecentlySurfaced()` (which only ever reads
   `action = 'tool:goal_trend'` rows).
8. **`goal_trend` resolution precedent.** Re-validates via space-scoped `FinGoalRepo.get()`,
   then re-derives `goalAllocationChange()` fresh — the pattern this phase mirrors for bills.
9. **`/api/chat` validation.** Was a single `z.literal("goal_trend")` — trivially generalized
   to `z.enum(["goal_trend", "bill_risk"])`.
10. **Genericity of `{source, targetId}`: confirmed clean.** Both sources reduce to "a
    space-scoped integer id on a table with its own `get(id)` repo method." No payload shape
    changed — only the dispatch inside `proactiveContextSnapshotText()` and the route's zod
    enum grew.

No redesign was performed before implementing; the smallest additive changes below follow
directly from the findings above.

## 2. Preserving the existing bill-risk intelligence

`billRisk.ts`'s `detect()`, `getBudgetSummary()` calls, autopay filtering, the "tight"
condition, and `buildBillRiskMessage()` are **byte-for-byte unchanged**. The only edit to
`billRisk.ts` is additive:

```ts
return { ok: true, summary: `bill-risk nudge for "${bill.name}" (${mode})`, delivered, message: msg, targets: [billId] };
```

One new field on the returned `ToolResult`, mirroring Phase X's `goal_trend` convention
exactly. No second bill-risk algorithm, no new SQL beyond what `analysis/proactiveContext.ts`
already needed for the handoff itself (§3).

## 3. Context contract — `billRiskContextText()`

`analysis/proactiveContext.ts`'s `ProactiveContextSource` union grows to `"goal_trend" |
"bill_risk"`. The new branch:

```ts
function billRiskContextText(handle, spaceId, billId, now): string | null {
  const bill = new FinBillRepo(handle, spaceId).get(billId);
  if (!bill || bill.autopay) return null;
  const budget = getBudgetSummary(handle, spaceId, now);
  const reserved = budget.reserved.find((r) => r.billId === billId);
  if (!reserved) return null;
  const tight = budget.shortfallCents > 0 || budget.safeToSpendCents <= reserved.amountCents;
  if (!tight) return null;
  // ... builds a "PROACTIVE CONTEXT" string from budget.shortfallCents / safeToSpendCents,
  // reserved.dueDate, and bill.name — the same fields billRiskTool.detect() itself reads.
}
```

This re-derives the **exact same authoritative read** (`getBudgetSummary`) and the **exact
same "tight" condition** `billRiskTool.detect()` uses — parameterized by one specific bill
instead of "find the earliest at-risk one," the same relationship `goalTrendContextText` has
to `goal_trend`'s own candidate-selection loop. `billRiskTool.detect()` itself is deliberately
**not** called here: its own once-a-day gate would return `[]` on the very day it just fired
(precisely when Chat is most likely to be asked "why?"), which would make the handoff always
report "not at risk" right when it matters. Re-deriving the risk condition directly avoids that
false negative.

The payload itself stays exactly `{source, targetId}` — no bill name, amount, due date, or
severity travels in the request; only in the string Chat's own server-side prompt assembly
computes fresh from the real tables.

## 4. Server revalidation / route change

`api/routes/chat.ts`'s `ChatBody` schema:

```ts
proactiveContext: z.object({ source: z.enum(["goal_trend", "bill_risk"]), targetId: z.number().int().positive() }).optional(),
```

One literal → one enum. `chat()`'s own signature, `chat/graphrag.ts`'s dispatch, and the
best-effort `try/catch` wrapping it are **completely unchanged** — confirmed by an empty
`git diff` on `chat/graphrag.ts` for this phase. `FinBillRepo.get()` is space-scoped by
construction, so a forged or cross-space `billId` resolves to `null` exactly like `goalId` did
in Phase Y (verified directly — test 8).

## 5. Web wiring — the same generalization, one map entry

Three of the four web-side files needed real, if small, generalization (a single hardcoded
`"goal_trend"` case each):

- `api/client.ts`: new exported `ProactiveContextSource`/`ProactiveContext` types (`"goal_trend"
  | "bill_risk"`), used by `askChat()`'s existing optional 3rd parameter. Previously three
  independent literal shapes existed (client.ts, ChatDock.tsx, App.tsx) — now one shared
  web-local type, imported by the other two, since duplicating a 2-value union three times
  was worth closing once a second value existed.
- `App.tsx`: a new `PROACTIVE_TOAST_SOURCE: Record<string, ProactiveContextSource>` map
  (`{"tool:goal_trend": "goal_trend", "tool:bill_risk": "bill_risk"}`) replaces the single
  `if (l.action === "tool:goal_trend")` check in the `agent_logs` → toast bridge — adding a
  third source in the future is exactly one more map entry, not new dispatch code. The
  `onAction` listener's regex grew from `/^goal_trend:(\d+)$/` to
  `/^(goal_trend|bill_risk):(\d+)$/`, capturing the source instead of hardcoding it.
- `ChatDock.tsx`: prop type changed from the Phase Y literal to the shared `ProactiveContext`
  type — no other change; `send()`'s one-shot consume logic is untouched.

## 6. Deduplication

Confirmed independent by construction and by test:

- `bill_risk`'s dedup (`didToday`, action-scoped to `'tool:bill_risk'`) and `goal_trend`'s
  dedup (`wasGoalRecentlySurfaced`, action-scoped to `'tool:goal_trend'`) each only ever read
  their own tool's `agent_logs` rows — there is no shared dedup state to collide.
- Test 6 fires both a real `goal_trend` candidate and a real `bill_risk` candidate in the SAME
  `runToolRouter()` tick and confirms both appear, each logging its own correctly-shaped
  `targets`.
- Test 4 confirms `bill_risk`'s existing once-a-day gate is unaffected by the new `targets`
  field.
- Test 5 confirms a bill's past firing does not permanently block a genuinely different,
  independently-tight bill once a new day begins and the first bill is actually resolved (its
  occurrence marked paid) — the once-a-day gate is a day boundary, not a per-bill lock, and
  that semantics is preserved exactly as it existed before this phase.
- Tests 14–15 re-confirm Phase X's `goal_trend` detection and Phase Y's `goal_trend` → Chat
  handoff are both untouched by this phase's changes.

## 7. Testing

17 tests in `billRiskProactiveChatHandoff.test.ts`, covering all 15 required scenarios (two
of the 15 — #2 and #7 — got two cases each for the short/pace mode split):

1. Detection unchanged (same fixture shape as `billRisk.test.ts`, still fires pace mode).
2. Communication unchanged (message still contains bill name + original opener wording).
3. `run()`'s `targets` is exactly `[billId]`.
4. The once-a-day dedup gate still suppresses a same-day repeat.
5. Bill A's past firing doesn't permanently block Bill B once A is resolved and a new day
   begins.
6. `goal_trend` and `bill_risk` both fire independently in the same router tick.
7. Context text names the correct bill and correct numbers, for both `"short"` and `"pace"`
   modes.
8. A cross-space bill id yields no framing and never leaks the other space's bill name,
   through both `proactiveContextSnapshotText()` directly and a real `chat()` call.
9. A deleted bill and a nonexistent bill id both degrade to no framing / no error.
10. Full chain: real `runToolRouter()` → real `agent_logs.targets` → real `/api/chat` HTTP
    route with `{source:"bill_risk", targetId}` → a real answer.
11. Re-derivation, not payload trust: after the bill fires while genuinely tight, resolving the
    shortfall (raising the balance) before opening Chat makes the SAME `targetId` assert **no**
    framing — proving the text is computed fresh at the moment Chat asks, not carried over from
    when the tool originally fired.
12. Ordinary chat (`proactiveContext` omitted vs. explicit `null`) is unaffected even with real
    tight-budget data present.
13. Zero new `nodes`/`agent_logs` rows from a `chat()` call carrying `proactiveContext`.
14. Phase X's `goal_trend` detection regression check.
15. Phase Y's `goal_trend` → Chat handoff regression check.

**Full gate**: typecheck clean across all 3 workspaces; **1025 server tests** (1008 baseline +
17 new) + **343 web tests** (unchanged), all passing; `npm run build -w @brain/web` succeeds.

## 8. Performance

- `billRiskContextText()` only runs when a client actually sends `{source:"bill_risk", ...}` —
  every ordinary chat turn pays nothing extra, same as `goal_trend`.
- When it runs: one `FinBillRepo.get()` (indexed row read) + one `getBudgetSummary()` call —
  the exact same function `billRiskTool.detect()` already calls once per tool-router tick, at
  the same cost (account read, income dates, bounded bill-occurrence materialization/read).
- No GraphRAG, no LLM call, no full-space scan triggered by the handoff itself.
- Client-side: the new `PROACTIVE_TOAST_SOURCE` map lookup and the two-alternative regex are
  both O(1); no new network request.

## 9. Security

- `targetId` is always re-validated against the request's own space via `FinBillRepo.get()`
  (space-scoped constructor) — a forged or cross-space id resolves to `null`, never an error,
  never another space's data. Verified directly (test 8).
- The route's `source` field is a zod `z.enum(["goal_trend", "bill_risk"])` — any other value
  is rejected at the boundary (400), not silently coerced.
- No new client-supplied data is ever written anywhere; `billRiskContextText()` is read-only.

## 10. Regression

`chat/graphrag.ts` — the locked Chat pipeline Phase Y already extended — has **zero diff** in
this phase (confirmed via `git diff`). `agent/tools/billRisk.ts`'s only change is the additive
`targets` field. `api/routes/chat.ts`'s only change is the zod literal → enum. The full
pre-existing suite (`billRisk.test.ts`, `billRiskCommunicationPilot.test.ts`,
`goalFundingTrendPilot.test.ts`, `proactiveContextHandoff.test.ts`, and everything else) passes
unmodified alongside the 17 new tests — 1025 total server tests, up from 1008.

## 11. Defects discovered

One, found and fixed as part of this phase (§2): `billRiskTool.run()` never set
`ToolResult.targets`, so `agent_logs.targets` was always `'[]'` for `tool:bill_risk` — the
exact gap that made a structured Chat handoff for bill risk impossible before this phase. No
other defects found; `getBudgetSummary`/`FinBillRepo`/`billRiskTool`'s detection logic behaved
exactly as documented throughout the audit and testing.

## 12. Should the architecture stay frozen after Z?

**Yes — the two-source proof is complete; no further generalization is warranted right now.**
`{source, targetId}` handled a second, structurally-different intelligence source (a
budget/cushion computation vs. a two-period allocation comparison) with zero changes to the
payload shape, zero changes to `chat()`'s signature, and zero changes to the Chat pipeline
itself — only the per-source dispatch (one `if` branch) and the zod enum grew. Introducing a
shared cross-package type or a registry-style dispatch table now, with only two sources, would
be exactly the kind of speculative abstraction the mission explicitly ruled out. The current
per-file literal duplication (now one shared web-local type, one server-local type) is small
enough to stay legible.

## 13. Smallest recommended next step

If a third proactive source is ever added, that's the point to revisit whether
`ProactiveContextSource`/`ProactiveContextInput` deserve a real `packages/shared` type (three
independent copies is a more concrete duplication signal than two). Not started here — no
third source exists yet, and building for it now would be solving a problem that doesn't exist.
No other next step is recommended; this phase's job (prove the contract generalizes) is done.

## Final verdict: KEEP

`bill_risk` reuses 100% of its existing detection, communication, and delivery intelligence;
the only new code is one additive `ToolResult` field, one new dispatch branch re-deriving
existing authoritative reads, one zod enum widening, and a handful of mechanical web-side
generalizations from a single hardcoded case to a two-entry map. 1025+343 tests green; full
gate clean; zero diff on the locked Chat pipeline.
