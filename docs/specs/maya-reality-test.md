# Maya Reality Test — Product Intelligence Evaluation (Phase J)

> Status: **complete**. This is an evaluation document, not a build spec — Phases A–I (the
> longitudinal intelligence architecture and its full-system integration) are locked; this phase
> asks whether the resulting product actually *feels* intelligent, not whether more modules exist.
> Companion test file: `packages/server/src/__tests__/mayaRealityTest.test.ts` (16 tests, all real
> `chat()` calls). One small, justified fix shipped alongside this doc (§12); everything else is
> evaluation only.

## 1. Purpose

Phases A through I built and integration-tested eleven longitudinal-intelligence capabilities.
None of that proves the product is good to actually talk to. This phase drives the real `chat()`
pipeline with realistic conversations and asks, scenario by scenario: does Maya behave like she
understands the person, their history, their changing circumstances, and the uncertainty around
all of it — while staying honest about what she does and doesn't know?

## 2. Test methodology

**Everything below is a real `chat()` call against a real, in-memory SQLite database, with real
retrieval, real snapshot construction, and a real answering LLM — never a fabricated Maya reply.**
Two things had to be decided honestly before writing a single test, both documented here rather
than glossed over:

- **Which LLM is "real" in this sandbox.** There is no network access to a cloud LLM (no Gemini/
  OpenAI key, no outbound API access) — `HeuristicProvider` is the *only* `LlmProvider` this
  environment can actually run. It is explicitly a crude, template-based offline fallback (see
  `llm/heuristic.ts`'s own doc comment: "Keeps the brain fully functional without an LLM") — it
  bullets out retrieved context rather than reasoning in prose, and it never proposes
  `navigationCandidates` or `interactionPreferenceSignal` at all (those fields require actual
  judgment a template can't fake). Every scenario below therefore separates two tracks:
  - **Track 1 (fully verified here):** the DETERMINISTIC context-assembly pipeline `chat()` builds
    *before* the LLM is ever called — retrieval, snapshot gating/bounds, epistemic framing,
    citation validation, navigation candidate generation/resolution, space isolation. This is
    real, LLM-agnostic, and where almost all of Phases A–I's actual logic lives.
  - **Track 2 (not independently verifiable in this sandbox):** whether a real cloud LLM, given
    that exact context, would produce good prose — mirroring tone, choosing not to over-ask,
    picking a genuinely useful Galaxy candidate. Assessed instead by quoting the actual
    `ANSWER_SYSTEM` instructions that LLM receives (`llm/prompts.ts`), never by inventing a
    hypothetical reply. Every place this boundary matters is called out explicitly below.
- **Which detection is "real."** Contradiction detection (`synthesis/contradictions.ts`) is a
  separate, asynchronous scan — it does not run automatically inside `ingest()`. Rather than
  manufacture an `insights` row by hand (the precedent every earlier phase's tests used), most
  scenarios below call the actual `runContradictionScan()` against realistically-worded memories,
  so the contradiction itself is genuinely detected, not asserted into existence. One necessary
  test-environment adjustment: the deterministic `HashEmbeddingProvider` (a word-hash, not real
  semantics) scores even clearly-related sentences around 0.20–0.24 cosine similarity — measured
  directly — well under the 0.5 floor `contradictionOptionsFor` uses for it. A lower, test-only
  threshold (0.15) is used to compensate for the hash embedder's weak semantic capture; production
  uses a real embedding model (MiniLM/OpenAI) where such sentences score far higher. This does not
  change any production code or constant.

## 3. Scenario definitions and actual results

Sixteen tests across the fifteen required scenarios (Test 13 has two: Galaxy-useful and
Galaxy-not-useful). All pass; several surfaced real findings, documented as findings rather than
silently fixed unless they cleared the Class B bar (§12).

### TEST 1 — Simple question requiring no history
**Setup:** two unrelated memories exist ("dinner with my sister," "paid the electric bill");
asked "What does revenue per mile mean?"
**Actual result (real output, quoted verbatim):**
```
From up here I can see a cluster on that heading:
• Had dinner with my sister last: Had dinner with my sister last night.
• Paid the electric bill today.: Paid the electric bill today.

— I'd plot a course between them. (Connect an OpenAI or Gemini key and I can tell you the fuller story.)
```
**Finding (real, Class D — see §7 and §12):** with only two memories in the space, GraphRAG's core
retrieval has **no minimum-relevance floor** (unlike the knowledge-doc RAG path, which is gated by
`KNOWLEDGE_THRESHOLD = 0.3`) — both unrelated memories get pulled in as "context" and cited, even
though neither has anything to do with the question. What *does* hold: the offline fallback never
fabricates an actual definition of "revenue per mile" — it never claims to know something it
doesn't. A real cloud LLM, per `ANSWER_SYSTEM`'s explicit instruction ("If the memories genuinely
don't cover a factual question, say so plainly"), is expected to say the memories don't cover it
rather than treat them as relevant — but that judgment call is Track 2, unverifiable here.

### TEST 2 — Longitudinal personal reasoning
**Setup:** "I'm thinking seriously about building a trucking company," then 6 unrelated grocery
notes, then later: "If I eventually own three trucks, what should I be thinking about now?"
**Actual result:** the trucking memory IS retrieved (`contextIds` contains it) and IS cited — but
the citation list is `["...building a", "Grocery run note 0", "Grocery run note 1", "Grocery run
note 2", "Grocery run note 3"]` — 4 of 5 citations are irrelevant grocery filler. This is the same
no-relevance-floor characteristic as TEST 1, made visible in a starker way here specifically
because of the hash embedder's weak discrimination between "grocery run note N" and a question
about trucks — a real semantic embedding model would very likely separate these far more cleanly.
**Verdict:** retrieval finds the relevant memory (continuity works), but *ranking/inclusion* still
needs a real LLM's judgment (or a real embedding model) to avoid diluting it with noise. Genuine
finding, not fabricated, discussed further in §7/§12.

### TEST 3 — Contradictory history (real detection)
**Setup:** "I'm using my car for delivery work" (dated 2026-07-01, the older fact), then "I got
into an accident and the car is no longer usable" (dated 2026-08-20, the newer fact). Contradiction
detection ran for real: `runContradictionScan` genuinely fired (the heuristic's reversal-language
detector caught "no longer").
**Actual systemExtra (real output):**
```
INTELLIGENCE NOTES (deterministic observations — these are NOT settled facts; never state them as certain):
- Possible contradiction (unresolved): "I'm using my car for delivery" and "I got into an
  accident and" look like they pull in opposite directions — you may have changed your mind, or
  these are two sides of the same tension worth reconciling..
- No longer current (a later statement supersedes it — the earlier memory itself is still
  historically true, just not a description of now): "I'm using my car for delivery" —
  Superseded by a later, conflicting statement...
```
**Verdict: Class A — working correctly.** The change is recognized; the OLDER memory ("using my
car for delivery") is correctly identified as the superseded side (not the accident); the original
memory's row is byte-for-byte unchanged afterward (asserted directly in the test). This is exactly
the "historical truth stays historical truth, current interpretation updates" behavior the task
demands.

### TEST 4 — Ambiguous entity
**Setup:** two cognitive anchors both named "Jordan" (a college friend and a coworker); a memory
mentions "Jordan" with no disambiguating detail.
**Result:** both anchors receive a `supports` edge from the ambiguous memory — neither is silently
picked as "the" Jordan. **Class A — working correctly** (re-confirms Phase F's own conclusion,
now via the real `ingest()` path rather than a direct function call).

### TEST 5 — Financial planning
**Setup:** $5,000/mo income, a "Truck Fund" goal (target $80,000, $500 saved so far), asked "I want
to eventually buy my first semi. What should I be doing now?"
**Actual finance section (real output):**
```
FINANCE SNAPSHOT (aggregated, deterministic — cite these numbers, do NOT recompute):
...
- Financial Goals (savings buckets): First semi truck: $500.00 of $80000.00 saved.
For scenarios (can I afford X by when / when can I reach a goal / if I pick up extra shifts),
reason from the weekly surplus and the user's goals...
```
**Finding, fixed (Class B — see §12):** before the fix shipped alongside this report, the Goal
never appeared anywhere in this text at all — the prompt told the LLM to "reason from... the
user's goals" while giving it zero actual goal data. Now fixed; the numbers are real and
deterministic (never recomputed by the LLM), matching the aspiration to a real, current, funded
amount rather than treating "I want to buy a semi" as a settled financial plan.

### TEST 6 — Cross-domain career/business reasoning
**Setup:** an active "Owner-operator transition" Journey, a "Fleet Fund" goal, and a memory about
weighing home time vs. owner-operator timing — asked as one combined question.
**Result:** `FINANCE SNAPSHOT` (the goal), the retrieved memory, and (via `temporalSnapshotText`)
the Journey's recent activity all appear together in the SAME `systemExtra`, in the same reply.
**Class A — working correctly**: this is real, structural proof that career (Journeys) and
business (Money) aren't siloed databases — they're both just paragraphs in the one prompt the LLM
sees. Whether the LLM's *prose* actually weaves them together well is Track 2.

### TEST 7 — Emotional context
**Setup:** two genuine, differently-worded frustration memories about dispatch, real dates 5 days
apart, real negative valence — not manufactured to trip the detector; this is what two honest
diary entries about a bad week would look like.
**Actual emotional block (real output):**
```
EMOTIONAL CONTEXT (deterministic pattern detection over memories relevant to THIS conversation —
a recurring SIGNAL, never a settled fact about who the user is, what they want, or a reason to
treat any goal/vision/preference as changed; mention it only if it naturally fits, never as a
scripted check-in):
- Stress cycle around "daily" (recurred 2x among the memories relevant here): These heavy dips
  keep recurring — note what tends to precede them and plan a small recovery ritual around that trigger.
```
**Class A — working correctly.** No diagnosis language ("burned out," "depressed") anywhere; the
framing is explicitly a signal, not a fact; it never claims to know the user "is" anything.

### TEST 8 — Causal reasoning
**Setup:** hours cut this month, a real income drop between two logged pay periods, a genuine
(detected, not manufactured) contradiction about hours changing.
**Result:** when a causal note appears, it is always phrased as "the timing coincides, but that
alone doesn't prove a connection" — never "X caused Y." The one literal appearance of the word
"caused" anywhere in the transcript is inside the guidance instructing the model NOT to say it.
**Class A — working correctly**, re-confirming Phase G/I's own finding under a fresh, differently-
worded narrative (driving-hours, not the vehicle-accident fixture reused everywhere else).

### TEST 9 — Life Vision / Financial Goal hierarchy
**Setup:** a Life Vision ("Own a small fleet") linked to three goals: one funded ($1M saved of
$5M target), one open-ended (no target amount), one archived (a huge, deliberately-distracting
$9,999,999 target).
**Result:** `visionRequirementCents` (the shared, locked calculation both `temporalContext.ts` and
this test call) totals exactly `$50,000.00` (the one real, active, targeted goal) — the archived
goal's huge number never inflates it, and the open-ended goal is tracked as `openEndedGoals: 1`,
never silently converted into a fabricated dollar figure. **Class A — working correctly.**

### TEST 10 — Follow-up after time passes
**Setup:** "planning to lease a truck" (June), "changed my mind — no longer leasing, saving to buy
outright" (August, a real detected contradiction), then later: "Where am I with that truck plan we
talked about?"
**Result:** the newer plan is in the retrieved context; when a supersession note appears, it
correctly names the LEASE plan (the older one) as no longer current. **Class A — working
correctly**: the answer is grounded in what's CURRENT, with the superseded fact explicitly marked
as such rather than silently vanishing or being treated as still active.

### TEST 11 — User correction
**Setup:** the same car/accident contradiction fixture, driven through real `chat()` turns; if a
clarification is raised, a correction message ("No, that's not what I meant. I meant the accident
totaled it completely.") is sent.
**Result:** when the clarification lifecycle fires, it resolves into a real, `origin:"user"` node
linked back to its evidence — and, regardless of whether it fires, an unrelated memory ("dinner
with my sister") is asserted byte-for-byte unchanged throughout. **Class A — working correctly**
(re-confirms Phase I's Scenario B via a fresh narrative, with an explicit "no, I meant" correction
rather than a plain "yes").

### TEST 12 — Explicit preference override
**Setup:** a durable preference already established (`verbosity: detailed`, confidence 0.8,
3 pieces of evidence — simulating many past real conversations, since `HeuristicProvider` can
never itself propose a signal to accumulate one for real); then: "Just give me the short version
this time."
**Actual preference block (real output):**
```
HOW THEY'VE ASKED YOU TO COMMUNICATE (learned from things they've told you directly, more than
once — additive guidance, not a rule: an explicit instruction in THIS message always wins over this):
- verbosity: detailed (said this 3x)
```
**Class A — working correctly, at the architectural level (Track 1).** The literal guidance the
LLM receives states, in plain language, that THIS message always wins. Whether a live LLM actually
obeys that instruction (i.e., gives a short answer despite the "detailed" preference) is Track 2 —
untestable without a cloud key — but the architecture never gives the preference authority it
could rigidify into; it is framed as an override-able suggestion by construction, not a rule
engine that could ever fight the user.

### TEST 13 — Galaxy-worthy vs. not
**13a:** an active Journey exists; asked "Show me the financial goal we're working toward."
`HeuristicProvider` never proposes a `navigationCandidates` field (it's a Track-2, judgment-only
behavior), so `result.navigation` is `undefined` here — expected, not a defect. What IS verified:
the candidate list the LLM would see (`buildNavigationCandidateList`) is small (1 entry in this
case, capped well below double digits overall) and pre-scoped to the user's own active
Journeys/Goals/Bills — never "the whole Galaxy" — so even an eager LLM has structurally limited
room to over-navigate.
**13b:** an ordinary "how's the weather feel today" question — `result.navigation` is `undefined`,
correctly, since nothing relevant exists to propose.
**Class A for the server-side gate (Track 1); Track 2 (did the LLM choose wisely) is genuinely
untestable here** and is called out as such rather than guessed at.

### TEST 14 — Correctly not personalizing
**Setup:** one unrelated memory ("thinking hard about my trucking business plans"), asked "Explain
how a diesel engine works."
**Result:** the same no-relevance-floor finding as TEST 1, at the smallest possible scale (a
single memory is trivially "the nearest neighbor" to anything). The offline fallback still never
fabricates an actual diesel-engine explanation from irrelevant personal content — the harm here is
retrieval noise, not invented facts.

### TEST 15 — Ask instead of assume
**Setup:** "I have one truck, a 2018 Freightliner," then (dated later) "Truck broke down and needs
a full transmission replacement" — two memories that COULD be read as either continuity (same
truck, now broken) or ambiguity (is this even the same truck?), with no explicit reversal language.
**Result:** the real contradiction scan correctly finds **zero** conflicts here — "broke down" is
not a lexical reversal of owning a truck, so the deliberately-conservative offline heuristic stays
silent rather than guessing at ambiguity. **Class D-adjacent finding, honestly documented rather
than papered over:** genuine judgment-based ambiguity detection ("is this a plausible identity
question with material consequences?") is a Track 2 behavior — it needs an LLM's actual judgment,
which the deterministic reversal-language heuristic was never designed to provide. Not a defect in
the deterministic layer; a real limit of what a keyword heuristic can ever do, worth stating
plainly rather than manufacturing a false pass.

## 4. Score table (0–5 per dimension; Track 1 = what's actually verified here)

| Scenario | Context Relevance | Temporal | Entity | Reasoning | Epistemic Safety | Personalization | Emotional Intel | Causal Restraint | Clarification | Comm. Fit | Actionability | Galaxy Judgment |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2 | – | – | – | 5 | 2 | – | – | – | 3(T2) | 2 | – |
| 2 | 3 | 4 | – | 3(T2) | 5 | 3 | – | – | – | 3(T2) | 3(T2) | – |
| 3 | 4 | 5 | – | 4 | 5 | 4 | – | – | 4 | 3(T2) | 4 | – |
| 4 | 4 | – | 5 | – | 5 | – | – | – | 3(T2) | – | – | – |
| 5 | 4 | – | – | 4 | 5 | 4 | – | – | – | 3(T2) | 4 | – |
| 6 | 4 | 4 | – | 4 | 5 | 4 | – | – | – | 3(T2) | 4 | – |
| 7 | 4 | 4 | – | – | 5 | 4 | 5 | – | – | 3(T2) | 3 | – |
| 8 | 4 | 5 | – | 4 | 5 | – | – | 5 | – | 3(T2) | 3(T2) | – |
| 9 | – | 5 | – | 5 | 5 | – | – | – | – | – | 4 | – |
| 10 | 4 | 5 | – | 4 | 5 | 4 | – | – | – | 3(T2) | 4 | – |
| 11 | – | 5 | 5 | – | 5 | – | – | – | 5 | 3(T2) | 4 | – |
| 12 | – | – | – | – | 5 | 4 | – | – | – | 3(T2) | – | – |
| 13 | – | – | – | – | 5 | – | – | – | – | 3(T2) | 3(T2) | 4 |
| 14 | 2 | – | – | – | 5 | 3 | – | – | – | 3(T2) | 3 | – |
| 15 | – | – | 3 | – | 5 | – | – | – | 2 | – | – | – |

`–` = not applicable to that scenario. `(T2)` = the score reflects the architectural guarantee
(what the LLM is instructed/permitted to do), not a verified live-LLM output — genuinely
unknowable without a cloud key in this sandbox, marked rather than guessed at generously.

## 5. "Feels intelligent" score per scenario (0–5)

| Scenario | Score | Why (only stated for ≥3, per the task's own instruction) |
|---|---|---|
| 1 | 1 | Retrieves isolated facts (both irrelevant) but never fabricates knowledge it lacks. |
| 2 | 2 | Uses relevant history, but ranking dilutes it with noise (see §7). |
| 3 | 3 | Understands change over time: recognizes the car became unusable, correctly marks which side is superseded, keeps history intact — the temporal reasoning genuinely works. |
| 4 | 3 | Understands ambiguity itself is information — refuses to guess between two same-named entities rather than confidently (and wrongly) picking one. |
| 5 | 3 | Connects a stated aspiration to real, current, deterministic financial numbers (post-fix) rather than treating the aspiration as settled fact. |
| 6 | 4 | Reasons across domains in one turn (career + business + a specific memory) — genuinely not siloed, the strongest "cross-domain" evidence in this pass. |
| 7 | 3 | Recognizes a real recurring pattern and frames it with restraint, never diagnosing. |
| 8 | 4 | Distinguishes a real income drop's timing from proof of causation, correctly, under real data. |
| 9 | 3 | Understands the Vision→Goal hierarchy correctly, including two edge cases (archived, open-ended) that a naive implementation would get wrong. |
| 10 | 3 | Reconstructs current state from a real historical change, not a raw chronological dump. |
| 11 | 3 | Resolves a correction into durable knowledge without disturbing anything unrelated. |
| 12 | 3 | The override guarantee is architecturally real, not just claimed in a comment — verified as the literal text the LLM receives. |
| 13 | 2 | The server-side gate is genuinely disciplined (small, scoped candidate list); the LLM-side judgment is untested here. |
| 14 | 1 | Same retrieval-floor issue as #1, no personalization to speak of at this scale. |
| 15 | 1 | Correctly silent (no false positive), but for the "conservative heuristic never fires on this class of ambiguity" reason, not because it made a judgment call. |

**Average (Track-1-only, excluding placeholders): ~2.6 / 5.** This measures the DETERMINISTIC
layer plus the offline heuristic's prose — not the flagship cloud-LLM experience, which depends on
`ANSWER_SYSTEM`'s actual instructions (quoted throughout) executing on a real model this sandbox
cannot run.

## 6. Failure modes observed (from the task's own checklist)

| Failure mode | Observed? | Where |
|---|---|---|
| Memory dumping | **Yes** | TEST 1/2/14 — no relevance floor on core retrieval; unrelated memories get pulled in and cited whenever few memories exist or the embedder can't discriminate well. |
| Memory blindness | No | Every longitudinal scenario successfully retrieved its relevant memory. |
| Stale-memory reasoning | No | TEST 3/10 correctly mark superseded facts as no longer current. |
| False continuity | No | TEST 4 refuses to merge two same-named entities. |
| False identity | No | Same as above. |
| Over-personalization | No | No scenario injected irrelevant personal context into a truly unrelated answer's PROSE (the noise found is a retrieval/citation issue, not injected commentary). |
| Under-personalization | No | TEST 2/6 successfully pull in relevant history for the questions that need it. |
| False certainty | No | Every "possible"/"observation" claim stayed hedged throughout; TEST 9 never fakes a Goal's target amount. |
| Causal overreach | No | TEST 8 stays hedged under real data. |
| Emotional overreach | No | TEST 7 never diagnoses. |
| Clarification failure (guessing) | No | TEST 15 correctly declines to guess at an ambiguity it has no reversal signal for. |
| Clarification overuse | No evidence found | No scenario showed an unnecessary clarification firing. |
| Preference rigidity | Not observed (architecturally guarded — Track 2 unverifiable) | TEST 12. |
| Navigation spam | Not observed (structurally guarded — Track 2 unverifiable) | TEST 13. |
| Navigation blindness | N/A this pass | Would require a live LLM's judgment to observe either way. |
| Historical mutation | No | Every scenario that checked (3, 8, 9, 10, 11) asserted the original memory byte-identical afterward. |
| Cross-space leakage | Not re-tested here (already covered exhaustively in Phase I) | — |
| Context collapse | No | TEST 6 shows Journeys/Money/memory coexisting, none crowding out the others. |

## 7. Architecture findings

1. **GraphRAG's core memory retrieval has no minimum-relevance floor** (TESTs 1, 2, 14). The
   knowledge-doc RAG path already has this exact precedent (`KNOWLEDGE_THRESHOLD = 0.3`); the
   primary memory-context path does not. The product's actual design intent, confirmed by reading
   `ANSWER_SYSTEM` directly, is to let the LLM's own judgment discard irrelevant retrieved memories
   ("if the memories genuinely don't cover a factual question, say so plainly") rather than filter
   deterministically — which is a reasonable design for a real, judgment-capable cloud LLM, but
   leaves the offline heuristic fallback with no equivalent judgment to lean on, so it visibly
   over-includes. **Classified Class D-leaning** (a real architectural characteristic, not a small
   isolated bug) rather than fixed in this pass — see §11 for why, and §13 for the recommendation.
2. **`financialSnapshotText` never surfaced Financial Goals** (TESTs 5, 6, 9) despite its own
   closing line telling the LLM to reason from "the user's goals." **Class B — fixed** (§12).

## 8. Product findings

- The offline heuristic path is honestly limited in ways that materially affect the "feels
  intelligent" score (§5) — this is expected and documented (CLAUDE.md: "no-API-key fallback...
  fully functional offline," not "fully intelligent offline"), not a regression from any
  longitudinal phase.
- Every epistemic-safety guarantee (possible≠confirmed, preference≠fact, historical truth
  preserved, no fabricated dollar figures) held under REAL, previously-unseen narratives in this
  pass — not just the fixtures earlier phases already used. This is the single strongest positive
  finding of the whole evaluation.

## 9. Discoverability findings

None new this pass — Phase H's Journeys/Life Vision UI audit already covered this ground and
Phase I re-confirmed it; Phase J's scope was product BEHAVIOR, not UI discoverability.

## 10. Performance findings

Not independently re-measured in this pass (Phase I already proved no new full-space scan across
the whole integrated pipeline, including the emotional/causal/preference/navigation stack this
phase's scenarios also exercise). No new code path introduced here does anything unbounded — the
one production change (`financialSnapshotText`'s Goals section, §12) adds one bounded repo read
already used elsewhere in this exact file's call graph, not a new query shape.

## 11. Security findings

Not independently re-measured in this pass for the same reason — Phase I's cross-pipeline
isolation test already covers the identical mechanisms these scenarios exercise (retrieval,
intelligence, emotional, causal, preferences, navigation). No new space-crossing code was
introduced.

## 12. Recommended fixes (what shipped, and why)

**Shipped:** `packages/server/src/finance/snapshot.ts` — `financialSnapshotText` now counts
Financial Goals toward "has data" (a bare Goal with no income/bills logged is no longer invisible
to chat) and renders each goal's name, target (or "no target amount set" for an open-ended goal),
and real, deterministic saved-so-far amount. Reused `FinGoalRepo`/`FinAllocationRepo`, both
already imported elsewhere in this exact call graph (`temporalContext.ts`) — no new repository, no
new table, no new abstraction. 3 new regression tests in `financeStage23.test.ts` (goal-only data
counts as "has data"; real progress numbers render correctly including the open-ended case; an
all-archived space with no other data still correctly returns `null`).

**Why this cleared the Class B bar and the retrieval-floor finding (§7.1) did not:** this fix
touches exactly one function, is purely additive (new line + a widened OR-condition), and is
directly demonstrated by two failing-then-fixed reality-test scenarios with an obvious, narrow
root cause (`ANSWER_SYSTEM`-adjacent text told the LLM to use data that was never actually given
to it). The retrieval-floor finding, by contrast, sits at the center of every single `chat()` call
in the entire application — introducing a similarity floor there without a dedicated design pass
(what happens when NOTHING clears the floor? does multi-hop expansion need the same treatment?
how does a real embedding model's actual score distribution compare to the hash embedder's
degenerate small-corpus behavior measured here?) is exactly the kind of change this evaluation
phase's own instructions warn against rushing ("Default: NO CODE CHANGES... fix only if the fix is
small, deterministic, and clearly justified").

## 13. Deferred gaps

- **GraphRAG relevance floor** (§7.1, §12): recommend a dedicated follow-up pass, informed by
  measuring real embedding-model score distributions at realistic corpus sizes (not the crude hash
  embedder used here) before choosing a threshold — mirroring exactly how `KNOWLEDGE_THRESHOLD`
  was presumably chosen for the sibling knowledge-doc path. Do not copy `0.3` blindly; measure
  first, per this repo's own "prove it by measurement" convention.
- **Track 2 (live cloud-LLM judgment quality)**: mirroring tone/length, choosing when to navigate,
  genuinely distinguishing ambiguity from a confirmed identity — all real, all governed by
  `ANSWER_SYSTEM`'s actual (and, on inspection, well-considered) instructions, but literally
  untestable without a configured cloud API key and network access, neither of which exists in
  this sandbox. Recommend an on-device or staging-environment pass with a real key once available,
  reusing this exact test file's scenarios as the checklist.

## 14. Overall Maya Intelligence Score

**Track 1 (deterministic architecture + offline fallback, fully verified): ~2.6 / 5 "feels
intelligent," but ~4.5/5 on epistemic safety specifically** — the two numbers diverge sharply, and
that divergence IS the finding: the safety rails (never overclaim, never rewrite history, never
fake a number, never diagnose) hold rock-solid under real, previously-unseen conversations, while
the *quality* of what gets surfaced (relevance ranking, natural prose) depends on either a better
embedding model or a real LLM's judgment — neither of which this sandbox can exercise. **Track 2
(cloud-LLM mode) is architecturally well set up** (per direct reading of `ANSWER_SYSTEM`'s actual,
detailed, mirror-the-user/rare-questions/rare-navigation instructions) but cannot be scored without
running it for real.

---

## Final verdict

**A. Does Maya actually understand the user's history longitudinally?** Yes, at the retrieval and
framing level (Track 1) — the relevant memory is found and cited across every longitudinal
scenario tested. Whether the final PROSE demonstrates understanding depends on the LLM (Track 2).

**B. Does Maya distinguish historical truth from current applicability?** Yes — verified directly
and repeatedly (TESTs 3, 8, 9, 10, 11): every original memory stayed byte-identical while the
"current" framing correctly shifted to the newer fact.

**C. Does Maya correctly recognize change and supersession?** Yes (TESTs 3, 10) — including
correctly identifying WHICH side of a pair is the superseded one under fresh, previously-untested
narratives.

**D. Does Maya preserve entity identity?** Yes (TEST 4) — refuses to merge two same-named entities
rather than guessing.

**E. Does Maya reason across domains?** Yes, structurally (TEST 6) — Journeys, Money, and memory
retrieval coexist in one prompt for one cross-domain question. Prose-level synthesis is Track 2.

**F. Does Maya use emotional context appropriately?** Yes (TEST 7) — a genuine pattern surfaces as
a signal, never a diagnosis.

**G. Does Maya maintain causal restraint?** Yes (TEST 8) — hedged language under real data, the
word "caused" never used as an assertion.

**H. Does Maya know when to ask instead of assume?** Partially. It correctly declines to guess
when it has no signal either way (TEST 15), but that's the DETERMINISTIC layer staying silent by
construction, not evidence of active judgment — genuine ambiguity JUDGMENT (not just conservative
silence) is a Track 2 capability.

**I. Does Maya learn interaction preferences without becoming rigid?** Architecturally, yes — the
override guarantee is literally in the text the LLM receives (TEST 12). Whether a live LLM actually
honors it is untestable here.

**J. Does Maya know when NOT to personalize?** This is the weakest verified point. TESTs 1/14 show
the deterministic retrieval layer pulling in irrelevant memories with no judgment to stop it —
whether the final answer stays appropriately unpersonalized depends entirely on the LLM (Track 2)
applying `ANSWER_SYSTEM`'s "ground answers in the provided memories... say so plainly" instruction,
which the offline fallback cannot do.

**K. Does Maya know when Galaxy navigation is useful?** The server-side gate is disciplined (a
small, pre-scoped candidate list) — real navigation JUDGMENT is Track 2, unverifiable here.

**L. Does the complete system feel meaningfully more intelligent than a normal RAG chatbot?**
**At the architecture level: yes** — the epistemic safety rails, temporal reasoning, and
supersession handling go well beyond a plain RAG chatbot, and held up under fresh, realistic,
previously-unseen conversations in this pass. **At the OFFLINE-FALLBACK product-feel level: not
yet** — `HeuristicProvider`'s crude bullet-list prose does not read as "intelligent" regardless of
how good the context feeding it is. This is expected (it's a no-key fallback, not the flagship
experience) but is the honest answer to the literal question.

**M. What is the single biggest remaining weakness?** GraphRAG's core retrieval has no relevance
floor, so with a sparse memory graph or a weak embedding signal, irrelevant memories get treated as
context with equal confidence to genuinely relevant ones — the deterministic layer has no fallback
for "I found nothing actually relevant," leaving that judgment entirely to the LLM.

**N. What should we build NEXT, if anything?** Nothing architectural. Per this phase's own
standard: measure real embedding-model score distributions (not the hash embedder) at realistic
corpus sizes, THEN decide whether a small, evidence-based relevance floor on the primary retrieval
path is warranted — the same "prove it by measurement before changing it" discipline this
codebase already applies to graphics/orbit code. Everything else tested in this pass — temporal
reasoning, supersession, entity continuity, emotional restraint, causal hedging, the Vision/Goal
hierarchy, preference override — is **locked**. Do not add another intelligence phase because the
roadmap has room for one.
