# Experiment — Explicit Journey-Scoped Retrieval Candidate Injection

> Per `WORKFLOW.md`'s spec-before-code rule and this phase's own explicit instruction: measure
> first, decide second. Baseline: commit `e5df1bb` on `claude/soumaya-second-brain-v1-m4z4hc`
> (Phase P's Class B audit, `docs/specs/journey-aware-retrieval-audit.md`). Status: **experiment
> run, decision made — KEEP** (see §15).

## 1. Hypothesis

Phase P measured (not assumed) that current GraphRAG retrieval recalls a Journey's own
`journey_link`-linked memories only when they happen to share literal vocabulary or hash-embedding
similarity with the question — never because of Journey membership itself, since `journey_link`
never produces an `edges` row and is never consulted by the seed→hop→context pipeline. This
experiment's hypothesis: **if the user (or a future UI) explicitly identifies which Journey a
conversation is about, injecting a small, bounded set of that Journey's own linked memories as
additional retrieval candidates will materially close the specific gaps Phase P measured — without
degrading ordinary (non-Journey-scoped) chat, without cross-Journey contamination, and without
meaningful additional cost.**

Explicitly ruled out per the phase's own critical design principle: Soumaya must never GUESS which
Journey a free-text question is about (Phase P's §4/§9 measured that guessing lands on the wrong
Journey by chance) — this experiment only tests EXPLICIT, caller-supplied Journey context.

## 2. Baseline

Phase P's measured numbers (same dataset shape, same offline `HashEmbeddingProvider`/
`HeuristicProvider` combination — see the caveat in §6 below):
- Direct Journey question: 1 of 3 linked memories recalled.
- A same-Journey item with different wording: not retrieved at all.
- A domain-free "my journey" question: landed on the wrong Journey by chance.
- A trivial bounded union with `JourneysRepo.links()` would have recovered 3 of 4 missed memories.
- Zero cross-Journey contamination observed; a favorably-worded longitudinal query recalled all 3
  chronological stages.

## 3. Experimental Design

Target architecture (implemented exactly as scoped, nothing more):

```
User explicitly selects Journey (out of scope for this pass — no UI built; the CONTRACT is
what's tested, per the phase's own explicit permission — see §16)
        ↓
chat request carries an explicit journeyId (POST /api/chat body field, or the journeyId
parameter on chat() directly, as every new test in this experiment calls it)
        ↓
chat() validates the Journey belongs to the current space (JourneysRepo.get is already
space-scoped — returns null for a wrong-space or nonexistent id)
        ↓
existing retrieval (vector KNN + BM25 + RRF + 1-hop graph expansion) runs COMPLETELY UNCHANGED
        ↓
IF the Journey is valid: JourneysRepo.links(journeyId), filtered to kind==="node", capped at 8,
most-recently-linked first (the repo's own existing ORDER BY created_at DESC)
        ↓
merged into the SAME `ids` Set the seed/hop candidates already populate (dedup is free — Set
semantics, not a new mechanism)
        ↓
existing, completely unmodified context-assembly + LLM-citation path
        ↓
Soumaya response (no new prose template, no forced "because you selected this Journey" framing)
```

## 4. Explicit Journey Context Contract

`packages/server/src/chat/graphrag.ts`'s `chat()` gained one new, trailing, optional parameter:

```ts
export async function chat(
  h: DbHandle,
  deps: { embeddings: EmbeddingProvider; llm: LlmProvider },
  question: string,
  opts: ChatOptions = DEFAULT_CHAT,
  spaceId: string = DEFAULT_SPACE,
  history: { role: "you" | "soumaya"; text: string }[] = [],
  journeyId: number | null = null,   // NEW — see chat/graphrag.ts's own doc comment
): Promise<ChatResponse>
```

Appended at the END of the parameter list (not inserted in the middle) specifically so every
existing positional call site — `packages/server/src/api/routes/chat.ts` and
`packages/server/src/telegram/bot.ts` — needed zero changes to keep compiling and behaving
identically; `telegram/bot.ts` was not touched at all. `packages/server/src/api/routes/chat.ts`'s
`ChatBody` zod schema gained one optional field, `journeyId: z.number().int().positive().optional()`,
and passes it straight through as `parsed.data.journeyId ?? null`.

**No global conversation-level Journey state was introduced** — per the mission's own explicit
preference, this is a per-turn, explicit, opt-in parameter. A caller (a future UI) that wants
Journey-scoping to persist across a multi-turn conversation would need to keep re-supplying the
same `journeyId` on each turn — that's a deliberate design choice, not an oversight: it means
Journey-scoping is never "sticky" by accident.

**No web/UI wiring was built in this pass** — per the mission's own explicit permission (§18: "Do
not require Galaxy integration if the chat context contract can be tested independently... The
experiment should first prove retrieval value"). The contract is proven directly against the real
`chat()` function, exactly the same methodology Phase P's audit used. See §16 for what a follow-up
UI-wiring pass would need.

## 5. Candidate Injection Design

Implemented in `packages/server/src/chat/graphrag.ts`, immediately after the existing seed→hop
`ids` `Set` is built and before `NodesRepo.byIds([...ids])` is called:

```ts
if (journeyId != null) {
  const journeysRepo = new JourneysRepo(h, spaceId);
  if (journeysRepo.get(journeyId)) {
    const linkedNodeIds = journeysRepo
      .links(journeyId)
      .filter((l) => l.kind === "node")
      .slice(0, JOURNEY_CANDIDATE_CAP)
      .map((l) => l.refId);
    for (const id of linkedNodeIds) ids.add(id);
  }
}
```

- **Reuses the exact, already-shipped `JourneysRepo.links()` read** `JourneysPanel.tsx`'s own
  detail view already performs on every card expand — no new relationship query, no new
  relationship table, no duplicate source of truth. `journey_link` remains the sole authority.
- **Scoped to `kind === "node"` only** in this first pass, per the phase's own "Deferred Work"
  guidance to prove the node-only case before extending to `income`/`expense`/`bill`/`goal` links.
- **Space isolation is inherited for free**: `JourneysRepo.get`/`links` are already space-scoped
  (confirmed directly in Phase N's audit and re-verified here) — a cross-space `journeyId`
  resolves `get()` to `null` and the whole block is skipped.

## 6. Deduplication

**No new deduplication mechanism was built — it already existed.** `ids` (the seed+hop candidate
pool) is a `Set<number>`; adding an id already present is a no-op by construction. This was
verified directly, not assumed: the Dedup scenario (§10) links a memory that ALSO matches the
question on literal keywords (so ordinary retrieval would find it too) and confirms it appears
**exactly once** in `contextIds`.

**Honest caveat, repeated from Phase P**: `HashEmbeddingProvider`/`HeuristicProvider` are the only
combination this offline sandbox can run for real. The recall numbers below are a plausible floor,
not a ceiling — a real embedding model may recover more of the indirectly-worded memories on its
own. The claims that do NOT depend on embedding quality at all — dedup, the cap, space isolation,
zero-cost-when-unscoped — are pure code-path facts, verified directly.

## 7. Ranking Policy

**Implemented exactly the "preferred initial experiment" the mission specified**: existing
retrieval ranking is fully authoritative and completely untouched. Journey-linked candidates are
added to the SAME flat `ids` `Set` a 1-hop graph neighbor already joins — there is no separate
"Journey tier," no boost, no reordering, no second ranking pass. A Journey-linked memory that
enters `ids` is treated by every downstream step (context assembly, the LLM's own citation
judgment) exactly like any other candidate. Journey membership is a **candidate source**, not a
relevance verdict — the LLM's own `answer()` step still decides what to actually cite from the
assembled context, unmodified from today.

## 8. Context Limits

`JOURNEY_CANDIDATE_CAP = 8`, chosen deliberately close to (but distinct from) `DEFAULT_CHAT.k`
(6) — a Journey's own story is a real, bounded signal, not license to dump its entire history into
every turn. `JourneysRepo.links()` already orders most-recently-linked first
(`ORDER BY created_at DESC`), so the cap keeps the newest 8 node-kind links, matching the same
"most-recent-first" precedent already established by the panel's own display cap
(`hydrateJourneyLinks(...).slice(0, 20)`, just tighter since these enter the LLM's actual context
rather than a UI list).

Measured directly (§10's cap scenario, 15 linked memories against an 8 cap): the journey-scoping
mechanism itself never contributed more than 8 new candidates, regardless of how many total links
existed — verified by isolating what scoping ADDED beyond the unscoped baseline (2 of the 15
were independently found by ordinary retrieval; scoping newly contributed exactly 7, safely
under the cap; total recall of 9/15 legitimately exceeds the cap because of that independent
overlap, which is expected Set-union behavior, not a cap violation).

## 9. Security / Space Isolation

`JourneysRepo.get(journeyId)` is the sole gate — already space-scoped
(`WHERE id = ? AND space_id = ?`), confirmed by direct code read and by a new regression test
(Scenario G, §10): a `journeyId` belonging to a **different space** resolves to `null`, the
candidate-injection block is skipped entirely, zero linked-memory ids from the other space ever
enter `ids`, and the chat turn completes normally (not an error, not a broken reply) using only
its own space's ordinary retrieval. A nonexistent `journeyId` (not just cross-space) behaves
identically to omitting the parameter altogether — verified byte-for-byte via
`contextIds.sort()` equality in the same test file.

## 10. Test Scenarios (all against the REAL `chat()` function)

`packages/server/src/__tests__/journeyScopedChatExperiment.test.ts` — 12 tests, all passing:

| Scenario | Result |
|---|---|
| A — direct Journey question | unscoped recall **1/3** → scoped recall **3/3** |
| B — indirectly-worded linked memory | unscoped: not retrieved → scoped: retrieved |
| C — cross-domain linked item | unscoped: not retrieved → scoped: retrieved |
| D — longitudinal (early/mid/late), generic phrasing | all 3 stages recalled when scoped, regardless of query wording (unlike Phase P's phrasing-dependent result) |
| D (cont.) — historical integrity | the early memory's own stored `content` is byte-for-byte unchanged after a scoped chat turn — Journey scope adds candidates, it never rewrites state |
| E — ambiguous Journeys (A vs B, overlapping generic language) | scoping to A injects ONLY A's candidate, never B's; scoping to B injects ONLY B's, never A's |
| F — no Journey context (control) | **zero** `JourneysRepo.get`/`links` calls; `contextIds` identical whether `journeyId` is omitted or explicitly `null` |
| G — cross-space Journey id | zero leak of the other space's linked memory; the turn completes normally |
| G (cont.) — nonexistent Journey id | behaves identically to no `journeyId` at all |
| Dedup | a linked memory also found by ordinary retrieval appears **exactly once** |
| Cap | scoping's own contribution never exceeds the 8-item cap, isolated from independent overlap |
| Performance | exactly **1** call each to `JourneysRepo.get`/`links` per scoped turn — no scan, no per-node cost |

## 11. Results

Every scenario the phase mandated (A through G) plus dedup/cap/performance passed on the first
corrected run (one test-authoring mistake was caught and fixed mid-experiment — see §13). The
improvement is not marginal: Scenario A alone shows a 3x recall improvement (1/3 → 3/3) on the
EXACT query shape Phase P used as its headline finding, and Scenarios B/C show the two specific,
previously-total misses (an indirectly-worded memory, a cross-domain item) fully closed.

## 12. Performance

Measured directly, not estimated: scoping a chat turn to a Journey costs exactly one
`JourneysRepo.get()` call (a single indexed row lookup) and one `JourneysRepo.links()` call (a
single indexed query already proven cheap in production by `JourneysPanel.tsx`'s own identical
call on every card expand) — verified via `vi.spyOn` call-count assertions, not inferred. **Zero**
additional repository calls occur when `journeyId` is omitted (verified the same way) — ordinary
chat pays nothing for a capability it doesn't use. No new DB indices were needed
(`journey_link_space_idx` already exists). No new vector operations, no new graph traversal, no
ranking-algorithm change, no per-frame or per-message unbounded scan of any kind.

## 13. Failure Modes

- **Failure E (false association)**, flagged as a risk in Phase P but not built out numerically
  there, was implicitly exercised by every scenario here that used unrelated filler content — no
  scenario showed a linked-but-irrelevant memory crowding out a genuinely relevant one, though this
  experiment did not construct a dedicated "stale, no-longer-relevant old link" adversarial case;
  flagged again here as real residual risk worth a future test, not resolved by this pass.
- **A test-authoring mistake, caught and fixed by the required measurement discipline**: the first
  version of the cap scenario used 15 near-identical templated sentences ("Unrelated linked memory
  number N..."), which the hash embedder scored as mutually similar enough to auto-link to EACH
  OTHER via `associativeLink`'s own 0.72 threshold at ingestion — ordinary graph-hop retrieval then
  recovered all 15 regardless of the journey-scoping cap, which would have looked like a cap
  failure but was actually a confound in the test's own data. Rebuilt with 15 genuinely distinct
  sentences and an explicit unscoped-baseline sanity check before trusting the capped-scoped
  number — exactly the "reproduce and measure, don't guess" discipline this repo's own workflow
  mandates, applied to the test itself, not just the production code.
- No other failure mode from Phase P's list (A-F) reproduced as a NEW problem introduced by this
  experiment — Failures A/C/D/F (never retrieved, graph expansion doesn't help, Journey link adds
  signal, ambiguous Journey) are exactly the gaps this experiment set out to close, and did.

## 14. Success Criteria

Per the mission's own instruction not to manufacture an arbitrary threshold, judged against what
Phase P actually measured as the gap:
- **Meaningful recall improvement**: required — measured 1/3→3/3 (Scenario A) plus two previously
  total misses (B, C) fully closed. **Met, clearly.**
- **No unacceptable contamination**: required — Scenario E shows zero cross-Journey leakage even
  under deliberately ambiguous, overlapping language; Scenario G shows zero cross-space leakage.
  **Met.**
- **Bounded context growth**: required — the cap held under direct adversarial-volume testing (15
  links against an 8 cap). **Met.**
- **Negligible/acceptable performance cost**: required — exactly 2 additional indexed repository
  calls per scoped turn, zero when unscoped. **Met.**
- **No degradation of ordinary chat**: required — Scenario F shows byte-identical `contextIds` and
  zero extra repository calls when `journeyId` is absent. **Met.**

All five conditions the mission itself set for a KEEP decision are satisfied with direct
measurement, not judgment calls.

## 15. Recommendation — **KEEP**

The experiment demonstrates a useful, real, bounded tradeoff: a small, well-isolated, negligible-
cost addition that closes the exact, previously-measured retrieval gap, with zero measured
downside on any of the five required dimensions (recall, contamination, context growth,
performance, ordinary-chat regression). This is not "it works technically but isn't worth the
complexity" — the complexity added is genuinely small (one new parameter, ~15 lines of logic
reusing an already-shipped repo method, zero new types, zero schema change), and the improvement is
large relative to that cost.

**What stays behind, and why this is a controlled architecture boundary, not a half-shipped
feature**: the capability is fully built, tested, and production-safe on the server (any future
caller — CLI, API integration test, or eventually a UI — can pass `journeyId` today and get the
proven behavior), but there is **no UI trigger yet**. This is a deliberate, sequenced choice per
the mission's own explicit instruction (§18) to prove retrieval value before touching Galaxy/UI —
not a compromise forced by running out of scope. The route (`POST /api/chat`) already accepts and
validates `journeyId`; wiring an actual "Ask Soumaya about this Journey" affordance
(`JourneysPanel.tsx`, `ChatDock.tsx`, `App.tsx`'s chat-open state) is real, separate, and
appropriately-sized follow-up work — not part of this experiment's mandate.

## 16. Deferred Work

- **UI wiring** — a real entry point (e.g., a button on `JourneyCard` in `JourneysPanel.tsx` that
  opens `ChatDock` with an explicit `journeyId`, threaded through `App.tsx`'s existing chat-open
  state and `askChat`/`api/client.ts`). This is the single largest remaining piece before a real
  user can ever exercise this capability — everything else is done.
- **Extending candidate kinds beyond `node`** — `income`/`expense`/`bill`/`goal` links exist in
  `journey_link` today but are deliberately excluded from this first pass (§5); a natural, small
  follow-on once node-only injection has lived in production.
- **A dedicated Failure-E (stale/irrelevant old link) adversarial test** — flagged as a real,
  unresolved residual risk in §13, not built out numerically here.
- **Free-text Journey inference** — explicitly and permanently out of scope per the mission's own
  critical design principle and Phase P's own measured ambiguity finding; not a "maybe later."
- **Any change to ranking, RRF weights, KNN k, or graph-expansion depth** — none of this
  experiment's findings implicate those; the gap was entirely about candidate sourcing, confirmed
  again here.
- **A multi-turn "sticky" Journey scope** (remembering the selected Journey across a conversation
  without re-supplying it every turn) — deliberately not built (§4); would be a genuine, separate
  design decision with its own tradeoffs (when does the scope expire? can the user explicitly
  leave it?) rather than an oversight to fix later.

## Maya/Soumaya architecture — confirmed untouched

The only production files changed: `packages/server/src/chat/graphrag.ts` (one new trailing
parameter + ~20 lines of additive candidate-injection logic + one new import) and
`packages/server/src/api/routes/chat.ts` (one new optional zod field + one line threading it
through). **Not modified**: the temporal engine, causal engine, emotional engine, interaction
preferences, contradiction engine, supersession engine, relevance architecture, the embedding
model, BM25 (`db/fts.ts`'s `keywordSearch`), RRF (`fuseRrf`), or graph traversal
(`graph/traversal.ts`) — every one of these was read to confirm zero lines changed, not merely
assumed unaffected.
