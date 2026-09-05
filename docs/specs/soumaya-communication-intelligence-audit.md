# Audit — Soumaya Communication Intelligence & Personality

> Read-only architecture + design audit. Per this phase's own explicit instruction: **no
> production code changed.** Baseline: commit `7529cee` on `claude/soumaya-second-brain-v1-m4z4hc`
> (Phase Q's KEEP verdict). Status: **audit complete — Class B + Class C, with a scoped instance
> of Class D.**

## 1. Executive Summary

Soumaya's *reasoning* has grown genuinely sophisticated across this session's work — temporal
intelligence, causal reasoning, emotional pattern detection, entity continuity, relevance,
Journey-aware retrieval, learned interaction preferences. This audit traced, file by file, whether
that sophistication actually reaches the words the user reads. The honest answer is split:

**Inside live chat, it mostly does.** `ANSWER_SYSTEM` (the prompt driving every cloud-LLM reply)
already contains a genuine, explicit **communication-strategy layer** — separate from and given
more prominence than its fact-grounding instructions — covering length-mirroring, when to lead
with insight vs. just respond, an emotional-register-to-`mood` mapping, and a strict ask-back
policy. Soumaya's own identity (`soul.md`), the user's derived "about me" profile, their
recent-behavior delivery guidance (`deriveBehavior()`), and their evidence-gated learned
communication preferences all reach the LLM as distinct, purpose-built inputs. This is not a
flattened fact-dump — it is a real, if implicit, first draft of the "Communication Strategy"
concept this phase asked to investigate.

**Outside live chat, none of it exists.** Every proactive/job/notification surface — the
tool-router's 9 tools, the maintenance job loop, the daily digest, toasts, banners, milestones —
is its own independently hand-authored template system, with **zero access** to Soumaya's soul,
the user's derived persona, their learned interaction preferences, their current behavioral state,
or (with a couple of narrow exceptions) any emotional/contextual awareness at all. A bill-risk
nudge fires the identical sentence whether the user is having their best week or their worst. The
five `*SnapshotText` functions that DO feed rich intelligence into chat are never called from
anywhere else — Chat and "everything else" are architecturally disconnected communication
systems, not one system with two entry points.

**Classification: B (shared communication-layer gap) + C (multiple communication-system
fragmentation)**, with a scoped instance of **D** (a few proactive surfaces detect something
real and simply never ask whether current context should change how — or whether — to say it).
The smallest coherent fix is not "give every surface an LLM call" — it's extracting the
communication-strategy inputs Chat already assembles into a shared, reusable representation that
proactive communication can consult too, gated so it costs nothing when nothing changed.

## 2. Current Communication Architecture

There is no single architecture — there are, empirically, at least four independent
text-generation systems in this codebase today:

1. **Live chat** (`packages/server/chat/graphrag.ts` → `llm/prompts.ts`'s `composeSystem`/
   `ANSWER_SYSTEM` → a cloud provider or the offline heuristic). Has an explicit style layer.
2. **Tool-router messages** (`packages/server/src/agent/tools/*.ts`) — 9 independent tools, each
   with its own hand-written template string(s), triggered every 60s.
3. **Maintenance/job loop** (`packages/server/src/maintenance/agent.ts` + `jobRationale.ts`) —
   another independent template system for `agent_logs.description` and the "why she chose this"
   explainer text.
4. **UI-side static copy** (toasts, empty states, banners, milestones, the idle "fly-by" hail-line
   pool in `App.tsx`) — hand-authored JSX/string literals with zero connection to any server-side
   reasoning or phrasing system.

A handful of narrow LLM-authored exceptions exist outside chat (contradiction-insight text,
synthesis-insight text, the daily-log job's content, `weekly_review`'s optional voicing, and
`web_lookup`'s grounded answer) — each independently wired to the LLM, none sharing infrastructure
with chat's `composeSystem`/`ANSWER_SYSTEM` layer or with each other.

## 3. Complete Communication-Surface Inventory

| Surface | Mechanism | File(s) | Voice quality |
|---|---|---|---|
| Live chat reply | LLM, full communication-strategy prompt | `chat/graphrag.ts`, `llm/prompts.ts`, `llm/gemini.ts`, `llm/openai.ts` | Rich, context-aware |
| Offline chat fallback | Deterministic, coarse regex mood branch | `llm/heuristic.ts` | Bucketed, not personalized |
| Tool-router: reminder | Template | `agent/tools/reminder.ts` | Flat, context-free |
| Tool-router: orphan nudge | Template | `agent/tools/orphan.ts` | Flat |
| Tool-router: check-in | Template (2-way branch: heavy/contradiction) | `agent/tools/checkin.ts` | Flat |
| Tool-router: task creator | Template | `agent/tools/taskCreator.ts` | Flat |
| Tool-router: review nudge | Template | `agent/tools/reviewNudge.ts` | Flat |
| Tool-router: web lookup | LLM content in a fixed shell | `agent/tools/webLookup.ts` | Mixed |
| Tool-router: weekly review | Template, **optionally LLM-upgraded** | `agent/tools/weeklyReview.ts` | Mixed, inconsistent |
| Tool-router: chart discovery | Static lore templates | `agent/tools/chartDiscovery.ts` | Flat but flavorful |
| Tool-router: bill risk | Template, explicitly documented LLM-free | `agent/tools/billRisk.ts` | Flat, context-free |
| Tool-router: finance freshness | Template | `agent/tools/financeFreshness.ts` | Flat |
| Maintenance job log text | Template (synthesis/pruning/calibration/etc.) | `maintenance/agent.ts` | System-log flavored |
| Maintenance job rationale | Template, explicitly "never an LLM call" | `maintenance/jobRationale.ts` | Explainer/dashboard |
| Daily-log job content | LLM | `maintenance/agent.ts` (`generateDailyLog`) | Narrative |
| Daily digest greeting/take/closing | Template, explicitly "NO LLM call" | `synthesis/dailyDigest.ts` | Soumaya-voiced, scripted |
| Contradiction insight text | LLM | `synthesis/contradictions.ts` | Prose |
| Synthesis insight text | LLM | `maintenance/agent.ts` (`synthesize`) | Prose |
| Daily-contact question | Template, explicitly no LLM to ask | `analysis/dailyContact.ts` | Soumaya-voiced |
| Foresight heads-up | Template, explicitly no LLM | `analysis/foresight.ts` | Soumaya-voiced |
| Toasts (106 call sites) | Template/relay only, never LLM | `web/src/components/*.tsx`, `App.tsx` | Mixed dashboard/flavored |
| NotificationsBar alerts | Template | `web/src/components/NotificationsBar.tsx` | Dashboard |
| Empty states / Welcome copy | Static | Various panels, `WelcomeIntro.tsx` | Instructional |
| Achievements/Codex/milestones | Static tables | `achievements.ts`, `chartDiscovery.ts` | Flavored labels |
| Idle "fly-by" hail lines | Static random pool | `App.tsx` | Soumaya-voiced, scripted |
| Telegram freeform Q&A | **Reuses `chat()` directly** | `telegram/bot.ts` | Same as live chat |
| Telegram `/digest`, `/log` | Template wrapping `buildDailyDigest` | `telegram/bot.ts` | Dashboard-ish |

## 4. Chat Generation Trace

```
question (+ history)
  → embed(question)
  → vector KNN + BM25 + RRF  →  seed ids  →  1-hop graph expansion  →  ids
  → NodesRepo.byIds(ids)  →  context: ContextNode[]  (WHAT — facts)
  → 8 best-effort snapshot texts assembled into systemExtra:
       financialSnapshotText / peopleSnapshotText / cognitiveSnapshotText /
       temporalSnapshotText / intelligenceSnapshotText / emotionalSnapshotText /
       interactionPreferenceSnapshotText / deriveBehavior()   (WHAT + some HOW)
  → persona = refreshPersona()  (WHAT — who the user is, deterministic SQL)
  → soul = soulTextFor()  (HOW — Soumaya's own identity/voice, per-space overridable)
  → galaxyCandidates = buildNavigationCandidateList()  (bounded side-channel)
  → deps.llm.answer(question, context, { soul, systemExtra, persona, knowledge,
      history, justAsked, galaxyCandidates })
       → composeSystem(opts): ANSWER_SYSTEM + live timestamp + soul + persona + systemExtra
       → cloud provider: JSON-schema-constrained generation, returns
         { answer, citations, mood, askBack, usedRoles, navigationCandidates,
           interactionPreferenceSignal }
       → offline fallback (HeuristicProvider): coarse regex mood branch + bulleted
         top-5 context, no persona/behavior/preference reasoning at all
  → citations validated against context; navigationCandidates re-resolved server-side
    (never trusted from the LLM directly); interactionPreferenceSignal recorded only
    if well-formed (still requires repeat evidence before it changes anything)
  → ChatResponse { answer, citations, contextIds, tone, mood, askBack, appliedRoles,
      appliedDocs, navigation }
```

**Where intelligence is NOT lost in this trace**: `ANSWER_SYSTEM` (`llm/prompts.ts:179-265`)
explicitly separates "how to talk" from "what to say," and states the how-to-talk instructions
matter "more than anything else below." It instructs: mirror the user's length/register; vary
opening shape every turn; default to 1-3 sentences; judge per-turn whether insight is warranted or
whether "the human, intelligent thing is to just respond"; map the emotional register of the
message + retrieved memories onto a 7-value `mood`; and gate follow-up questions hard (never two
turns in a row, at most one, only when it earns its place). `deriveBehavior()`
(`persona/behavior.ts`) is a second, fully deterministic delivery-guidance layer computed from the
user's *recent* behavior vs. their own baseline (mood trend/volatility, writing-rhythm-driven
reply-length calibration, sensitive-zone avoidance, engagement calibration) — explicitly labeled
"let this shape your DELIVERY, silently; never recite it." `interactionPreferenceSnapshotText()`
is a durable, evidence-gated, open-taxonomy preference layer (`STARTING_CONFIDENCE=0.3`,
`CONFIDENCE_BUMP=0.25`, requires ≥2 consistent observations before surfacing) — genuinely learned,
not hard-coded, and explicitly framed as advisory ("an explicit instruction in THIS message always
wins").

**Where intelligence IS still lost or under-used in this trace**:
- The five `*SnapshotText` functions are 100% deterministic template strings with **zero
  personalization hook** — none takes the user's learned interaction preferences, current
  emotional state, or `deriveBehavior()`'s read as an input. Each generates the exact same
  briefing text for a given DB state regardless of what's known about how this user wants to be
  talked to. This is defensible (they're reasoning material for the LLM, not user-facing prose —
  see §7), but it means all personalization currently happens in one place (the final LLM call),
  with no earlier stage able to shape which facts even get surfaced or how much room they get.
- `cognitiveSnapshotText` is the flattest of the five — a bare `icon label: name pct%, name pct%`
  line with no qualitative framing (no momentum, no staleness, no "this hasn't moved in weeks"),
  even though sibling modules (`temporalContext.ts`, `emotional.ts`) compute and surface exactly
  that kind of nuance for their own domains.
- `emotionalSnapshotText`'s per-pattern-type intervention sentence is **fixed regardless of
  strength** — a stress cycle that just crossed the 2-dip threshold gets the identical wording as
  one recurring 8 times; only the interpolated `(recurred Nx...)` count differs, never the
  confidence/tone of the sentence itself.
- `getGroundedInsight()` (`identity.ts`) is a per-space toggle described as changing Soumaya's
  reflection style (evidence-grounded/falsifiable vs. warmer/looser) — but no reference to it
  appears in `ANSWER_SYSTEM`'s text; whether/how it's actually threaded into the prompt needs a
  follow-up check before assuming it works (flagged as an open question, §21).

## 5. Proactive/Job Generation Trace

```
scheduled tick (60s tool-router, or the maintenance/autonomy job loop)
  → SOURCE DATA: budget summary / node table / bill occurrences / node degree, etc.
      (each tool/job reads only the narrow slice of state it personally needs)
  → DETECTION: a hand-written condition specific to that one tool
      (e.g. billRisk: shortfallCents > 0 OR safeToSpendCents <= atRisk.amountCents)
  → MESSAGE: a hand-written template string, specific to that one tool, with ZERO
      access to soul/persona/deriveBehavior/interactionPreferences/emotionalSnapshot
  → agent_logs.description = message  (or telegram notify, or nothing until read)
  → (sometimes) relayed verbatim into a web toast via pushToast(l.description, ...)
```

Every tool/job in this trace independently decides (a) whether something is worth mentioning and
(b) how to phrase it, with no shared "should I say something, and how" step. Concretely:
`billRiskTool`'s message is one of exactly two fixed sentences chosen by a `mode` flag
(`"short"`/else) — it never asks whether this user, right now, would rather hear it briefly or
with more reassurance, even though `deriveBehavior()` already computes exactly that kind of signal
for chat. `reminder.ts`'s fired text is `⏰ Reminder: "${label}"` regardless of how many times this
reminder has already fired, how the user reacted last time, or anything else. The one tool that
crosses into LLM territory (`weeklyReviewTool`) does so with its own separate call
(`generateDailyLog`), not through `composeSystem`/`ANSWER_SYSTEM` — so even the ONE proactive
surface that does use the LLM is not using Chat's communication-strategy prompt, just a different,
narrower LLM call with its own implicit voice.

**Intelligent detection ≠ intelligent communication, confirmed concretely**: `billRiskTool`
correctly detects a real, meaningful financial risk using the same deterministic Budget Engine
chat relies on — but having detected it, it never asks whether *now* is a good time to raise it,
never adapts its phrasing to how the user has been doing lately (even though `deriveBehavior()`'s
"HEAVIER stretch than normal → lead gently" signal already exists and is a single function call
away), and never varies its wording across repeated firings for the same underlying situation.

## 6. Deterministic vs. LLM-Generated Communication Map

| Generator | LLM? | Notes |
|---|---|---|
| Chat (cloud) | Yes | Full `composeSystem`/`ANSWER_SYSTEM`, structured output |
| Chat (offline heuristic) | No | Coarse regex mood, bulleted context, fixed templates per bucket |
| 8 of 9 tool-router tools | No | `weekly_review` conditionally upgrades to LLM |
| `web_lookup` tool | Yes (wrapped) | LLM content inside a fixed deterministic shell |
| Maintenance job `agent_logs.description` | No | Except `daily_log`'s underlying content |
| `daily_log` job content | Yes | Separate `generateDailyLog` call, not `composeSystem` |
| Job rationale (objective/why/benefit) | No | Explicitly documented as never LLM |
| Daily digest (greeting/take/closing) | No | Explicitly documented as "NO LLM call" |
| Contradiction insight text | Yes | `llm.detectContradiction`, separate call |
| Synthesis insight text | Yes | `llm.synthesize`, separate call |
| Daily-contact question | No | Explicitly documented as no LLM needed to ask |
| Foresight heads-up | No | Explicitly documented as no LLM |
| All 106 toast call sites | No | Templates, or verbatim relay of an already-built server string |
| NotificationsBar, empty states, milestones, hail lines | No | Static |

**Every LLM call outside live chat is its own independent call with its own implicit prompt** —
none of `generateDailyLog`, `detectContradiction`, `synthesize`, or `webLookup` route through
`composeSystem`/`ANSWER_SYSTEM`, so none of them inherit Chat's soul/persona/behavior/preference
layering. This is a second, narrower instance of the fragmentation finding: even the parts of the
non-chat system that DO use an LLM aren't using the SAME LLM-facing communication infrastructure
chat uses.

## 7. Where Intelligence Is Currently Lost or Flattened

Ranked by where the actual gap lives, most to least severe:

1. **Proactive/job surfaces never consult ANY of the communication-strategy inputs Chat already
   assembles.** Not soul, not persona, not `deriveBehavior()`, not interaction preferences, not
   emotional-pattern context. This is the largest, most consistent finding across the whole audit
   — not a bug in any one file, but the absence of a shared layer these ~15+ independent template
   systems could all read from.
2. **UI panel copy (WealthPanel/FinancePanel/JourneysPanel/MindPanel) is completely static and
   hand-authored, disconnected from any server-side reasoning.** `⚠️ Your current financial
   position is below the amount you've earmarked...` is byte-identical the first time it fires and
   the fiftieth, for a $5 shortfall and a $500 shortfall, for a user having a great week and a
   terrible one.
3. **`cognitiveSnapshotText`'s flat per-kind line drops nuance its own sibling modules already
   compute elsewhere** — this is a real, narrow instance of a Chat-facing snapshot losing
   qualitative signal it could plausibly carry (momentum, staleness), not a case of the LLM never
   seeing the raw numbers.
4. **`emotionalSnapshotText`'s intervention wording never scales with pattern strength** — a
   correctly-detected weak signal and a correctly-detected strong signal get the same sentence.
   This is a real but narrow templating gap inside an otherwise well-designed function (the
   surrounding hedge — "a recurring SIGNAL, never a settled fact" — is exactly right; only the
   per-pattern intervention text itself doesn't flex).
5. **Live chat itself is the ONE surface where intelligence mostly does reach communication** —
   the fact-grounding functions are deliberately raw/templated because they're meant to be
   *reasoned over*, not read verbatim, and the actual communication-strategy layer sitting on top
   of them (`ANSWER_SYSTEM`, soul, behavior, preferences) is genuinely working as designed. The
   audit did NOT find chat itself to be the primary source of staleness — it found chat to be the
   one part of the product already doing roughly the right thing, and everything else failing to
   reuse it.

## 8. Existing Personality Architecture

**Soumaya's own stable identity** lives in `soul.md` (repo root), loaded once and cached, injected
under "YOUR DEEPER CHARACTER — stay true to this voice, values, and boundaries" in
`composeSystem`. It is per-space overridable (`space_meta.soul`) but falls back to the shared file
— this is the closest thing in the codebase to a canonical "who Soumaya is" text, and it is
**chat-only**: no non-chat surface reads `soulTextFor()` at all.

`ANSWER_SYSTEM`'s own hard-coded behavioral rules (mirror length/register, vary opening shape,
default short, judge insight-vs-respond, gate questions) function as a SECOND layer of stable
identity — arguably more load-bearing day to day than `soul.md` itself, since it's the same for
every space and isn't overridable. These rules are also **chat-only**.

`getGroundedInsight()` is a per-space stylistic toggle (grounded/falsifiable vs. warmer/looser) —
its actual wiring into the prompt could not be confirmed from the files read in this pass (flagged
as an open question, §21).

## 9. Existing Interaction-Preference Architecture

`analysis/interactionPreferences.ts` is a genuinely well-designed, reusable piece of
infrastructure that this audit recommends building on rather than replacing:
- **Open taxonomy, not a fixed dimension list** — a preference is any `{signal, value}` string
  pair the LLM itself proposes ("invent whatever fits, there is no fixed list" —
  `llm/prompts.ts:260`), not a closed `verbosity|formality|...` enum. This directly satisfies this
  phase's own instruction (§7) not to hard-code stereotyped dimensions — the mechanism already
  learns whatever the user actually demonstrates, in their own terms.
- **Evidence-gated, two-threshold confidence model**: `STARTING_CONFIDENCE=0.3`,
  `CONFIDENCE_BUMP=0.25` per consistent repeat (capped at `MAX_CONFIDENCE=0.9`, never "certain"),
  `SURFACE_CONFIDENCE_THRESHOLD=0.5`, `MIN_EVIDENCE_TO_SURFACE=2` — mathematically, a single
  mention can never surface (`0.3 < 0.5`); a conflicting later value resets the counter rather than
  silently overwriting. This is exactly the kind of "durable preference vs. one-off signal"
  distinction a communication-strategy layer needs, already built.
- **Currently chat-only.** `interactionPreferenceSnapshotText()` is called from nowhere but
  `graphrag.ts`. Every proactive surface fires its fixed template with zero awareness that this
  user has, say, told Soumaya three times to be more concise.

## 10. Current Emotional/Contextual Communication Handling

`analysis/emotional.ts` already draws the exact distinction Part 6 of this mission asked about —
a single heavy memory produces `patterns: []` and `emotionalSnapshotText()` returns `null`
(nothing said); only a *recurring* pattern (≥2 dip-days, a real bright-to-heavy shape, a real
slope, real variance) is surfaced, and even then it's framed as "a recurring SIGNAL, never a
settled fact... or a reason to treat any goal/vision/preference as changed." This is a
**stable-identity-safe** way to let current emotional trajectory influence chat without ever
diagnosing or overclaiming — and it is currently the ONLY place in the codebase that does this.
`deriveBehavior()` (persona/behavior.ts) is the closer analog to "current conversational state"
this mission's Part 6 describes — mood trend/volatility vs. the user's OWN baseline, sensitive-zone
avoidance, writing-rhythm-driven length calibration — again chat-only.

**No proactive surface has anything equivalent.** `billRiskTool` doesn't check whether the user is
currently in a detected stress cycle before firing a money-anxiety-adjacent nudge; `checkin.ts`'s
"heavy" branch is a single fixed sentence with no connection to `emotional.ts`'s actual pattern
detection (it appears to use its own, separate heaviness signal — worth confirming in a follow-up
pass, flagged in §21).

## 11. Specific Stale-Communication Examples

Six representative examples, one per surface family, each showing what's actually available today.

**1. Chat — `emotionalSnapshotText`'s fixed intervention wording**
- Current: `- Stress cycle around "work" (recurred 3x among the memories relevant here): These
  heavy dips keep recurring — note what tends to precede them and plan a small recovery ritual
  around that trigger.`
- Why stale: identical sentence whether `repeats` is 2 or 20; the LLM downstream can still vary
  its own phrasing, but the RAW MATERIAL it reasons from doesn't distinguish "just crossed the
  threshold" from "a well-established pattern."
- Intelligence available: `repeats` count, `trend`/`volatility` from the same trajectory object.
- Missing from communication: any severity-scaled framing in the source material itself.
- Better strategy would consider: whether this is a new-vs-established pattern, and whether
  `deriveBehavior()`'s own trend read already said something similar this week (avoid redundancy).
- Possible improved raw material (not final wording — that's still the LLM's job): distinguish
  `justCrossedThreshold` vs. `wellEstablished` in the interpolated text so the downstream LLM has
  something to calibrate against, instead of one fixed adjective set for every strength.

**2. Financial (proactive) — `billRiskTool`'s fixed nudge**
- Current: `💸 Heads up — you're $37 short for Rent ($1200). A little more income this week, or one
  extra shift, covers it.`
- Why stale: identical structure and tone every single time this fires, for any user, regardless
  of how many times they've seen it this month or how they're doing generally.
- Intelligence available but unused: `deriveBehavior()`'s trend/volatility read,
  `interactionPreferenceSnapshotText()`'s learned verbosity/directness, whether this exact bill has
  triggered the nudge before (repetition awareness).
- Missing from communication: any adaptation at all — this is the starkest example in the audit of
  "detection is intelligent, communication is not."
- Better strategy would consider: has this fired before for this bill (say it differently, or more
  briefly, the second time); is the user in a currently-heavier stretch (soften, don't pile on).

**3. Journey — `JourneysPanel.tsx`'s empty-link state**
- Current: `Nothing linked yet — connect a memory, task, or transaction from where you're already
  working.`
- Why stale: identical for a Journey created 5 minutes ago and one that's been open, empty, for
  three months — very different situations that arguably warrant different framing.
- Intelligence available: the Journey's own `createdAt`/`updatedAt`, already computed by
  `temporalSnapshotText`'s "stale" bucket logic for the SAME Journey in a completely different code
  path (chat), never reaching this UI string.
- Missing from communication: any connection at all between the panel's static copy and the
  temporal-freshness intelligence the codebase already computes elsewhere.

**4. Mind — `cognitiveSnapshotText`'s flat progress line**
- Current: `🎯 Goals: Run a marathon 40%, Pay off credit card 85%`
- Why stale: no distinction between a goal that just moved from 10%→40% this week and one that's
  been stuck at 40% for months — both render identically.
- Intelligence available: `temporalContext.ts`'s own "stale (hasn't been updated in a while)"
  classification already exists and is applied to Journeys/Wealth/Life Vision/People in the SAME
  function family — just never cross-referenced against cognitive-object progress.
- Missing from communication: momentum/staleness framing that a sibling function already knows how
  to compute.

**5. Life Vision / Goal — `WealthPanel.tsx`'s over-committed warning**
- Current: `⚠️ Your current financial position is below the amount you've earmarked toward goals
  by $150. Nothing was changed automatically — you decide what, if anything, to withdraw.`
- Why stale: byte-identical for a $5 shortfall and a $500 one, and for the first time it's ever
  happened vs. the tenth consecutive week.
- Intelligence available: the exact severity number is already in scope
  (`summary.deployableCents`); repetition-awareness would need a small new signal (how many prior
  periods showed this same state) — not currently tracked anywhere, a genuine gap rather than an
  unused existing signal.
- Missing from communication: any severity or repetition-aware framing.

**6. Proactive job — `reminder.ts`'s fired text**
- Current: `⏰ Reminder: "Call the dentist"`
- Why stale: no acknowledgment of how overdue it is, how many times it's already fired, or
  anything about the user's current state.
- Intelligence available: `remind_at` vs. now (overdue duration), and — same as example 2 —
  `deriveBehavior()`'s current-state read, entirely unused here.
- Missing from communication: everything except the raw label.

## 12. Communication Intelligence Gap Analysis

The gap is not "the LLM isn't smart enough" and not "the detection logic is wrong" — every
detection mechanism audited (bill risk, emotional patterns, temporal freshness, contradictions)
is sound and already reasoned about carefully by prior phases. The gap is structural: **there is
no shared boundary between "reasoning/state" and "language generation" that anything other than
live chat can plug into.** Chat built its own version of that boundary (`composeSystem` +
`ANSWER_SYSTEM` + soul + persona + behavior + preferences) without anyone else being able to reach
it, and every other surface independently reinvented a much thinner version (a hand-written
template, sometimes with an ad-hoc LLM call bolted on) with none of the same inputs.

## 13. Proposed Conceptual Architecture

The mission's own conceptual model (§5 of the brief) maps cleanly onto pieces that already exist:

```
USER EVENT / SYSTEM EVENT           (a chat message, a scheduled tick, a detected change)
        ↓
UNDERSTANDING                       (already exists per-surface: embed(question), or a
                                      tool's own detection condition)
        ↓
RETRIEVAL                           (already exists in chat: KNN+BM25+RRF+hop; proactive
                                      surfaces already read the narrow state they need)
        ↓
STATE RECONSTRUCTION                (the *SnapshotText functions, ALREADY BUILT — currently
                                      chat-only; this is the layer worth sharing first)
        ↓
REASONING                           (temporal/causal/emotional/relevance/intelligence —
                                      LOCKED, already correct, already feeds chat)
        ↓
EMOTIONAL / CONTEXTUAL STATE        (emotionalSnapshotText + deriveBehavior — ALREADY BUILT,
                                      currently chat-only)
        ↓
USER COMMUNICATION PROFILE          (interactionPreferences.ts — ALREADY BUILT, evidence-gated,
                                      open-taxonomy, currently chat-only)
        ↓
COMMUNICATION STRATEGY              (currently IMPLICIT inside ANSWER_SYSTEM's prose rules —
                                      THE ONE GENUINELY MISSING PIECE: an explicit, reusable
                                      representation any surface could consult, not just a
                                      prompt instruction only the cloud LLM ever sees)
        ↓
LANGUAGE GENERATION                 (an LLM call for chat; for proactive surfaces, could remain
                                      a template MOST of the time — see §17)
        ↓
SOUMAYA
```

**The finding this ordering makes obvious**: almost every layer already exists and already works.
The gap is narrower than "build a communication intelligence system from scratch" — it's "extract
the Communication Strategy layer that currently lives only inside one LLM's prompt into a shared,
inspectable representation, and give proactive surfaces a cheap way to consult it."

## 14. Personality vs. Learned Style vs. Current State

Mapped directly onto what already exists, confirming the mission's Part 6 three-part model is
already latent in the codebase, just not named or shared:

- **Stable Soumaya identity** → `soul.md` / `soulTextFor()` + `ANSWER_SYSTEM`'s hard-coded
  behavioral rules. Already stable, already chat-only, already correctly described as identity
  ("stay true to this voice, values, and boundaries").
- **Learned user communication preference** → `interactionPreferences.ts`. Already open-taxonomy,
  already evidence-gated, already explicitly advisory rather than a hard rule. Reuse as-is.
- **Current conversational/contextual state** → `deriveBehavior()` (recent behavior vs. own
  baseline) + `emotionalSnapshotText()` (recurring pattern detection, explicitly not a settled
  fact). Already computed, already chat-only, already careful not to overclaim.

The mission's own worked example — a normally playful user discussing a serious loss should not
get playful language just because their historical preference says humor is welcome — is EXACTLY
the shape `ANSWER_SYSTEM`'s existing rule already covers ("READ THE EMOTIONAL REGISTER... judge
the weight of their message + the memories, and match it") combined with the explicit precedence
rule already stated elsewhere in the prompt (an explicit instruction in THIS message always wins
over a learned preference). **This distinction does not need to be invented — it needs to be
extracted from one LLM's prompt into something every surface can consult**, since right now only
the cloud LLM ever sees this reasoning; a proactive job has no equivalent check at all.

## 15. Proposed Communication Strategy Representation

Evaluating the mission's candidate dimension list against what's ALREADY captured by an existing
mechanism, what's genuinely missing, and what should stay implicit/LLM-emergent:

| Dimension | Already covered by | Verdict |
|---|---|---|
| Directness, verbosity | `interactionPreferences.ts` (open taxonomy — these are just two of the strings the LLM has already proposed in this exact shape) | **Reuse, don't rebuild** |
| Formality, humor, technicality | Same — no reason these can't already be signals in the same open taxonomy | **Reuse, don't rebuild** |
| Emotional sensitivity, warmth | `deriveBehavior()` ("lead gently," sensitive-zone list) + `ANSWER_SYSTEM`'s emotional-register rule | **Reuse, don't rebuild** |
| Whether to ask a question | `ANSWER_SYSTEM`'s explicit ask-back policy + `justAsked` history check | **Reuse, don't rebuild** |
| Whether to lead with insight vs. facts | `ANSWER_SYSTEM`'s "WHEN to be insightful" block | **Reuse, don't rebuild** |
| Urgency, action-orientation | Partially present in `financialSnapshotText`'s framing instructions ("Be concrete... show the rough math") but NOT in any proactive surface | **Real gap for proactive only** |
| Challenge level, skepticism | Present in `ANSWER_SYSTEM`'s "willing to challenge" identity trait (Part 6's stable-identity list) but not separately tunable | **Leave emergent from LLM** — making this a numeric dial risks exactly the mechanical, over-engineered feel this phase warns against |
| Energy, seriousness, structure, conversationality | Best left **emergent from the LLM's own judgment** given the inputs above — the mission's own Part 8 explicitly warns against manufacturing "human-sounding" behavior with surface tricks; turning these into explicit dials risks the opposite failure (a checklist-driven, mechanical voice) |

**Recommendation**: the Communication Strategy representation should be a **thin, mostly-reused
bundle** — `{ soul, persona, behaviorGuidance, learnedPreferences, currentEmotionalContext }` — not
a new, large, independently-scored dimension system. The dimensions this phase brainstormed
(directness, verbosity, formality, etc.) already have a home in `interactionPreferences.ts`'s
open-taxonomy design; inventing a parallel, closed-schema version would be exactly the "competing
preference system" the mission explicitly warns against (§6/§11).

## 16. Shared-vs-Surface-Specific Architecture

**Should be shared** (all already exist, all currently chat-only — this is the actual proposal):
- `soulTextFor()` — Soumaya's identity.
- `refreshPersona()` — who the user is.
- `deriveBehavior()` — current-state delivery guidance.
- `interactionPreferenceSnapshotText()` / the underlying preference rows — learned style.
- `emotionalSnapshotText()`'s pattern detection (or a bounded subset of it) — current emotional
  context, WHEN a proactive surface's own subject matter is emotionally adjacent (e.g., a bill-risk
  nudge, not e.g. a routine "Codex entry discovered" note).
- The epistemic discipline already present throughout (`intelligence.ts`'s "never a settled fact"
  framing, `emotionalSnapshotText`'s "never a reason to treat any goal as changed") — this is a
  SAFETY property, not a style property, and should travel with any shared layer wholesale.

**Should stay surface-specific**:
- The actual trigger/detection logic per tool/job (bill-risk math, orphan-node detection,
  contradiction scanning) — these are domain logic, correctly isolated today, LOCKED per §13 of
  the mission.
- Whether a given surface uses an LLM call at all vs. a template (see §17 — most proactive
  communication should very likely remain template-based even after this change).
- UI-only concerns (toast duration, icon choice, sound cue) — presentation, not communication
  intelligence.

**Avoid duplicating**: a second interaction-preference store, a second persona/identity file, a
second emotional-detection pipeline. Every one of these already exists in a locked, working form —
the fix is exposing them to more callers, not building parallel versions.

## 17. Performance/Cost Considerations

**Not every message needs an LLM call, and most proactive communication should keep NOT using
one.** Concretely:

- The shared inputs proposed in §16 are ALL already cheap, deterministic, DB-backed reads
  (`interactionPreferenceSnapshotText`, `deriveBehavior`, `soulTextFor`, `refreshPersona` are all
  either simple queries or SQL aggregation — none call an LLM themselves, confirmed directly in
  the trace). Making these available to a proactive tool costs the same handful of indexed reads
  it would cost inside chat — negligible, and several (`refreshPersona`) are already cached with a
  staleness window (6h) precisely so repeated reads are free.
- A **deterministic communication-strategy decision** (e.g., "this bill-risk nudge has fired for
  the same bill in the last 7 days — soften/shorten it" or "the user is in a currently-detected
  heavier stretch — lead with acknowledgment, not urgency") can be made by simple rules over these
  already-cheap inputs, exactly the same way `billRiskTool` already makes its OWN detection
  decision deterministically today. **This does not require adding an LLM call to reminders, bill
  risk, orphan nudges, or any of the other purely-deterministic tools.**
- Where an LLM is already involved (`weekly_review`, `daily_log`, contradiction/synthesis
  insights, `web_lookup`), routing that ONE call through the shared `composeSystem`-style
  assembly (so it at least inherits soul/persona/behavior/preferences) is a bounded, one-time
  integration cost per call site — not a new class of spend.
- **Explicit anti-pattern to avoid**: adding an LLM call purely to "rewrite" an already-correct
  deterministic sentence into something that sounds more like Soumaya. The evidence in this audit
  suggests the better fix is almost always "give the deterministic template access to one more
  already-computed signal" (repetition count, current-behavior read, learned verbosity), not
  "outsource phrasing to an LLM that wasn't asked to reason about anything new."

## 18. Safety/Epistemic Considerations

Every locked intelligence system this audit touched already enforces its own epistemic discipline
at the SOURCE (contradictions/persisting-themes are "observations, never settled facts";
emotional patterns are "a recurring SIGNAL, never... a reason to treat any goal/vision/preference
as changed"; navigation candidates are re-resolved server-side, never trusted from the LLM
directly). **A shared communication layer must preserve these disclaimers as data, not just as
prose** — if `emotionalSnapshotText`'s pattern object flows into a proactive surface's decision
logic, that surface must inherit the same "signal, not settled fact" discipline, not silently
launder it into a more confident-sounding proactive message than chat itself would ever produce
for the same evidence. This is the main safety risk of doing this work carelessly: making
proactive communication feel more intelligent while accidentally making it MORE prone to
overclaiming than chat currently is, since chat's discipline lives in prompt text a shared layer
wouldn't automatically carry over to a template-based consumer.

## 19. What Should NOT Change

Per the mission's explicit lock list (§13), all confirmed untouched and not implicated by any
finding in this audit: temporal intelligence, causal intelligence, emotional intelligence
(detection logic itself — only its OUTPUT's reach is the finding), contradiction/supersession,
entity continuity, relevance architecture, embeddings, BM25/RRF, graph traversal, interaction
preference architecture (extend its callers, not its design), Journey-aware retrieval, Galaxy
entity architecture, the historical truth model, the epistemic model. Also explicitly should NOT
change per this audit's own findings: `ANSWER_SYSTEM`'s core behavioral rules (they're working),
`soul.md`'s role as Soumaya's identity source, the open-taxonomy design of
`interactionPreferences.ts` (do not replace with a closed dimension schema), and the deterministic,
LLM-free design of `dailyDigest.ts`/`dailyContact.ts`/`foresight.ts`/`jobRationale.ts` (their
being template-based is a documented, deliberate choice, not an oversight — the fix is giving them
MORE inputs, not converting them to LLM calls).

## 20. Recommended Implementation Phases

Sequenced smallest-first, each independently shippable and testable, per the mission's own
"smallest coherent solution" instruction:

1. **Extract a `CommunicationContext` read function** (server-side, pure, no LLM) that bundles
   `soulTextFor`, `refreshPersona`, `deriveBehavior`, `interactionPreferenceSnapshotText`'s
   underlying rows, and (bounded) `emotionalSnapshotText`'s pattern list into one reusable
   read — literally just refactoring existing call sites in `graphrag.ts` behind one function, no
   new intelligence, no new LLM calls, no schema change.
2. **Give ONE proactive surface (the clearest case: `billRiskTool`, per §11 example 2) access to
   this context** and let its EXISTING deterministic template branch on ONE more signal (e.g.,
   "has this fired for this bill recently → use the gentler/shorter variant already defined") —
   proves the wiring works end-to-end without inventing new detection logic or adding an LLM call.
3. **Extend to the other purely-deterministic tools** (reminder, orphan, check-in, review-nudge,
   finance-freshness) once the pattern from step 2 is validated — same shape, no LLM.
4. **Route the already-LLM-using non-chat call sites** (`weekly_review`, `daily_log`,
   contradiction/synthesis, `web_lookup`) through a shared prompt-assembly helper so they at least
   inherit soul/persona/behavior/preferences, closing the "second-class LLM call" gap from §6.
5. **Only after 1-4 are shipped and observed**, revisit whether `cognitiveSnapshotText`'s flat
   template or `emotionalSnapshotText`'s fixed-strength intervention wording (§7 items 3-4) are
   still worth improving — these are real but narrow, and lower priority than closing the
   chat-vs-everything-else gap.

## 21. Open Architectural Questions

1. **Is `getGroundedInsight()` actually wired into `ANSWER_SYSTEM`'s text?** This audit found the
   getter and its doc comment but did not confirm its consumption site inside the prompt-assembly
   code — needs a direct follow-up read of `graphrag.ts`'s use of it before assuming it works.
2. **Does `checkin.ts`'s "heavy" branch use `emotional.ts`'s actual pattern detection, or its own
   separate heaviness signal?** If separate, that's a second, smaller instance of the fragmentation
   finding worth folding into the same fix.
3. **Where exactly does `weekly_review`'s LLM-upgrade path sit relative to a future shared
   Communication Strategy layer** — should it be migrated to use it, or is its narrower,
   summary-specific prompt a legitimate permanent exception?
4. **What is the right granularity for "has this exact nudge fired recently" repetition-awareness**
   (§11 example 5's `WealthPanel` case) — this needs a genuinely new small tracked signal (not
   reused from an existing function), and its storage shape (per-bill? per-tool? a generic
   "last shown" table?) is a real design decision for the next phase, not this one.
5. **Should the bounded `emotionalSnapshotText` pattern feed ever reach a surface whose subject
   matter is unrelated to the pattern's trigger** (e.g., should a stress-cycle-around-"work" signal
   ever soften an unrelated Journey-progress nudge)? This audit leans toward "no, scope it tightly
   to emotionally-adjacent surfaces only" but flags it as a genuine judgment call for the design
   phase, not something this audit should decide unilaterally.

## 22. Acceptance Criteria for the Future Implementation Phase

1. At least one proactive surface (recommended: `billRiskTool`) demonstrably varies its
   communication based on at least one previously-unused, already-existing signal
   (`deriveBehavior()`'s current-state read, or a new minimal repetition-awareness signal),
   verified by a real before/after test against the same underlying detected condition.
2. No new interaction-preference schema, personality table, or competing identity file is
   introduced — the implementation reuses `interactionPreferences.ts`, `soul.md`, `persona/*.ts`,
   and `emotional.ts` as-is.
3. Zero new LLM calls are added to any currently-deterministic tool/job (reminder, orphan,
   check-in, review-nudge, bill-risk, finance-freshness, daily digest, daily contact, foresight) —
   they remain template-based, just with richer inputs.
4. Any LLM call that already exists outside chat and gets migrated to shared prompt-assembly
   infrastructure is verified to still produce the SAME class of output it did before (no
   regression in the digest/contradiction/synthesis/weekly-review user experience).
5. Every disclaimer/epistemic-safety framing present at a signal's SOURCE (e.g., "a recurring
   SIGNAL, never a settled fact") is verifiably preserved when that signal reaches a new,
   previously-unreachable consumer — checked explicitly, not assumed.
6. Full gate green (`typecheck && test && build`) with real regression tests for whatever
   surface(s) were touched, following this session's own established "reproduce and measure, don't
   guess" discipline for anything touching generated text.
7. No locked system from §13/§19 has a single changed line — verified by direct diff review, not
   assumption, matching the discipline every prior phase in this session has already held itself to.

## Final Verdict

**Classification: B + C, with a scoped instance of D.**

- **B (shared communication-layer gap)**: proven — Chat already has real communication
  intelligence (soul, persona, behavior, learned preferences, emotional-pattern awareness, an
  explicit style-vs-fact separation in `ANSWER_SYSTEM`); it simply isn't exposed to anything else.
- **C (multiple communication-system fragmentation)**: proven — at minimum four independently
  hand-authored template/generation systems exist (chat, tool-router, maintenance jobs, UI-static
  copy), plus multiple independent narrow LLM calls (`generateDailyLog`, `detectContradiction`,
  `synthesize`, `webLookup`) that don't share prompt infrastructure with each other or with chat.
- **D (deeper intelligence-to-communication gap), scoped**: real but narrow — confirmed in
  `billRiskTool` (detects correctly, communicates without any contextual adaptation) and in
  `cognitiveSnapshotText`/`emotionalSnapshotText`'s specific templating gaps (§7 items 3-4). This
  is NOT a systemic "intelligence never reaches communication" problem — chat itself refutes that —
  but it is real wherever a proactive surface's detection logic runs with zero access to the
  richer context that already exists two files away.

**Recommended smallest next phase**: Implementation Phase 1-2 from §20 — extract the shared
`CommunicationContext` read (pure refactor, zero new intelligence) and prove the wiring on exactly
one proactive surface (`billRiskTool`) before touching anything else. Not implemented in this
phase, per the mission's explicit instruction.
