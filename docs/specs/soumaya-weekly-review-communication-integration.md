# Phase V — Weekly Review LLM Communication Integration

> Continuation of Phase S/T/U (`docs/specs/soumaya-shared-communication.md`,
> `soumaya-proactive-communication-migration.md`, `-wave2.md`). Baseline commit: `c437a52`.
> Status: **audit complete; CommunicationContext integrated into the existing weekly_review
> LLM call; zero new LLM calls; tested; gated green.**

## 1. What this phase is

Phase U identified `weekly_review`'s LLM path as the one remaining tool-router gap and
explicitly deferred it, since it's a materially different kind of surface than the seven
deterministic-template consumers already migrated: its "communication" step is **already an LLM
call** (`generateDailyLog`), not a hand-written template. This phase's job was to determine
whether that existing call can receive the same CommunicationContext every other consumer now
uses, with the smallest possible change — not to redesign weekly_review, replace its LLM, or add
a second one.

## 2. Audit — the complete weekly_review pipeline

**Trigger**: the tool-router tick calls `weeklyReviewTool.detect()`, rate-limited to once per
rolling 7 days (`agent_logs` lookback), requiring ≥3 memories logged in the past week
(`MIN_MEMORIES`).

**Data gathering**: `weekMemories(tc)` — a single raw SQL query over `nodes` (label, content,
`emotional_weight`, `importance`, `created_at`), filtered client-side to the last 7 days.

**Intelligence already computed, deterministically, before any LLM call**:
- `moodPhrase()` — the week's mean emotional charge + spread, bucketed into one of 4 fixed
  descriptions (bright / heavy / mixed / steady).
- The `highlight` memory — the single most important (`importance` DESC) memory of the week.
- Both feed `heuristicDigest()`, the **guaranteed, always-available offline fallback** — a
  single deterministic sentence, unchanged by this phase.
- Separately, `forVoice` — the week's top-12-by-importance memories (`{label, content}` only) —
  is what's actually handed to the LLM when one is available.

**LLM input, before this phase**: `generateDailyLog(forVoice, actions, undefined)` where
`actions` was a 1–2 item array of free-text instructions (a fixed "weekly reflection..." string,
plus an optional grounded-insight instruction). **No `persona`, no `soul`, and no
CommunicationContext of any kind reached this call.**

**LLM role, classified**: the LLM receives the week's own **raw source memories** (not a
lossy pre-digested summary) and is asked to write "the Captain's Log... 2-3 concise, flavorful
sentences." This is a synthesis/communication task over primary source data — the LLM does not
decide what's important (already sorted by `importance`), does not compute mood, does not detect
trends. **Classification: primarily communication/synthesis of already-selected intelligence**,
not independent reasoning or hypothesis generation. `moodPhrase()`/`highlight` are correctly used
only by the deterministic fallback and are NOT duplicated as additional LLM input — the LLM
already derives its own impression of the week directly from the same source memories those
functions summarize, so passing both would be redundant, not more informative (see §15, "no
prompt bloat").

**Delivery, unchanged**: `tc.notify()` (Telegram) + `agent_logs.description`/`message` (in-app
Night Replay/activity log) — identical to every other tool-router surface.

**Existing communication context, before this phase**: **none.** Confirmed by reading
`generateDailyLog`'s 3 implementations (OpenAI, Gemini, heuristic): the function signature already
had an optional `persona` parameter — used correctly by the sibling `daily_log` maintenance job
(`[personaBase, behavior].join("\n\n")`) — but `weeklyReviewTool.run()` never passed it. **`soul.md`
was entirely absent from this LLM path** — unlike Chat's `composeSystem()`, which explicitly
injects it, there was no equivalent injection point for `generateDailyLog` at all before this
phase. This is the single clearest confirmed gap the mission's core product intent (§2 of the
mission) names directly: *"the user should not experience Chat Soumaya and, separately, Weekly
Review Robot."*

## 3. Architecture — Intelligence → CommunicationContext → Existing LLM → Existing Delivery

```
Weekly Intelligence (UNCHANGED)
  weekMemories() → moodPhrase()/highlight → heuristicDigest() [fallback]
  weekMemories() → top-12-by-importance → forVoice [LLM input]
        ↓
CommunicationContext (UNCHANGED module — buildCommunicationContext(handle, spaceId, opts))
  soul, behaviorGuidance, preferences, emotionalPatterns (opt-in)
        ↓
Existing LLM call (SAME generateDailyLog, now with 2 more args)
  generateDailyLog(forVoice, actions, persona, soul)
        ↓
Existing Delivery (UNCHANGED)
  tc.notify() + agent_logs
```

**What remains outside CommunicationContext, and why**: the week's actual memory content
(`forVoice`), `moodPhrase()`, `highlight`, memory count, and the grounded-insight toggle all stay
in `weeklyReview.ts` and `identity.ts` exactly where they were — these are weekly-review-specific
intelligence/facts, not reusable communication-strategy state. `CommunicationContext` gained zero
new fields and zero new logic in this phase; it was read, not extended.

## 4. Implementation — exact files and functions

- **`llm/adapter.ts`**: `LlmProvider.generateDailyLog` gains one new optional 4th parameter,
  `soul?: string`, documented as distinct from `persona` (identity vs. "about the user").
- **`llm/prompts.ts`**: new `composeLogSystem(opts?: {persona?, soul?})` — extracted from the
  identical one-line ternary that was previously duplicated verbatim in both `openai.ts` and
  `gemini.ts`. Mirrors `composeSystem()`'s exact "YOUR DEEPER CHARACTER" wording so Soumaya's
  identity reads the same way in both places — not a second Soul, not new phrasing.
- **`llm/openai.ts`**, **`llm/gemini.ts`**: `generateDailyLog` now calls `composeLogSystem({
  persona, soul })` instead of the inline ternary — a simplification (removes duplicated string-
  building logic) as much as an extension.
- **`llm/heuristic.ts`**: added the unused `_soul?: string` parameter (heuristic ignores both
  `persona` and `soul` — fully deterministic, exactly as before).
- **`llm/resilient.ts`**: `ResilientLlmProvider.generateDailyLog` threads `soul` through to both
  `primary` and `fallback` exactly as it already did for `persona`.
- **`agent/tools/weeklyReview.ts`**: inside the EXISTING `try { ... } catch { /* keep heuristic
  */ }` block (unchanged boundary — see §8), after building `forVoice`/`actions`:
  - `buildCommunicationContext(tc.ctx.handle, tc.spaceId, { includeFullSpaceEmotionalTrajectory:
    true })` — one call, same shape `dailyDigest`/`bill_risk` already use for background/
    non-chat-hot-path callers.
  - `leadGently` (same 3-pattern-type check every other pilot uses) pushes ONE plain-language
    instruction onto the already-existing `actions` array (the exact channel this tool already
    used for the grounded-insight instruction) — never names the pattern.
  - `persona` = `behaviorGuidance` + a rendered preferences line (only when preferences exist),
    joined — same shape `daily_log`'s own precedent already uses.
  - `generateDailyLog(forVoice, actions, persona || undefined, comm.soul)` — the SAME call,
    two more arguments.

## 5. LLM calls

**Before: 1** (the conditional `generateDailyLog` call, gated on `tc.ctx.llm.available`).
**After: 1.** Zero new calls. No pre-LLM personality call, no emotional-LLM call, no
communication-planner call, no critic/rewrite pass — exactly the mission's default expectation.

## 6. Communication — demonstrated

- **Identity**: `soul` now reaches `generateDailyLog` (test #1) — previously always `undefined`.
- **User preference adaptation**: a learned "concise" verbosity preference reaches `persona`
  (test #2); absent evidence produces a `persona` with no preference clause (test #3) — the
  existing evidence-gating in `interactionPreferences.ts` is untouched and authoritative.
- **Emotional context**: a real, multi-week recurring pattern (via the unchanged
  `analysis/emotional.ts` trajectory detector) adds a gentle-tone instruction without ever
  naming the pattern (test #4); its absence adds nothing (test #5).
- **Repetition**: deliberately NOT added (see §2/§4's reasoning) — verified this doesn't need
  fixing by the fact that `forVoice`'s underlying content changes every week by construction, and
  free-form LLM generation already varies wording, so there's no evidenced repetition risk this
  tool needs a signal to solve, unlike the deterministic-template tools Phase U migrated.
- **Natural communication**: the LLM continues to synthesize a narrative from the week's actual
  memories (unchanged); it now additionally knows Soumaya's own voice and this user's
  communication style while doing so.

## 7. Intelligence — demonstrated

- **Facts preserved**: `forVoice` (the actual week's memories) is unaffected by any
  communication-context evidence — verified directly (test #6): the same 4 memories reach the
  LLM call regardless of soul/preference state.
- **Magnitude preserved**: `moodPhrase()`/`highlight`/`heuristicDigest()` — all completely
  unchanged; the fallback path is byte-for-byte identical to before this phase.
- **Uncertainty preserved**: nothing in this phase touches how confidence/provenance is
  represented anywhere in the pipeline — there was none in this specific LLM call to begin with
  (no confidence/provenance fields existed in `forVoice` or `actions` before or after).
- **No duplicate reasoning**: `detect()`'s rate-limit/minimum-memories logic is byte-for-byte
  unchanged (test #11).
- **No intelligence moved into CommunicationContext**: verified by inspection — zero lines
  changed in `communication/context.ts` itself (the fourth phase in a row to confirm this).

## 8. Fallback behavior

The new `buildCommunicationContext` call sits **inside the exact same pre-existing
`try {...} catch { /* keep the heuristic digest */ }` block** that already wrapped the LLM call —
not a new try/catch, not new error-handling logic. A failure at either step (context-building or
the LLM call itself) falls through to the identical, unmodified `heuristicDigest()` fallback,
verified directly (test #8: the LLM call throwing after a successfully-built context still
returns the heuristic digest, `res.ok === true`). The offline path (`tc.ctx.llm.available ===
false`) never touches `buildCommunicationContext` at all — confirmed by a spy assertion (test #10)
— so a space with no cloud key pays zero additional cost from this phase.

## 9. Epistemic safety / prompt injection

- The authority hierarchy is preserved structurally, not just by convention: `composeLogSystem`
  places `soul` (system/architecture identity) before `persona` (communication guidance), and
  both are always injected as SYSTEM-prompt content — `buildLogPrompt`'s USER-turn content (the
  week's actual memory labels/content) is completely unchanged and remains structurally separate
  from the system instructions, exactly as it was before this phase. User-authored memory content
  entering the prompt was already treated as data inside a clearly-delimited "NEW MEMORIES TODAY"
  block before this phase; nothing about that boundary changed.
- No new vulnerability was introduced: the two new prompt inputs (`soul`, the preferences line in
  `persona`) are both server-controlled — `soul` comes from `soul.md`/`space_meta.soul` (an
  operator/owner-controlled setting), and the preferences line is a rendering of
  `{signal, value}` pairs that themselves went through `interactionPreferences.ts`'s own
  evidence-gating — not raw, unvalidated user free text newly added to the system prompt.

## 10. Security / space isolation

`buildCommunicationContext`'s existing, unmodified space-scoping is reused verbatim. Verified
directly (test #9): a soul override and a learned preference set in `"other-space"` never reach
an `"s1"` weekly review's `soul`/`persona` arguments.

## 11. Performance

- **Additional DB reads**: the same ~4 cheap deterministic reads every other consumer already
  pays (soul, behavior, preferences, emotional trajectory) — gated behind `detect()`'s existing
  once-per-7-days cap, so the amortized cost is negligible even including the full-space
  emotional trajectory scan.
- **Prompt-size impact**: `persona` adds at most 2 short lines (behavior guidance + one
  preferences line); `soul` adds Soumaya's already-fixed-length identity text (the SAME text
  Chat already sends on every turn — no new size category). No memories, no additional records,
  no redundant emotional history beyond the single boolean-gated instruction line.
- **Latency/cost**: unaffected — same single LLM call, marginally larger system prompt (well
  within normal variance for this call).

## 12. Testing

- `composeLogSystem.test.ts` (5 tests): bare `LOG_SYSTEM` with no options; soul under its own
  heading, never under "ABOUT THE USER"; persona wording unchanged from pre-Phase-V; both
  together in the correct order; empty strings never produce empty sections.
- `weeklyReviewCommunicationPilot.test.ts` (11 tests): identity reaches `soul`; preferences reach
  `persona`; neutral user produces no preference clause; a real recurring emotional pattern adds
  a gentle-tone instruction without naming it; its absence adds nothing; intelligence (`forVoice`)
  is unaffected by communication context; exactly one LLM call regardless of context richness;
  LLM failure falls back to the heuristic digest safely; space isolation; the offline path never
  touches CommunicationContext or the LLM; `detect()` is completely unaffected.
- Full gate: typecheck clean; **959 server tests** (943 baseline + 16 new) + **343 web tests**
  (unchanged), all passing; web build succeeds.

## 13. Reality test

| Scenario | Result |
|---|---|
| A — Neutral user | `persona` carries no preference clause; `soul` still present (test #3) |
| B — Concise/direct preference | `persona` contains `verbosity=concise` (test #2) |
| C — Explanatory preference | Same mechanism as B, opposite value — not separately re-tested (identical code path, already covered structurally) |
| D — Relevant emotional context | Gentle-tone instruction added, pattern never named (test #4) |
| E — Repeated issue | Not applicable by design (see §6) — the underlying week's content differs every firing, and free-form generation already varies wording |
| F — Uncertain information | Not applicable — this call has no confidence/provenance fields to begin with, before or after |
| G — Different weekly intelligence, same comm context | `forVoice` reflects exactly the seeded memories regardless of soul/preference state (test #6) — content changes because intelligence changed |
| H — Same intelligence, different comm context | The MOST important test: tests #1–#5 all seed either the identical or a comparably-shaped week and vary only soul/preferences/emotional evidence, producing different `persona`/`soul`/`actions` while `forVoice` stays governed by the same importance-sort — proving communication style varies independently of the underlying facts |

## 14. What was explicitly NOT done

No rewrite of `weekly_review`, no replacement or second LLM, no communication-planner/critic
call, no new persona/personality/preference/emotional system, no duplicate GraphRAG, no weekly
intelligence moved into `CommunicationContext`, no indiscriminate context dump, no notification/
messenger/proactive-event-contract work, no changes to Chat, no maintenance/insight-generator
migration, no WealthPanel/Journey delivery work — all exactly as instructed.

## 15. Remaining gaps

- Maintenance job descriptions, contradiction/synthesis insight text — audited in Phase U, not
  touched here either; both remain real, separate future candidates using the exact same
  `soul`/`composeLogSystem`-style pattern this phase just proved out, should a future phase choose
  to migrate them.
- WealthPanel/Journey proactive delivery, the `agent_logs`→toast navigation contract, and the full
  proactive → Chat event architecture — untouched, exactly as instructed. Nothing in this phase
  makes any of them harder to build later.
- A future proactive-event contract for weekly_review specifically (`"Soumaya wants to talk to
  you about your week"`) would need, at minimum, the week's date range and the `forVoice` node
  ids preserved alongside the digest — currently `ToolResult.message` carries only the final
  prose, not these ids. Not built here (no pilot in this phase required it), but flagged as the
  smallest concrete addition a future proactive→Chat phase would need for this specific surface.

## 16. Final verdict: KEEP

The tool-router's one LLM-backed communication surface now receives the same
`CommunicationContext` every deterministic-template consumer already uses, through its existing
single LLM call, with zero new calls, zero changes to the shared module, and a corrected identity
gap (`soul` was previously never sent at all). The fix required touching the shared LLM adapter
layer (5 files) to add one correctly-labeled parameter — a larger footprint than prior phases'
single-tool edits, but justified because stuffing Soumaya's own identity into the existing
"ABOUT THE USER" slot would have risked exactly the kind of identity confusion Phase V's own
mission explicitly warned against. 959+343 tests green; full gate clean.
