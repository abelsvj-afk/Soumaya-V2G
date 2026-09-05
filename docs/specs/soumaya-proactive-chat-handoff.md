# Phase Y — Proactive → Chat Context Handoff

> Connects Phase X's goal-allocation proactive pilot (`docs/specs/soumaya-goal-trend-proactive-pilot.md`)
> to the existing Chat/GraphRAG architecture with the smallest structured handoff. Baseline: Phase X's
> commit `9426265`. Status: **implemented, tested, gated green.**

## A. Audit findings — exactly where proactive context enters Chat

Traced both paths in full before writing any code:

**Phase X's proactive path**: `agent/tools/goalFundingTrend.ts`'s `detect()` calls the existing
`goalAllocationChange()` (`analysis/temporalChange.ts`) twice per active goal (current + prior
30-day window) → the two-consecutive-period evidence gate → `wasGoalRecentlySurfaced()` reads
`agent_logs` for dedup → `run()` builds a deterministic message via `buildCommunicationContext()`
→ `tc.notify(msg)` → `router.ts`'s `logAction()` writes `agent_logs.description` (the message) and
`agent_logs.targets = JSON.stringify([goalId])` → the web's existing `agent_logs` → toast bridge
(`App.tsx`) surfaces any `tool:*` action as a toast via `pushToast()`. Before this phase, the toast's
`action` argument was always omitted for `tool:*` entries — a tap only ever called `setShowChat(true)`
with zero context.

**Existing Chat path**: `chat/graphrag.ts`'s `chat()` already has one exact precedent for "an optional,
additive, server-validated scope parameter appended last" — `journeyId: number | null = null`
(Phase Q), which JourneysRepo re-validates as space-scoped before contributing any candidates, and
which contributes silently to `systemExtra` via a best-effort `try/catch`, exactly like every other
snapshot (`financialSnapshotText`, `peopleSnapshotText`, `cognitiveSnapshotText`,
`temporalSnapshotText`, `intelligenceSnapshotText`, `emotionalSnapshotText`,
`interactionPreferenceSnapshotText`, clarification resolution).

**Smallest point of entry, decided**: mirror `journeyId` exactly — one more optional, last-positioned,
server-revalidated parameter on `chat()`, feeding one more best-effort `systemExtra` snapshot. No new
retrieval system, no second GraphRAG, no new personality layer.

## B. Context contract — exactly what's carried, and why

```ts
// packages/server/src/analysis/proactiveContext.ts
export type ProactiveContextSource = "goal_trend";
export interface ProactiveContextInput { source: ProactiveContextSource; targetId: number; }
```

Just an identifier pair — `source` (which proactive signal fired) and `targetId` (the goal's real,
space-scoped id). No copy of the goal's name, amount, direction, or magnitude travels in the payload
itself; Chat re-derives all of that from the real tables via `proactiveContextSnapshotText()`, which:

1. Looks up the goal via `FinGoalRepo.get(targetId)` (space-scoped — a cross-space or deleted id
   simply resolves to `null`).
2. Re-calls `goalAllocationChange()` — **the exact same function Phase X's `detect()` already uses**,
   fresh, at the moment Chat asks — not a cached copy of Phase X's earlier computation, and not a
   second algorithm. This mirrors an established precedent already in this codebase:
   `analysis/causal.ts`'s `possibleDownstreamEffects()` already re-derives
   `incomeChange`/`netWorthChange`/`goalAllocationChange` fresh on every chat turn.
3. Returns `null` (no framing at all) unless the comparison is still `"compared"` with a real
   direction — never asserts a claim the evidence doesn't currently support.

On a hit, it returns one labeled string block, appended to `systemExtra`:

> `PROACTIVE CONTEXT (why this conversation was initiated): You reached out to the user first this
> conversation because "{goal name}"'s funding allocation {direction} by about {amount} across two
> consecutive periods — a real, sustained change, not a one-off. This is why you're speaking with them
> right now. Explain naturally in your own words if they ask; don't force the topic if they've clearly
> come to talk about something else.`

This is prompt guidance, never a fact injected into the conversation transcript — see F/D below.

## C. Existing-system reuse

| System | Reused as-is |
|---|---|
| `goalAllocationChange()` | Called fresh, unchanged — the sole source of the direction/magnitude claim. |
| `FinGoalRepo` | Space-scoped lookup — the sole source of goal identity/space isolation. |
| `chat()`'s `systemExtra` assembly + best-effort `try/catch` pattern | Reused verbatim for the new snapshot — same failure contract as every other snapshot. |
| GraphRAG retrieval, financial/cognitive/people/temporal/intelligence/emotional snapshots, interaction preferences, clarification resolution | Completely untouched — Chat answers the same way regardless of how it was opened. |
| `ToastAction` (`kind: "chat", value?`) | Reused, not replaced — `value` (previously ignored for `"chat"`) now optionally carries `"goal_trend:<id>"`. |
| `agent_logs.targets` (Phase X) | Read by the web layer to build the toast's `value` — no new column, no new table. |
| `AppContext`/`spaceOf(res)` request-scoping | Same authorization boundary as every other route — `targetId` is re-validated server-side, never trusted from the client. |

## D. Implementation — every changed file

| File | Change |
|---|---|
| `analysis/proactiveContext.ts` (new) | `proactiveContextSnapshotText()` + `goalTrendContextText()` — the re-derivation + labeled string described in B. |
| `chat/graphrag.ts` | New last parameter `proactiveContext: ProactiveContextInput \| null = null`; one new best-effort `try/catch` block appending its snapshot to `systemExtra`, placed after the existing clarification-resolution block. |
| `api/routes/chat.ts` | `ChatBody` zod schema gains `proactiveContext: z.object({ source: z.literal("goal_trend"), targetId: z.number().int().positive() }).optional()`; threaded to `chat()` as `parsed.data.proactiveContext ?? null`. |
| `web/api/client.ts` | `askChat(question, history, proactiveContext?)` — new optional 3rd param, included in the POST body only when set. |
| `web/components/ChatDock.tsx` | New optional props `proactiveContext` / `onConsumeProactiveContext`; `send()` captures the pending context into a local `const` at send-time, passes it to `askChat`, and calls `onConsumeProactiveContext()` — a one-shot, consumed by exactly the next message actually sent. |
| `web/App.tsx` | New state `pendingProactiveContext`; the `agent_logs` → toast bridge attaches `{kind:"chat", value:"goal_trend:<id>"}` specifically for `tool:goal_trend` log rows (every other `tool:*` toast unaffected); the `brain-toast-action` listener's `"chat"` branch parses that value with `/^goal_trend:(\d+)$/` and sets the pending context; `<ChatDock>` receives `proactiveContext={pendingProactiveContext}` and clears it via `onConsumeProactiveContext`. |
| `web/components/ChatDock.smoke.test.tsx` | Updated one pre-existing assertion (`toHaveBeenCalledWith`) for `askChat`'s new 3rd positional argument — no behavior change, just matching the new (always-present, often-`undefined`) call shape. |
| `__tests__/proactiveContextHandoff.test.ts` (new) | The 15 required scenarios (see G). |

**No shared type added.** Considered adding `ProactiveChatContext` to `packages/shared/src/intelligence.ts`
(near `NavigationIntent`) so the server's local type and the web's literal object shape couldn't drift —
decided against it: the existing `journeyId` precedent this phase mirrors has no shared type either
(it's a plain `number` on both sides), and a 2-field `{source, targetId}` shape is small enough that a
new cross-package export would add import surface without closing a real risk. `chat.ts`'s zod schema,
`analysis/proactiveContext.ts`'s `ProactiveContextInput`, and `ChatDock`'s prop type are three
independent, structurally-identical literals — acceptable at this size, revisit if a second proactive
source is ever added.

**No LLM call added.** `proactiveContextSnapshotText()` is pure SQL + arithmetic (via
`goalAllocationChange()`), same as Phase X's own tool.

## E. Deduplication — how this relates to `agent_logs`

Chat's proactive-context path is **read-only**: `proactiveContextSnapshotText()` never writes to
`agent_logs`, `nodes`, or any other table, so it cannot itself reset or interfere with Phase X's
`wasGoalRecentlySurfaced()` cooldown (which keys on `agent_logs` rows with `action = 'tool:goal_trend'`
in the last 30 days). Confirmed directly (test scenarios 10–11): after the tool fires once (writing
the real dedup row) and the user opens Chat from that toast, the same goal remains deduplicated on the
next `detect()` call, and a different goal's own independent signal fires normally, unaffected by the
first goal's Chat interaction.

This is the "already discussed" **foundation**, not the full system Part 15 of the mission describes:
today, "already discussed" is inferred entirely from Phase X's own tool-level cooldown — there is no
new table tracking "this specific proactive event led to a Chat conversation." Building that (e.g. to
avoid re-surfacing a topic the user already discussed in Chat, independent of the tool's own 30-day
window) is explicitly deferred — see J.

## F. User path — complete, step by step

1. `goalFundingTrendTool.detect()` (Phase X, unchanged) finds a goal whose allocation changed
   meaningfully across two consecutive periods.
2. The two-period evidence gate (Phase X, unchanged) confirms eligibility.
3. `wasGoalRecentlySurfaced()` (Phase X, unchanged) confirms this goal wasn't already surfaced
   recently.
4. `buildCommunicationContext()` (existing) shapes the deterministic message.
5. The existing `agent_logs` → toast bridge surfaces it — now with `action: {kind:"chat",
   value:"goal_trend:<goalId>"}` attached (new this phase, `tool:goal_trend` only).
6. The user taps the toast.
7. App.tsx's existing `brain-toast-action` listener opens Chat (`setShowChat(true)`, unchanged) and
   additionally parses the goal id into `pendingProactiveContext` (new).
8. `ChatDock` receives `proactiveContext` as a prop. The user types and sends their first message
   (their own real words — nothing is pre-filled or auto-sent).
9. `send()` attaches the pending context to that one `askChat()` call, then immediately clears it via
   `onConsumeProactiveContext` — one-shot, never replayed on a later message in the same session.
10. The server's `chat()` re-validates the goal (space-scoped), re-derives the real evidence via
    `goalAllocationChange()`, and folds a short "why we're talking" note into `systemExtra` alongside
    every other existing snapshot (financial, temporal, emotional, etc.) — GraphRAG, retrieval, and the
    LLM answer call all proceed completely normally, using the SAME code path as any other turn.
11. Soumaya answers using the real, authoritative goal data (retrieved via the existing snapshots, not
    duplicated in the handoff) — in the same voice, personality, and communication architecture as any
    other conversation.

## G. Tests — targeted + complete suite results

`__tests__/proactiveContextHandoff.test.ts`, all 15 required scenarios, all driving the real `chat()`
entry point (scenario 15 drives the actual `/api/chat` HTTP route + `runToolRouter()`):

1–3. Context creation: correct goal identity, correctly labeled, correct direction/magnitude.
4. Evidence preservation: an "unchanged" comparison yields no framing at all; the framing always
   matches what Phase X's own `detect()` independently found for the same data.
5–6. Toast → Chat: `chat()` accepts the exact shape the web layer builds and answers normally.
7. GraphRAG reuse: a `chat()` call with `proactiveContext` writes zero new financial rows — nothing
   is duplicated.
8. No fake user message: the injected framing never appears in the returned `ChatResponse` shape a
   client would persist as conversation history.
9. No permanent-memory pollution: zero new `nodes` or `agent_logs` rows from a `chat()` call carrying
   `proactiveContext`.
10–11. Dedup survives the handoff; a different goal's own signal is never suppressed by another
   goal's Chat interaction.
12. Missing context: omitting `proactiveContext` behaves identically to passing `null` explicitly.
13. Invalid/stale goal: a nonexistent or since-deleted goal id degrades to no framing, turn still
   succeeds.
14. Space isolation: another space's goal id contributes zero framing and never leaks that space's
   goal name into the response.
15. Full chain: real `runToolRouter()` fires the pilot and writes the real `agent_logs` row → the real
   `/api/chat` HTTP route (not a mocked helper) accepts the structured context and answers → dedup is
   re-confirmed immediately after via the real router.

**Full gate**: typecheck clean across all 3 workspaces; **1008 server tests** (993 baseline + 15 new)
+ **343 web tests** (one pre-existing assertion updated for the new call shape, zero behavior change),
all passing; `npm run build -w @brain/web` succeeds.

## H. Performance

- `proactiveContextSnapshotText()` only runs when a client actually sends a `proactiveContext` — every
  ordinary chat turn (the overwhelming majority) pays nothing extra.
- When it does run: one `FinGoalRepo.get()` (single indexed row read) + one `goalAllocationChange()`
  call (one bounded `fin_allocation` read, capped at 500 rows — an existing, already-cheap function,
  the same one Phase X's own tool calls twice per tick).
- No GraphRAG, no LLM call, no full-space scan is triggered by the handoff itself — GraphRAG's
  existing per-turn retrieval and the LLM answer call are the SAME ones every chat turn already pays
  for, unchanged.
- Client-side: parsing `"goal_trend:<id>"` out of a toast's `value` is a single regex test, and the
  toast-bridge lookup only runs for `tool:goal_trend` rows specifically (a `JSON.parse` on an already-
  fetched `agent_logs` row already in memory) — no new network request.

## I. Security

- `targetId` is never trusted as-is: `FinGoalRepo.get()` is constructed with the REQUEST's own
  `spaceId` (via `spaceOf(res)`, the same middleware every other route uses) — a forged or cross-space
  goal id simply resolves to `null` server-side, exactly like Phase Q's `journeyId` precedent. Verified
  directly (test 14): another space's real goal id, sent as `proactiveContext.targetId`, produces zero
  framing and the response never contains that other space's goal name.
- The `source` field is a zod `z.literal("goal_trend")` — any other value is rejected at the route
  boundary (400), not silently coerced.
- No new client-supplied data is ever written anywhere; the entire proactive-context path is read-only
  on the server.

## J. Deferred work — explicitly NOT built

- No shared `ProactiveChatContext` type in `packages/shared` (see D) — revisit if a second proactive
  source is added and the duplication becomes a real risk.
- No new "already discussed in Chat" tracking beyond Phase X's own tool-level 30-day cooldown (E) —
  today, opening Chat from a toast doesn't record that fact anywhere beyond what Phase X already logs.
- No new proactive signal sources — only `goal_trend` (Phase X's own pilot) is wired; bill risk, weekly
  review, reminders, orphan, review nudges, finance freshness, emotional patterns, Journey staleness,
  and Wealth state are all untouched, per the mission's explicit scope limit.
- `computeRelevance()` remains unwired — not required for this single-signal handoff.
- The daily/weekly communication-surface collision (flagged in Phase W) is untouched — out of scope.
- No system/context message injected into the visible conversation transcript — the framing lives
  purely in the server-side prompt assembly (`systemExtra`), never in `history` or any persisted
  message list.
- No hot-swapping of Chat's personality/behavior rules for a "proactive mode" — same `soul.md`,
  `ANSWER_SYSTEM`, behavior derivation, and interaction-preference logic as any other turn.

## K. Next recommendation

The smallest next architectural step, if this pattern proves useful, is extending the SAME shape
(`{source, targetId}`) to a second proactive source — the natural next candidate is `bill_risk`
(already migrated onto `CommunicationContext` in Phase T/U, already has a stable target entity, a
recurring bill). That would be the first real test of whether `ProactiveContextInput`'s `source`
union genuinely needs a shared type (D) or whether the current per-file literal remains adequate at
two sources. Not started here, per the mission's explicit "no new proactive triggers in Phase Y"
scope limit.

## Final verdict: KEEP

One additive, last-positioned, server-revalidated parameter — mirroring the exact precedent Phase Q
already established for `journeyId` — closes the "user has to explain why Soumaya reached out" gap
Phase X's own final report flagged, without creating a second Chat, a second GraphRAG, a second memory
system, or any new LLM call. 1008+343 tests green; full gate clean.
