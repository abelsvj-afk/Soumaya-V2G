# Spec — What Can I Afford: wiring up the dormant Forecast Engine

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) / [WORKFLOW.md](../../WORKFLOW.md).
> Continues [docs/financial-os/roadmap.md](../financial-os/roadmap.md) Stage 3 ("Forecasting + scenarios").
> Status: **proposed — not yet implemented.**

## 🎯 Objective

An audit (triggered by "go deeper on the money tool") found `finance/forecast.ts`'s `weeksToAfford` —
the actual scenario-answering function ("how many weeks to afford $X", including an "extra shifts"
variant) — fully built, correctly implemented, and covered by its own unit tests, but with **zero
callers anywhere in the app**. `weeklyBillLoadCents`/`weeklySurplusCents` (the two supporting
functions) ARE used, but only to feed a sentence in `finance/snapshot.ts` that tells the LLM to
*"reason from the weekly surplus... show the rough math (weeks ≈ target ÷ weekly surplus)"* —
i.e. the one function built to compute this exactly is bypassed in favor of the LLM eyeballing its
own division. This spec ships a real, Zero-AI surface for it (a "What can I afford?" calculator in
FinancePanel) and fixes the small duplicated-logic issue found along the way, while explicitly
deferring the trickier chat-integration half of Stage 3 to a follow-up.

## 📐 Architecture / blast radius

| Layer | Change | Zone |
|-------|--------|------|
| `shared/types.ts` | `BudgetSummary` gains `avgWeeklyIncomeCents: number` (a rough 4-week trailing average). Additive field. | 🔴 (shared type, additive/safe) |
| `server/finance/summary.ts` | `getBudgetSummary` computes the 4-week average (same math `snapshot.ts` already does inline — see Logic) and includes it in the returned object. | 🟡 |
| `server/finance/snapshot.ts` | Reads `b.avgWeeklyIncomeCents` instead of recomputing it inline — de-dupes the two places this exact calculation lived. No behavior change to the snapshot text itself. | 🟢 |
| `server/api/routes/finance.ts` | New `GET /afford?targetCents=&extraPerWeekCents=` — thin: zod-validate → `getBudgetSummary` (for `avgWeeklyIncomeCents`) + `FinBillRepo.list()` → `weeklyBillLoadCents`/`weeklySurplusCents`/`weeksToAfford` (all already-tested pure functions from `forecast.ts`) → json. `Infinity` (can't-afford-at-current-pace) is converted to `null` before sending — `JSON.stringify` would otherwise silently turn it into `null` unannounced. | 🟢 |
| `web/api/finance.ts` | New `getAfford(targetCents, extraPerWeekCents?)` client function. | 🟢 |
| `web/components/FinancePanel.tsx` | New collapsed-by-default "🧮 What can I afford?" section: an amount input (+ optional "extra per week" input), calling the new route on submit, showing "~N weeks (about M months)" or an honest "you're not currently saving toward this at your current pace" when the result is `null`. | 🟢 |

No DB migration. No LLM/AI involvement anywhere in this pass — matches `FinancePanel.tsx`'s own
"Zero-AI: manual entry + bills" design comment, and means this works with no API key configured,
same as the rest of Stage 1a/1b.

## Logic

- `weeksToAfford(targetCents, surplusCents, extraPerWeekCents)` (already implemented, already
  tested) returns `Infinity` when the surplus (+ any modeled extra) is ≤ 0 — "you can't get there
  without earning more or cutting bills," per its own doc comment. The route converts that to
  `null` in the JSON response; the UI shows the honest message above rather than a bare `null` or
  a nonsensical "Infinity weeks."
- The 4-week average income calculation currently lives ONLY inline inside
  `financialSnapshotText` (`snapshot.ts:26-29`: `fourWeeksAgo` → `income.sumNetBetween` → `/ 4`).
  Moving it into `getBudgetSummary` means both the chat snapshot and the new `/afford` route read
  the exact same number — today they'd otherwise have to compute it twice, and any future
  divergence between the two copies would be a real (if subtle) correctness bug.
- Reuses `weeklyBillLoadCents(bills)` exactly as `snapshot.ts` already does — no new bill-load
  logic.

## UX

- FinancePanel: a new, low-emphasis, collapsible section below the existing bill manager (matches
  the panel's existing collapse-by-default pattern for secondary tools like `History` and
  `BillManager`, so the "Safe to Spend" hero stays the focal point).
- Copy: "🧮 What can I afford?" → amount input → optional "if you picked up extra income of
  $___/week" → result line, e.g. "**~14 weeks** (about 3 months) at your current pace" or, when
  null, "You're not currently saving toward this — earning more or cutting a bill would change
  that." Never colour-only; the honest/can't-afford state gets distinct wording, not just a red
  number.

## 🧪 Test plan

- `server/finance/summary.test.ts` (extend, or add if none exists for this file specifically —
  check first): `getBudgetSummary`'s `avgWeeklyIncomeCents` matches a hand-computed 4-week average
  from seeded income rows.
- `server/finance/snapshot.test.ts` (or wherever `financialSnapshotText` is currently tested):
  confirm the snapshot text is byte-for-byte unchanged for a fixed scenario before/after the
  refactor (this is a pure de-dup, not a behavior change — must prove that).
- New route test in `api/routes/finance.test.ts` (or the existing finance route test file): 400 on
  a missing/negative `targetCents`; correct `weeks` for a simple surplus scenario; `weeks: null`
  when the surplus is ≤ 0; `extraPerWeekCents` actually changes the result; space-scoped (numbers
  come from the caller's own space only).
- Web: if `FinancePanel` has an existing smoke-test file, extend it; otherwise this is small/UI-only
  enough that manual verification (this sandbox can't render a browser) plus the server-side route
  tests above cover the actual math — don't force new web test infra for one calculator.
- Full gate: `npm run typecheck && npm test && npm run build -w @brain/web`.

## Risks

- Very low. Every function doing the actual math (`weeksToAfford`, `weeklyBillLoadCents`,
  `weeklySurplusCents`) already exists and is already unit-tested — this spec is wiring, not new
  math. The only real risk is the `Infinity`→`null` JSON edge case, called out explicitly above so
  it isn't discovered by surprise on the client.
- The `avgWeeklyIncomeCents` move touches `BudgetSummary`, a shared type consumed by the existing
  `/api/finance/summary` route and the web `FinancePanel` — purely additive, but worth confirming
  no existing consumer does an exhaustive/strict shape check that a new field would break (spot-check
  during implementation).

## ✅ Acceptance criteria

1. A user can enter a dollar amount and get back an accurate "N weeks at current pace" figure with
   no LLM/API key required.
2. A currently-unaffordable target (surplus ≤ 0) shows an honest message, not `null`/`Infinity`/a
   crash.
3. `avgWeeklyIncomeCents` is computed once, in one place, and both `snapshot.ts` and the new route
   read that same value.
4. Gate green; no schema migration; fully offline-safe.

## Explicitly deferred (Phase 2, not this spec's scope)

The roadmap's actual Stage 3 vision is **conversational** ("can I afford a PS6 next month?", asked
in chat, answered in Soumaya's voice). Today `financialSnapshotText` tells the LLM to eyeball its
own division from the weekly-surplus number already in context — which risks arithmetic drift
(especially with an "extra shifts" scenario layered in) precisely because `weeksToAfford` isn't
being called for the SPECIFIC amount the user asked about. Fixing that properly means extracting a
target dollar amount from the user's free-text chat message (handling "$400", "1,200", "twelve
hundred", etc.) before building the snapshot, then injecting the PRECISE `weeksToAfford` result
for that amount instead of the generic surplus-only line. That's a real, separate scoping problem
(a small NLU/extraction task, not pure math) and is deliberately left for its own follow-up rather
than folded into this spec — this spec's calculator ships the same underlying value immediately,
without waiting on that harder problem to be solved.

## Next step after approval

Implement directly (small, fully-scoped, no remaining open design questions) — no further spec
review needed before Phase B per `WORKFLOW.md`'s lighter loop for a change this contained.
