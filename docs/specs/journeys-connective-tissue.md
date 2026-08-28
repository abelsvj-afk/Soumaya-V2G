# Spec — Journeys Go Live: Capture-Time Linking + Finance/Task Wiring + Journey Detail View

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) / [WORKFLOW.md](../../WORKFLOW.md).
> Parent: [VISION_2_JOURNEYS.md](../VISION_2_JOURNEYS.md). Continues Stage 1 (the capture-time "what
> Journey?" suggestion never got built) and pulls forward the additive, independent half of Stage 4
> (financial/task linkage) ahead of Stages 2-3 (Mission Control, Living Galaxy hubs), since it
> doesn't depend on either and closes the most concrete gap found in a full tab audit. Status:
> **proposed — not yet implemented.** Revised after user review to add hybrid auto-suggest/
> auto-link (see "Suggested Journeys" below) — the original manual-only version is superseded.

## 🎯 Objective

`journey_link` (the join that lets a Journey connect to any memory/task/transaction) is fully
built and validated server-side, but the ONLY place in the entire app that uses it is a private
`JourneyChips` component buried in `NodeInspector.tsx` — and it's explicitly (and, confirmed with
the user, *unintentionally*) disabled for action items. Money, the capture flow, and the Journeys
tab's own detail view have zero linking UI despite the backend already supporting
`income`/`expense`/`bill` link kinds. This spec wires the existing mechanism into the three places
it's missing, makes linking **smart** (relevant Journeys are suggested, not just manually
searched), and gives a Journey a real detail view — so opening one visibly shows the memories,
tasks, and money connected to it, and connecting something new takes one tap instead of a search.

## Suggested Journeys — the hybrid design

The user asked for "autonomous linking... or hybrid relevant things to link showing in those
sections" rather than a plain manual picker. There's real precedent for autonomous linking already
in this codebase: `ingestion/associativeLink.ts` silently auto-links a new memory to existing
memories above **0.72 cosine similarity**, no confirmation needed. Journeys reuses that same
pattern, split by data source:

- **Nodes (memories + tasks) — embedding-based, three tiers.** Every node already has a stored
  embedding (`getEmbedding`, `db/vec.ts`) from ingestion — free to reuse, no new computation. Each
  Journey gets its own embedding (title + description, computed on create/update) stored in a new
  `vec_journeys` table, mirroring the existing `vec_profiles`/`vec_docs` tables exactly (same
  `upsert*`/`delete*`/`knn*` shape as `db/vec.ts` already has for profiles).
  - **≥ 0.72 similarity → auto-link silently**, same threshold and same "just do it" confidence
    bar as the existing memory-to-memory auto-linking. A small toast ("🧭 Linked to Nursing
    School") makes it visible and unlink is always one tap away in the chips — nothing is
    irreversible.
  - **0.40–0.72 → surface as a "✨ Suggested" chip**, one tap to confirm. Not auto-linked; shown
    above the regular "＋ Add" list in `JourneyChips`.
  - **< 0.40 → not shown.**
  - This is a genuinely *local* embedding model (`embeddings/local.ts`, transformers.js, no cloud
    key, already running for every ingested memory) — adding this does not introduce a new AI/cost
    dependency, it reuses one that's already warm.
- **Finance rows (income/expense/bill) — heuristic only, suggest-only, no auto-link.**
  `FinancePanel.tsx` documents itself as "Zero-AI: manual entry + bills" — a deliberate design
  choice to keep Money deterministic and never AI-guessed. This spec respects that: finance
  suggestions are a plain keyword/word-overlap match between the transaction's description and
  each Journey's title + description (no embeddings, no ML). A match only ever shows as a "✨
  Suggested" chip requiring a tap — **finance rows are never auto-linked**, regardless of how
  strong the keyword match is.

This means "hybrid" both across the feature (embeddings where already free, heuristics where AI
would conflict with an existing design promise) and within the node path (auto-link vs. suggest
vs. nothing, by confidence).

## 📐 Architecture / blast radius

| Layer | Change | Zone |
|-------|--------|------|
| `server/db/vec.ts` | Add a `vec_journeys` virtual table + `upsertJourneyEmbedding`/`deleteJourneyEmbedding`/`knnJourneys`, mirroring the existing `vec_profiles` functions exactly (same shape, same file). | 🔴 (new vec table, additive/safe) |
| `server/repositories/journeys.repo.ts` | On `create`/`update` (when title or description changes), embed `title + ". " + description` via the shared `EmbeddingProvider` and upsert into `vec_journeys`. On `remove`, delete the embedding too. | 🟡 |
| `server/api/routes/journeys.ts` | Add `GET /suggest?kind=&refId=` → for `kind="node"`: `knnJourneys` against the node's existing embedding, split into `autoLink` (≥0.72) and `suggested` (0.40–0.72) buckets. For `kind="income"\|"expense"\|"bill"`: fetch the row's description, do the keyword-overlap heuristic against each Journey's title+description, return matches as `suggested` only (`autoLink` always empty for finance kinds). Add `GET /:id/links` (hydrated link list — `label`/`amount` per kind, capped at 20 most recent, joining `nodes`/`fin_income`/`fin_expense`/`fin_bill`). | 🟡 |
| `web/api/journeys.ts` | Add `journeysFor(kind, refId)` (generic replacement for the node-only `journeysForNode`) and `suggestJourneys(kind, refId)`. | 🟢 |
| `web/components/JourneyChips.tsx` (NEW — extracted from `NodeInspector.tsx`) | Generalize `JourneyChips({ nodeId })` → `JourneyChips({ kind, refId })`. On mount: fetch `journeysFor` (already-linked) + `suggestJourneys` (candidates). If `autoLink` candidates exist and aren't already linked, call `linkToJourney` for each immediately + fire a toast; render `suggested` candidates as a distinct "✨ Suggested" row above the existing "＋ Add" (full list) flow. `NodeInspector` passes `kind="node"` — the auto-link/suggest logic is new, but the already-shipped manual add/remove chips are visually and behaviorally unchanged. | 🟢 |
| `web/components/NodeInspector.tsx` | Remove the `node.kind !== "action"` exclusion (confirmed unintentional) — actions are `nodes` rows, already validated by `refExists`, get chips (and suggestions) for free. | 🟢 |
| `web/components/FinancePanel.tsx` | Add `JourneyChips` (kind `income`/`expense`/`bill`) into each row's existing expand/detail area. | 🟢 |
| `web/components/IngestPanel.tsx` | After a successful submit, show `JourneyChips` (`kind="node"`) below the "saved" confirmation — auto-link fires immediately if confident, otherwise a skippable suggestion row appears; auto-dismisses after ~8s untouched or on next capture. Per open question #2 below: TBD whether this shows for `kind==="action"` captures too. | 🟢 |
| `web/components/JourneysPanel.tsx` | Each journey card, on expand, fetches `GET /:id/links` and renders Memories & Tasks (fly-to) · Transactions (description + amount, "+earned"/"-spent" split) · a bold running $ total. Empty state copy per the original spec. | 🟡 (new read path, additive) |
| `shared/types.ts` | Add `JourneyLinkSummary` (hydrated link shape) and `JourneySuggestion` (`{ journey: Journey; score: number; tier: "auto" \| "suggested" }`). | 🟢 |

No DB migration in the relational schema — `vec_journeys` is a new sqlite-vec virtual table
(additive, same pattern `bootstrapVec` already uses for 3 others). No changes to
`journeys.repo.ts`'s existing `link/unlink/links/journeysFor` methods. Fully offline-safe: the
node path's embeddings are local/free (already running); the finance path is pure string
matching, no AI at all.

## Logic

- Reuse, never duplicate: linking itself still goes through the existing `link()`/`unlink()` —
  suggestion/auto-link only decides *what to propose or pre-link*, never bypasses validation.
- Journey embeddings are computed lazily/idempotently — if `create`/`update` embedding fails
  (e.g. provider cold-start), the Journey still saves; embedding just backfills next time it's
  touched, exactly like nodes already tolerate embedding failures elsewhere in the pipeline.
- Auto-link is bounded and undoable: it only ever adds a link (never removes one the user set
  manually), and every auto-link is immediately visible as a normal, removable chip — there is no
  hidden state.
- Keyword-overlap heuristic for finance: lowercase, strip stopwords, compare significant-word
  overlap between the transaction description and each Journey's title+description; a Journey
  needs ≥1 shared significant word to be suggested at all. No score tuning beyond that — it's
  meant to catch obvious cases ("Rent" → a Journey titled "Buy My First Home"), not be clever.

## UX (Phase 4.5)

- `JourneyChips`: existing "already linked" chips + "＋ Add" flow look exactly as they do today.
  NEW: a "✨ Suggested" row (when candidates exist) sits between them — one tap links, matching
  the existing chip visual style (no new component language to learn). An auto-linked Journey
  simply appears as an already-linked chip the next time you look, with a toast having announced
  it when it happened.
- FinancePanel / IngestPanel / JourneysPanel: unchanged from the original spec version (see below)
  other than JourneyChips itself now being smarter.
- Toast copy for auto-link: "🧭 Linked to {Journey title}" — short, dismissible, consistent with
  existing toast patterns in the app.

## 🧪 Test plan

- Server: `vec_journeys` upsert/delete/knn round-trip (mirrors existing `vec_profiles` tests).
  `GET /suggest` for `kind="node"` correctly buckets a synthetic ≥0.72 match into `autoLink` and a
  0.4–0.72 match into `suggested`; a finance kind never returns anything in `autoLink` regardless
  of score. `GET /:id/links` hydration test (as in the original spec). All space-scoped.
- Web: `JourneyChips` calls `linkToJourney` automatically for an `autoLink` suggestion and does
  NOT for a `suggested` one (waits for the tap) — the one behavior this spec must get right.
- **Regression, must not break**: existing manual add/remove chip behavior for memories is
  unchanged; a node with zero suggestions above either threshold behaves exactly like today's
  manual-only flow.
- Full gate green (`npm run typecheck && npm test && npm run build -w @brain/web`).

## Risks

- **False-positive auto-links** are the one real risk of the whole feature — an incorrect silent
  link is confusing even though it's one tap to undo. Mitigation: reuse the EXACT threshold
  (0.72) already proven in production for memory-to-memory linking rather than inventing a new
  number; the toast makes every auto-link visible, not silent-silent.
- Journey embedding staleness: if a Journey's title/description changes significantly, its
  embedding must be recomputed (handled: `update()` re-embeds on title/description change) or
  suggestions will drift toward what the Journey used to be about.
- The hydration join in `GET /:id/links` touches multiple tables per link — capped at 20 most
  recent, read-only, detail-view only (not a hot path).
- A capture-time prompt risks feeling like friction if not genuinely skippable — mitigated by
  auto-dismiss + never blocking the save itself.

## ✅ Acceptance criteria

1. An income/expense/bill row can be linked/unlinked to a Journey from Money; matching Journeys
   are suggested (never auto-linked) based on keyword overlap.
2. An action/task can be linked/unlinked to a Journey from Details, including receiving the same
   embedding-based auto-link/suggestion treatment as memories.
3. A new memory with a strongly-matching Journey (≥0.72) is linked automatically with a visible
   toast; a moderately-matching one (0.40–0.72) is offered as a one-tap suggestion; nothing forces
   a decision before the capture is considered done.
4. Opening a Journey shows everything linked to it — memories/tasks with working fly-to, and
   transactions with a running $ total.
5. Existing manual memory-linking behavior in Details is unchanged for nodes with no strong
   suggestion.
6. Gate green; no relational-schema migration (a new additive vec table only); offline-safe
   throughout (local embeddings + pure string matching, no cloud key anywhere in this spec).

## Open questions for review

1. ~~Was excluding actions from Journey chips deliberate?~~ **Resolved — confirmed unintentional;
   removing it.**
2. Should the ingest-flow `JourneyChips` (with its auto-link/suggest behavior) appear for
   `kind==="action"` captures too, or only for regular memories? (Actions themselves get chips in
   Details either way per #2 above — this question is only about whether the *capture-time*
   prompt shows immediately for a freshly-created action.)
3. Confirmed plan: replace `journeysForNode` with the generic `journeysFor` (only 1-2 call sites).
4. JourneysPanel's money total — split "+earned / -spent" (recommended) or one combined number?
5. **New**: is silent auto-link at 0.72 the right call for Journeys specifically, or would you
   rather EVERY Journey link start as a tap-to-confirm suggestion (no silent tier at all) until
   you've seen how the suggestions perform in practice? Recommendation is to keep the auto-link
   tier (it reuses a threshold this codebase already trusts elsewhere), but this is the one
   genuine trust/UX call in the spec and worth your explicit sign-off rather than assuming it.
