# Spec — Journeys Go Live: Capture-Time Linking + Finance/Task Wiring + Journey Detail View

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) / [WORKFLOW.md](../../WORKFLOW.md).
> Parent: [VISION_2_JOURNEYS.md](../VISION_2_JOURNEYS.md). Continues Stage 1 (the capture-time "what
> Journey?" suggestion never got built) and pulls forward the additive, independent half of Stage 4
> (financial/task linkage) ahead of Stages 2-3 (Mission Control, Living Galaxy hubs), since it
> doesn't depend on either and closes the most concrete gap found in a full tab audit. Status:
> **proposed — not yet implemented.**

## 🎯 Objective

`journey_link` (the join that lets a Journey connect to any memory/task/transaction) is fully
built and validated server-side, but the ONLY place in the entire app that uses it is a private
`JourneyChips` component buried in `NodeInspector.tsx` — and it's explicitly disabled for action
items. Money, the capture flow, and the Journeys tab's own detail view have zero linking UI
despite the backend already supporting `income`/`expense`/`bill` link kinds. This spec wires the
existing mechanism into the three places it's missing and gives a Journey a real detail view, so
opening one visibly shows the memories, tasks, and money connected to it — the first tangible
proof that "everything belongs to a Journey" is real, not just a doc.

## 📐 Architecture / blast radius

| Layer | Change | Zone |
|-------|--------|------|
| `web/api/journeys.ts` | Add `journeysFor(kind, refId)` — thin generic wrapper for the already-generic `GET /for/:kind/:refId` route. Replace the one existing call site (`journeysForNode`) rather than keep both — the current name is actively misleading once used for non-node kinds. | 🟢 |
| `web/components/JourneyChips.tsx` (NEW — extracted from `NodeInspector.tsx`) | Generalize the private `JourneyChips({ nodeId })` into an exported `JourneyChips({ kind, refId })`. `NodeInspector` imports it back and passes `kind="node"` — zero visible/behavioral change for existing memory linking. | 🟢 |
| `web/components/NodeInspector.tsx` | Remove the `node.kind !== "action"` exclusion — actions are `nodes` rows too (`kind:"node"`, already validated by `refExists`), so they get the same chips for free once the exclusion is gone. | 🟢 |
| `web/components/FinancePanel.tsx` | Add a `JourneyChips` chip row (kind `income`, `expense`, or `bill` depending on the row) into each income/expense/bill row's existing expanded-detail area. | 🟢 |
| `web/components/IngestPanel.tsx` | After a successful submit returns the new node's id, show a small, dismissible "🧭 Add to a Journey?" chip-row (same component, `kind="node"`) below the "saved" confirmation. Auto-dismisses after ~8s untouched or on the next capture; never blocks. | 🟢 |
| `web/components/JourneysPanel.tsx` | Each journey card, on expand, fetches its hydrated links and renders three groups: Memories & Tasks (label, fly-to via existing `onFocus`), Transactions (description + amount, split "+earned" vs "-spent"), and a bold running $ total. Empty state: "Nothing linked yet — connect a memory, task, or transaction from where you're already working." | 🟡 (new read path, additive) |
| `server/api/routes/journeys.ts` | Add `GET /:id/links` — hydrates the repo's raw `{kind, refId}` rows into `{kind, refId, label, amount?, occurredAt?}` by joining each kind's own table (`nodes.label`; `fin_income`/`fin_expense`/`fin_bill`'s description+amount). Cap at the 20 most recent links (detail view, not a hot path, but must stay bounded). | 🟡 |
| `shared/types.ts` | Add `JourneyLinkSummary` (the hydrated shape above) for the new route's response. | 🟢 |

No DB migration. No changes to `journeys.repo.ts` itself (its generic `link/unlink/links/journeysFor`
already do everything needed — this spec is entirely about USING what's already built). Offline-safe
throughout — nothing here calls an LLM.

## Logic

- Reuse, never duplicate: the repo's existing `REF_TABLE`-validated `link()`/`unlink()` already
  covers every kind this spec touches (`node`, `income`, `expense`, `bill`). No new kind, no new
  validation logic.
- Hydration (`GET /:id/links`) is a straightforward per-kind join: `node` → `nodes.label`;
  `income`/`expense` → their own table's description + amount; `bill` → name + amount. Unknown/
  dangling refs (deleted since linking) are silently skipped, not shown as broken rows.
- Capture-time prompt is opt-in and skippable everywhere it appears — matches the vision doc's own
  "never blocking; a thing can belong to no Journey."
- Deliberately NOT building the "smart suggested Journey" (embedding-similarity) from the vision
  doc's architecture notes in this pass — the picker just lists existing Journeys + could support
  a quick inline "+ New Journey" later. Flagged as a follow-up, not attempted here.

## UX (Phase 4.5)

- `JourneyChips` visual is UNCHANGED from what's shipped today (users already know this pattern
  from memories) — reused verbatim in three more places rather than inventing a new pattern.
- FinancePanel: chips slot into each row's already-existing expand/detail area; the collapsed row
  (the common case) looks exactly as it does today.
- IngestPanel: prompt appears only after the existing "saved!" confirmation, small and skippable,
  auto-dismisses after ~8s or on the next capture — never adds a required step to quick capture.
- JourneysPanel card, expanded: "🧭 Memories & Tasks" list (fly-to icon) · "💵 Transactions" list ·
  a bold "**+$X earned · -$Y spent**" summary line when there's ≥1 money link. Loading: existing
  skeleton pattern already used elsewhere in this panel. Empty: the copy above, not a bare blank.

## 🧪 Test plan

- Server: `GET /:id/links` returns correctly hydrated `label`/`amount` for one linked row of each
  kind (node/income/expense/bill); empty array for a journey with no links; never returns another
  space's links (space-scoping regression test, same discipline as the rest of this codebase).
- Web: the generalized `JourneyChips` component links/unlinks correctly for a non-`"node"` kind
  (e.g. `"expense"`) against a mocked API — this is the one new piece of client logic worth a real
  test, not just manual QA.
- **Regression, must not break**: NodeInspector's existing memory-linking behavior is byte-for-byte
  the same after the `JourneyChips` extraction — this is a refactor of the one part of this feature
  users already rely on, not a behavior change, and needs to be verified as such.
- Full gate green (`npm run typecheck && npm test && npm run build -w @brain/web`).

## Risks

- The hydration join in `GET /:id/links` touches multiple tables per link — must stay a cheap,
  read-only detail-view fetch (capped at 20 most recent), never a hot path.
- Actions were explicitly excluded from Journey chips today and there's no comment explaining why
  — before just deleting that exclusion, worth confirming it wasn't deliberate (e.g. "actions are
  short-lived, a Journey link would outlive and clutter it"). Listed as an open question below
  rather than assumed safe.
- A capture-time prompt risks feeling like friction on a fast thought-dump if it's not genuinely
  skippable — mitigated by auto-dismiss + never blocking the save itself (the memory is already
  saved by the time the prompt appears).

## ✅ Acceptance criteria

1. An income/expense/bill row can be linked/unlinked to a Journey from Money, same interaction as
   memories today.
2. An action/task can be linked/unlinked to a Journey from Details.
3. A fresh capture in the ingest flow offers an optional, dismissible Journey link.
4. Opening a Journey shows everything linked to it — memories/tasks with working fly-to, and
   transactions with a running $ total.
5. Existing memory-linking behavior in Details is unchanged after the refactor.
6. Gate green; no schema migration; offline-safe (nothing here depends on an LLM/API key).

## Open questions for review

1. Was excluding actions from Journey chips deliberate, or just not-yet-done? No comment explains
   it either way — worth an explicit confirm before removing it.
2. Should the ingest-flow prompt appear after every capture, or only for kinds more "durable" than
   a quick action/reminder (skip it for `kind==="action"`, only offer it for real memories)?
3. Confirmed plan: replace `journeysForNode` with the generic `journeysFor` rather than keep both
   (only 1-2 call sites) — flag if there's a reason to keep the old name around instead.
4. JourneysPanel's money total — split "+earned / -spent" (recommended, matches how Money itself
   already frames things) or one combined "activity" number?
