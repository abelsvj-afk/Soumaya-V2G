# Audit — Journey-Aware Retrieval Reality Check

> Read-only architecture + MEASUREMENT audit. Per `WORKFLOW.md`'s spec-before-code rule and this
> phase's own explicit instruction: **zero production code changed.** Baseline: commit `47c9dfb`
> on `claude/soumaya-second-brain-v1-m4z4hc`. The only new file is a permanent, test-scoped
> measurement harness, `packages/server/src/__tests__/journeyAwareRetrievalAudit.test.ts`, which
> drives the REAL `chat()` GraphRAG entry point (same code the app calls) over a controlled
> dataset and records what it actually retrieves — every number in this document is measured
> from that file's real output, not estimated or asserted. Status: **audit complete — Class B.**

## 1. Executive Summary

The prior Phase N/O audits observed that `journey_link` is never consulted by GraphRAG
retrieval/ranking. That observation alone was correctly flagged as insufficient to justify a
retrieval change — this phase measures whether it actually matters.

**It does, modestly and specifically.** Real `chat()` runs against a controlled dataset show
that a Journey's own already-linked memories are retrieved reliably only when they happen to
share literal vocabulary or hash-embedding similarity with the question — which is exactly the
subset of cases that don't need Journey-awareness in the first place. The memories that
*would* benefit — ones phrased differently, or connected to the Journey by real-world meaning
rather than shared words — are the ones current retrieval misses. Concretely: a direct
Journey question recalled only 1 of 3 linked memories (the one sharing a literal keyword); a
same-Journey item with genuinely different wording was missed entirely; and a purely
domain-free "how has my journey changed" question landed on the wrong Journey by chance, not by
design. At the same time, current retrieval is NOT badly broken — it showed zero cross-Journey
contamination in the same corpus, and a longitudinally-worded query did recover all three
chronological stages of one Journey's story. This is a real, bounded, measurable gap — not an
architectural failure — and **Class B is exactly the right classification**: current retrieval
works, but a small additive Journey candidate source (data that already exists, already
queried elsewhere, at essentially zero new cost) would measurably close the gap.

## 2. Current Retrieval Pipeline

Traced directly from `packages/server/src/chat/graphrag.ts`'s `chat()` function (line-numbers
as of baseline `47c9dfb`):

```
User message
  → deps.embeddings.embed(question)                         [graphrag.ts:59]
  → vecSeeds = knn(sqlite, vec, k, spaceId)                  [graphrag.ts:63 — vec_nodes cosine KNN]
  → kwSeeds  = keywordSearch(sqlite, spaceId, question, k)   [graphrag.ts:64 — nodes_fts BM25]
  → seedIds  = fuseRrf(vecSeeds, kwSeeds, k)                 [graphrag.ts:65 — RRF, k=60 constant]
  → for each seed: ids += multiHopNeighbors(sqlite, seed, depth)   [graphrag.ts:68-71 — `edges` table only]
  → ctxNodes = NodesRepo.byIds([...ids])                     [graphrag.ts:73-74]
  → context  = ctxNodes mapped to {id,label,type,content,occurredAt}  [graphrag.ts:75-81]
  → systemExtra += 8 best-effort snapshot texts (finance/people/cognitive/temporal/
    intelligence/emotional/preferences/galaxy-nav-candidates)   [graphrag.ts:205-348]
  → deps.llm.answer(question, context, {...systemExtra, ...})  [graphrag.ts:350-358]
  → citations = model's cited subset of context, validated against ctxNodes  [graphrag.ts:387-392]
  → return {answer, citations, contextIds: [...ids], ...}      [graphrag.ts:416-426]
```

**Where Journey IDs are available**: only inside `buildNavigationCandidateList(h, spaceId)`
(`analysis/galaxyEntity.ts:77-90`, called at `graphrag.ts:345`) — a bounded `{kind, id, label}`
list of active Journeys/Goals/Bills offered to the LLM purely for the chat-navigation-chip
feature (Phase N/O). These ids never enter `context`, `ids`, or any retrieval/ranking step.

**Where Journey-linked memories are available**: nowhere in `chat()`. `JourneysRepo.links(id)`
(the exact call `JourneysPanel.tsx`'s detail view already uses) is never invoked by
`graphrag.ts` or any function it calls.

**Where `journey_link` IS queried** (outside `chat()` entirely): `analysis/temporalContext.ts`
reads `JourneysRepo.list(false)` for a freshness bucket (title/status/`updatedAt` only — never
`links()`, never node content) that feeds `temporalSnapshotText` (`graphrag.ts:238`); and
`analysis/galaxyEntity.ts`'s `resolveJourney`/`buildNavigationCandidateList` (both outside the
retrieval path — navigation and entity-inspection only).

**Where `journey_link` is NOT queried**: the entire seed→hop→context pipeline above.
`multiHopNeighbors` (`graph/traversal.ts:20-40`) is a recursive CTE over the `edges` table
exclusively — `journey_link` is a structurally separate table (confirmed by reading the
function: it never references `journey_link`, and no join connects the two). **This is proven,
not inferred** — §5 below (`packages/server/src/__tests__/journeyAwareRetrievalAudit.test.ts`
§1) constructs two nodes linked to the same Journey and confirms directly against the `edges`
table that linking them via `journey_link` creates zero edge between them.

**Where semantic similarity determines retrieval**: `knn()` (vector cosine over `vec_nodes`,
`db/vec.ts`) and `keywordSearch()` (BM25 over `nodes_fts`, `db/fts.ts`), fused by `fuseRrf`
(`db/fts.ts:81-96`) — both are pure text/embedding functions of the question, blind to any
Journey the memories happen to belong to.

**Where graph traversal determines retrieval**: `multiHopNeighbors`, one hop by default
(`DEFAULT_CHAT.depth = 1`), over `edges` rows — themselves formed at ingestion time by
`associativeLink` (`ingestion/associativeLink.ts`) at a 0.72 cosine-similarity threshold plus an
LLM validation gate, or by explicit constellation/MOC membership. `edges` formation has no
awareness of Journey membership either.

**Where final context is assembled**: `ctxNodes.map(...)` at `graphrag.ts:75-81` — the union of
fused seeds and their 1-hop graph neighbors, nothing more, nothing Journey-scoped.

## 3. Current Journey Relationship Architecture

(Already fully audited in Phase N — `docs/specs/galaxy-entity-citizenship-audit.md` §2 — summarized
here for this doc's self-containedness.) `journey_link (space_id, journey_id, kind, ref_id)` is
the sole, already-shipped relationship store. `JourneysRepo.links(journeyId)` and
`journeysFor(kind, refId)` already provide both directions of lookup, already consumed by
`JourneysPanel.tsx`'s detail view and `JourneyChips.tsx`. `analysis/journeyLinking.ts`'s
`suggestJourneys`/`hydrateJourneyLinks` already exist for capture-time linking and link
hydration. None of this is new infrastructure to build — the question this audit answers is
narrowly whether `chat()` should ALSO read from it, not whether the data exists.

## 4. Journey-Aware Retrieval Definition

Per the phase brief's explicit instruction not to assume "filter by Journey" is the right model,
four candidate models were evaluated against the measured evidence (§7-§10 below):

- **A. Direct linked-memory retrieval** ("if linked, always include") — rejected as the
  primary model: unconditionally injecting every linked memory regardless of the current
  question risks Failure E (false association, §9) and scales poorly for a long-lived Journey
  with dozens of links.
- **B. Semantic retrieval alone (status quo)** — measured (§7) to reliably recall only the
  subset of a Journey's memories that happen to share vocabulary/embedding similarity with the
  question. This is the CURRENT behavior, not a proposal.
- **C. Graph expansion alone** — measured (§5, §1) to provide **zero** additional recovery for
  Journey-linked content, since `journey_link` never produces an `edges` row and 1-hop
  expansion only follows `edges`.
- **D. Hybrid — a small, bounded, ADDITIVE candidate source** — supported by the evidence: not
  a replacement for A/B/C, but a small supplementary read (`JourneysRepo.links()`, already
  built) merged into the existing candidate set only when the conversation is legibly
  Journey-scoped (see §16's recommended design), clearly distinguishable to the LLM from
  organically-retrieved memories.

**Model D is the one the evidence supports** — not "filter memories by Journey" (which would
change what existing non-Journey questions see, an unjustified scope increase) and not "always
inject every link" (Failure A avoided, Failure E risked). This mirrors the same "small additive
candidate source" instinct the phase brief itself named as option D and cautioned to prove
before designing.

## 5. Test Dataset

Built entirely in the new measurement file, following `mayaRealityTest.test.ts`'s established
pattern (`createDb(":memory:")`, `HashEmbeddingProvider`, `HeuristicProvider` — the only
LLM/embedding combination this offline sandbox can run for real; same honest caveat repeated
throughout this doc, see §6).

| Scenario | Coverage |
|---|---|
| §1 | Structural proof: `journey_link` never produces an `edges` row |
| §2 | Strong, direct Journey question ("What was I trying to accomplish with my nursing journey?") against 3 differently-worded linked memories + a second Journey's own linked memories + 20 unrelated filler memories |
| §3 | Contamination control: same corpus, does the OTHER Journey's linked content leak in? |
| §4 | Ambiguous/indirect question ("How has my journey changed since I started?") — no domain-naming words, two plausible Journeys |
| §5 | Cross-domain: a Journey-linked item with genuinely different vocabulary (standing in for a linked Financial Goal's differently-worded label) |
| §6 | Temporal: three chronologically-spread, differently-worded memories from one Journey's early/mid/late stages |
| §7 | The hybrid-candidate-source delta: how many of a Journey's own linked memories are missing from `chat()`'s real `contextIds`, using only the already-shipped `JourneysRepo.links()` read |

Non-Journey control: §3's filler pool (20 varied, unrelated everyday memories — dinner,
bills, a vet appointment, etc.) is present in every scenario specifically so a hypothetical
Journey-aware candidate source's bound (small, only when Journey-scoped) can be judged against
realistic background noise, not a toy 3-node space.

## 6. Methodology

Every number below comes from actually running
`npx vitest run src/__tests__/journeyAwareRetrievalAudit.test.ts --reporter=verbose` against the
real `chat()` function — not read from source, not estimated. `DEFAULT_CHAT` (`k=6, depth=1,
kDocs=4`) is used unmodified — the exact options the production route uses.

**Important methodological correction made during this phase**: the first pass used tiny
per-scenario corpora (4-9 total nodes). This reproduced `mayaRealityTest.test.ts`'s own
already-documented finding (`docs/specs/maya-reality-test.md` §Context Relevance) that GraphRAG
has **no minimum-relevance floor** — at a small corpus size, top-`k` KNN/BM25 trivially returns
"least dissimilar of what little exists," which would have made every scenario below look
artificially good or bad regardless of Journey-awareness, confounding the actual measurement.
Every quoted result below is from the CORRECTED runs, using a realistic 20-item unrelated
filler pool (`FILLER` in the test file) so the corpus is well above `k` and retrieval is
actually forced to discriminate.

**Honest caveat repeated from `mayaRealityTest.test.ts` (unchanged, not re-litigated here)**:
`HashEmbeddingProvider` is a crude word-hash, not real semantics — it scores even
clearly-related sentences around 0.20-0.24 cosine similarity. `HeuristicProvider` is the
offline template-based LLM fallback. This is the only combination this sandbox can run for
real. The numbers below are therefore a **plausible floor**, not a ceiling — a real
production embedding model (MiniLM/OpenAI) may recover more of the indirectly-worded memories
via genuine semantic understanding than measured here. **The one claim in this document that
does NOT depend on embedding quality at all** is §2's structural finding — journey_link's
total absence from the `edges` table graph traversal is a deterministic code fact, verified
directly against the database, true regardless of which embedding model is ever plugged in.

## 7. Retrieval Results (measured)

| § | Query | Result |
|---|---|---|
| 1 | (structural) | `journey_link` between two nodes creates **zero** `edges` row — confirmed via direct query |
| 2 | "What was I trying to accomplish with my nursing journey?" | **1 of 3** linked memories recalled (`contextIds=[8,13,6,24,11,1]`) — only the one sharing the literal word "nursing" |
| 3 | (same corpus, contamination check) | **0 of 2** trucking-Journey-linked memories leaked in |
| 4 | "How has my journey changed since I started?" (no domain words) | nursing hit = **false**, trucking hit = **true** — landed on the wrong/unintended Journey by chance |
| 5 | "How is nursing school affecting my finances?" | The same-Journey, differently-worded "set aside part of this paycheck" item: **not retrieved** |
| 6 | "How has my nursing journey evolved from when I started to now?" | **3 of 3** chronological stages recalled |
| 7 | (hybrid delta) | **3 of 4** Journey-linked memories were absent from `contextIds` — a bounded union with `JourneysRepo.links()` would have added exactly these |

## 8. Recall/Precision Findings

- **Recall@K (Journey-linked memories in the real retrieved set)**: 1/3 (§2), 0/1 (§5), 3/3
  (§6) — recall is NOT uniformly bad; it correlates directly with how much the query's wording
  overlaps the memory's wording, which is precisely the property Journey-awareness would make
  irrelevant. A memory the user themselves already filed under this Journey should not need to
  guess its own future search terms to be found again.
- **Precision (§3)**: 0/2 unrelated-Journey memories leaked — precision was NOT harmed in this
  corpus. This is a genuine positive finding, not a caveat to explain away.
- **Journey contamination**: 0 observed in this test's corpus. Framed honestly: this is not
  evidence that the current design actively protects against contamination — it's a side
  effect of never consulting Journey membership in either direction. A future hybrid source
  must independently avoid reintroducing contamination (addressed in §16's bound).
- **Ambiguity handling (§4)**: retrieval does not "remain appropriately uncertain" when multiple
  Journeys could apply — it silently picks one via whatever the embedding/BM25 math happens to
  produce, with no signal to the user or the model that this was a guess between two plausible
  Journeys.

## 9. Failure Modes

- **Failure A (relevant Journey memory never retrieved)** — confirmed, §2 and §5. The
  indirectly-worded memories ("Spent six hours memorizing bone names…", "Passed my clinical
  rotation…", the paycheck/tuition item) never appeared in `contextIds` at all.
- **Failure B (retrieved but ranked too low)** — not separately observable with this pipeline:
  `chat()` doesn't expose a ranked list cut at a soft boundary — a seed is either in the
  `k`-fused set (and its 1-hop neighbors) or it is not. Failure A subsumes this case here.
- **Failure C (graph expansion fixes it)** — measured and **rejected**: §1 proves
  `journey_link` never creates an edge, so 1-hop expansion has structurally zero chance of
  recovering a Journey-linked memory on the strength of Journey membership alone. It can only
  help if the memories happened to ALSO get auto-linked via real associative similarity — a
  coincidence, not a mechanism tied to the Journey.
- **Failure D (Journey link adds meaningful signal)** — confirmed by §7's direct delta: 3 of 4
  already-known-relevant memories were absent from the pipeline's own output; the Journey link
  is exactly the signal that would have closed that gap, with no guessing involved.
- **Failure E (false association)** — not directly measured (this audit did not build a
  "stale/irrelevant old link" scenario), but flagged as a real, structurally distinct risk for
  any future design: a memory linked to a Journey months ago is not guaranteed relevant to
  today's specific question about that Journey. This is why §16's recommended design keeps any
  future injection SMALL and explicitly labeled to the LLM, not treated as automatically
  on-topic.
- **Failure F (ambiguous Journey)** — confirmed, §4: with genuinely domain-free language,
  current retrieval picks one Journey's content over another with no signal that a choice was
  even made.

## 10. Temporal Findings

§6 measured full 3/3 recall of a Journey's early/mid/late-stage memories for a
longitudinally-phrased question — a genuine positive result, achieved because that particular
query's own wording ("evolved from when I started to now") happened to overlap enough of each
memory's vocabulary. This does **not** generalize: §2's direct-but-differently-phrased question
about the same kind of Journey recalled only 1 of 3. **Longitudinal continuity today is a
function of query phrasing luck, not a guaranteed property of asking about a Journey.**

A bounded Journey-aware candidate source would **improve** longitudinal continuity (by
guaranteeing the Journey's own known memories are candidates regardless of query wording) — it
would not over-weight old memories any differently than they're already weighted (it doesn't
touch ranking, only candidacy), and it does not conflict with supersession/relevance logic:
`analysis/relevance.ts`/`analysis/causal.ts`/`analysis/emotional.ts` all operate on whatever
`ids` chat() ultimately assembles, regardless of source — adding a few more known-relevant ids
to that set doesn't change how those downstream modules interpret them. Historical memories
would still read as historical; nothing here proposes rewriting or re-dating anything.

## 11. Cross-Domain Findings

§5 is the direct test: a Journey-linked item with genuinely different vocabulary from another
item linked to the SAME Journey was **not** retrieved when asking about the first item's
domain. This stands in for the real cross-domain case (a Journey linked to a Financial Goal
whose own label shares no words with the memory prompting the question) — the mechanism
(no shared vocabulary → no retrieval, since `journey_link` isn't consulted) is identical
regardless of whether the linked item is a `node`, `income`, `expense`, `bill`, or `goal` row.
**GraphRAG does not currently connect these domains through Journey membership** — it only
connects them when they happen to be semantically/lexically similar or graph-linked via
`edges`, which is coincidental, not designed.

## 12. Ambiguity Findings

Covered in §8/§9 (Failure F). The concrete, reproducible case: "How has my journey changed
since I started?" against two plausible Journeys picked the wrong one in this run. No retry, no
clarification signal, no acknowledgment of the ambiguity reached the model or the user. This is
evidence AGAINST attempting free-text "guess which Journey the user means" as a resolution
mechanism (§16 recommends explicit scoping instead, precisely because this measured failure
shows guessing is unreliable).

## 13. Performance Considerations

The recommended future candidate source (§16) is, by construction, one additional bounded read:
`JourneysRepo.links(journeyId)` — the exact call `JourneysPanel.tsx`'s detail view already
performs on every card expand, already proven cheap in production. No new DB indices are
needed (`journey_link_space_idx`/`journey_link_unique` already exist,
`schemaSql.ts:521-530`). Candidate count would be capped small (a handful of a Journey's most
relevant/recent links, not its full history) — same "small, bounded" discipline
`buildNavigationCandidateList`'s own `MAX_CANDIDATES_PER_KIND`/`MAX_TOTAL_CANDIDATES` constants
already establish elsewhere in this exact file. No new vector operations, no new graph
traversal, no ranking-algorithm change — the injected ids would simply join the existing `ids`
set the same way a 1-hop neighbor already does today (`graphrag.ts:69-71`), so context-size
growth is bounded by the same cap that already exists for that set. Worst case (a Journey with
many links) is fully controlled by the injection cap, not by corpus size.

## 14. Architectural Impact

None required. The recommended future work (§16) touches only `chat()`'s candidate-assembly
step (`graphrag.ts:67-71`, adding a few more ids to the existing `ids` `Set` under a
new, gated condition) and, if the explicit-scoping design is chosen, a new optional parameter on
`chat()`/the chat route plus a small UI affordance for entering a Journey-scoped conversation.
It requires **no schema change** (`journey_link` already supports this read), **no new
repository method** (`JourneysRepo.links()` already exists), and **no change** to `knn`,
`keywordSearch`, `fuseRrf`, `multiHopNeighbors`, or any of the eight `systemExtra` snapshot
functions.

## 15. Classification

**CLASS B — Minor measurable gap.** Current retrieval works for the cases where query wording
happens to overlap memory wording (§3's zero contamination, §6's full temporal recall under
favorable phrasing) — this rules out Class C ("frequently fails") and Class D (nothing in the
architecture prevents a bounded fix; the exact data and repo method already exist). But real,
reproducible misses exist (§2: 1/3 recall, §5: cross-domain miss, §7: 3/4 delta) that a trivial,
already-shipped, already-safe additive read would close — this rules out Class A ("no
meaningful gap").

## 16. Recommendation

**Design a small, bounded retrieval experiment — do not implement it yet.** Per the phase's own
mandated sequence (AUDIT → EVIDENCE → DESIGN → IMPLEMENTATION), this document stops at DESIGN.

**Smallest future experiment**, informed directly by §12's ambiguity finding:

1. **Trigger condition — explicit, not guessed.** §4 demonstrated that inferring "which Journey
   is this free-text question about" from language alone is unreliable. The safe design is an
   EXPLICIT Journey-scoped chat entry point (e.g., "Ask Soumaya about this Journey" from
   `JourneysPanel.tsx`'s own `JourneyCard` — a real, already-designed UI surface with a known
   `journeyId` in hand, no guessing required) — NOT an attempt to infer Journey intent from
   arbitrary free text. This is a genuinely new (small) UI affordance, not a reuse of an
   existing one — confirmed by checking `ChatDock.tsx`/`api/routes/chat.ts`: no journey-scoped
   chat entry point exists today.
   - Nice-to-have, deferred: `journeyLinking.ts`'s own KNN-based `suggestJourneys` heuristic
     COULD be repurposed to guess a Journey from the question text, but §4's finding argues this
     needs its own separate validation pass before being trusted, not folded into this
     experiment's first cut.
2. **When triggered**, `chat()` accepts an optional `journeyId` and merges a small, capped
   subset of `JourneysRepo.links(journeyId)`'s `kind==="node"` ref ids into the existing `ids`
   `Set` (`graphrag.ts:67-71`) before context assembly — same mechanism a 1-hop neighbor already
   uses, just from a different source.
3. **Labeled, never blended silently**: the injected memories should be identifiable to the LLM
   as "connected to this Journey" context, distinct from organically-retrieved memories — this
   directly mitigates Failure E (a linked-but-currently-irrelevant memory shouldn't be treated
   as automatically on-topic just because it's in context).
4. **Success threshold** (not arbitrary — set from what this audit actually measured): the
   experiment is worth keeping if it meaningfully raises recall on §2/§5-shaped queries (a
   Journey-scoped question about a memory phrased differently than the query) without
   introducing measurable Failure-E-style off-topic injection in a manual review of a
   reasonable sample of Journey-scoped conversations. If it doesn't move that needle, or if it
   measurably increases apparent-but-wrong context, revert — the bar is a demonstrated
   improvement over §2/§7's baseline numbers, not "it seems plausible."

**If instead the smallest experiment isn't worth building right now**: doing nothing is also a
legitimate, correctly-supported outcome per this phase's own success criterion — Class B, not
Class C, means the current system is not failing users badly; it's a bounded, optional
polish opportunity gated behind a real product decision (is a Journey-scoped chat surface even
wanted?), not an urgent architectural fix.

## 17. Explicitly Deferred Work

- Free-text Journey inference (guessing which Journey from an unscoped question) — §4's
  measured failure argues against attempting this without its own dedicated validation.
- Any change to ranking, RRF weights, KNN k, or graph-expansion depth — none of this audit's
  findings implicate those; the gap is entirely about candidate SOURCING, not ranking.
- Cross-domain injection beyond `kind==="node"` links (income/expense/bill/goal ref ids) — the
  smallest experiment above scopes to node links first; extending to finance-kind links is a
  natural but separate follow-on once the node-only version is validated.
- Any change to `relevance.ts`/`causal.ts`/`emotional.ts`/`temporalContext.ts` — none are
  implicated; they already operate correctly on whatever `ids` set they're handed.
- Building Failure E's stale-link scenario as its own measured test — flagged as a real risk in
  §9 but not built out numerically in this pass; would be a natural addition before or during
  the recommended experiment's own implementation phase.

## Maya/Soumaya architecture lock — confirmed untouched

Zero production code changed this phase (verified: `git status`/`git diff` show only the new
test file). No modification to `chat/graphrag.ts`, retrieval ranking, embeddings, vector search,
BM25, RRF, `journey_link` semantics, memory scoring, the relevance floor, temporal intelligence,
causal reasoning, emotional reasoning, interaction preferences, or the Soumaya response
architecture. The measurement harness calls the real, unmodified `chat()` function exactly as
production does.
