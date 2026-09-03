# Spec — Income & Net Worth Growth Trend

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) / [WORKFLOW.md](../../WORKFLOW.md).
> Sibling to [`paystub-ingestion.md`](./paystub-ingestion.md) (that spec's per-paystub gross/net
> trend is the pay-stub-only slice of the chart component built here). Status: **proposed — not
> yet implemented.**

## 🎯 Objective

The user wants to watch their real financial trajectory the way a brokerage app shows a stock's
line — a chart that visibly grows (or dips) as they add more pay stubs, log self-employed/business
income, and update what they've got saved and invested — all manual for now (no bank/brokerage
connections yet), with Soumaya proactively nudging them to keep it current so the line stays
honest instead of going stale.

This is two related but distinct series on one chart:
1. **Income** — how much is actually coming in, per period, from every source (W2 paycheck,
   pay-stub-derived, or self-employed/business) — "real life growth in my income."
2. **Net worth** — total of cash + whatever savings/investment/retirement balances the user
   manually tells Soumaya about — since there's no live account sync yet, this is a periodic
   manual checkpoint, not a real-time balance.

## 📐 Repository facts this design relies on

| Fact | Where |
|---|---|
| `FinIncome` rows already carry a free-text `platform` field with no fixed enum — a manual "Add Income" form already exists and works for any income, self-employed included, it's just not presented as supporting that | `packages/shared/src/types.ts:707-718`, `FinancePanel.tsx:296` (`AddMoney`) |
| `avgWeeklyIncomeCents` already exists but is a single rolling 4-week average, not a time series | `packages/server/src/finance/summary.ts:47`, `budget.ts:91` |
| `FinAccount` is a single, per-space **spendable** cash balance that already feeds Safe-to-Spend math directly — explicitly scoped as "Stage 1: one currency, one account" in its own doc comment, anticipating more later | `packages/shared/src/types.ts:666-674`, `repositories/finAccount.repo.ts:6` |
| No concept of a savings/investment/retirement balance exists anywhere today — Wealth's Buckets/Goals are deliberately **not** balances (its own doc comment: never "saved"/"balance"/"deposited"/"invested" for any Wealth concept) | `packages/shared/src/types.ts:812-819` |
| The proactive-nudge pattern (detect staleness/risk → at-most-once-per-day guard via `agent_logs` → friendly message via `tc.notify`, surfaced in-app as a toast) is already fully built and proven | `packages/server/src/agent/tools/billRisk.ts` (entire file), `registry.ts`, `App.tsx`'s `tool:bill_risk` toast surfacing |
| This app's "no new charting dependency" convention — hand-rolled inline-styled charts only | `WealthPanel.tsx` progress bars, `paystub-ingestion.md` §6 |

## 📐 Architecture / blast radius

| Layer | Change | Zone |
|-------|--------|------|
| `shared/types.ts` | New `FinAssetKind = "savings" \| "investment" \| "retirement" \| "other"`; new `FinAsset { id, kind, label, createdAt }` and `FinAssetSnapshot { id, assetId, amountCents, asOf, createdAt }`. New `IncomePoint { periodStart: string; totalCents: number; bySource: Record<string, number> }` and `NetWorthPoint { asOf: string; totalCents: number }` for the chart data shape. | 🟢 additive |
| `db/schemaSql.ts` + `migrateSchema` | New `fin_asset` (id, space_id, kind, label, archived, created_at) and `fin_asset_snapshot` (id, space_id, asset_id, amount_cents, as_of, created_at) tables. No FK (matches `fin_goal`/`fin_bucket` convention). **Deliberately separate from `fin_account`** — see Decision #1 below. | 🟡 additive migration |
| `repositories/finAsset.repo.ts` (NEW) | CRUD for assets + snapshots; `latestByAsset(asOf?)` returns each asset's most recent snapshot at/before a date — the building block for a net-worth-as-of-any-date query. | 🟢 |
| `finance/incomeTrend.ts` (NEW) | `incomeSeries(ctx, spaceId, months)`: buckets every `fin_income` row (paystub-derived and manual alike — no schema distinction needed, see Decision #2) into calendar-month totals, split `bySource` by a simple platform-text heuristic (`"self-employed"`/`"business"` prefix vs. everything else, see Decision #2). | 🟢 |
| `finance/netWorthTrend.ts` (NEW) | `netWorthSeries(ctx, spaceId, months)`: for each month-end in range, sums `fin_account.balanceCents` (as of now — Stage 1 has no history for it either, see Decision #3) + latest-as-of snapshot per `fin_asset`. | 🟢 |
| `api/routes/finance.ts` | `GET /assets` (list+CRUD), `POST /assets/:id/snapshots`, `GET /trend/income?months=`, `GET /trend/net-worth?months=` — thin validate→delegate→json, same pattern as every existing route in this file. | 🟢 |
| `web/api/finance.ts` | Matching client functions. | 🟢 |
| `web/components/GrowthTrendChart.tsx` (NEW) | The one hand-rolled, animated line-chart component — generic over `{ label, points: {x:string; y:number}[] }[]` series, so it renders BOTH this feature's income/net-worth lines AND (per `paystub-ingestion.md` §6) the pay-stub gross/net trend — one chart implementation, three call sites. | 🟢 |
| `web/components/FinancePanel.tsx` | New "📈 Growth" section: chart (toggle Income / Net Worth), plus a compact "💰 Assets" manager (add a savings/investment/retirement account, log a new balance snapshot) reusing `AddMoney`'s existing form style. `AddMoney`'s income form gains a "Source" quick-select (Paycheck / Self-employed / Other) — a UX affordance only, still writes to the existing free-text `platform` field (see Decision #2), not a schema change. | 🟢 |
| `agent/tools/financeFreshness.ts` (NEW) | Mirrors `billRisk.ts` exactly: `detect()` fires at most once per **week** (not per day — this is a low-urgency nudge, unlike bill risk) when either no income entry has landed in the last 20 days, or no asset snapshot has been logged in the last 30 days. `run()` sends one friendly, specific message via `tc.notify` (names which is stale). Registered in `agent/tools/registry.ts` next to `billRiskTool`. | 🟢 |

No change to `fin_account`, Safe-to-Spend, or Wealth's Buckets/Goals — this whole feature is
additive and read-only with respect to existing money math (see Decision #1).

## Decisions (resolving the design questions this spec raises)

1. **Net worth's new "assets" are a separate table from `fin_account`, not an extension of it.**
   `fin_account.balanceCents` already feeds Safe-to-Spend directly — folding "here's my 401k
   balance" into that same concept would either pollute Safe-to-Spend with non-spendable money or
   require a risky `kind` split inside code that this app's own Financial-OS doc treats carefully.
   A separate `fin_asset`/`fin_asset_snapshot` pair (never touched by `finance/budget.ts`) is
   lower-risk and ships faster — multi-account support for the *spendable* balance itself stays a
   separate, future decision, untouched by this spec.
2. **No new column to distinguish "paycheck" vs. "self-employed" income.** `FinIncome.platform`
   is already free text with no enum (confirmed in the repository-facts table) — adding a
   `sourceType` column to formally categorize it would be a real migration for something the
   existing field already does informally. Instead: `AddMoney` gets a "Source" quick-select that's
   a **pure UI convenience** — picking "Self-employed" just pre-fills the platform text field
   (still user-editable) with a recognizable label; `incomeTrend.ts`'s `bySource` split reads that
   same text with a simple case-insensitive prefix check. This means a stub-derived income row
   (whose `platform` is set from `PaystubExtractionResult.employer`) and a self-reported business
   income row both flow into the same total-income line with zero extra plumbing — exactly what
   "her real income growth" needs — while `bySource` gives the nice-to-have breakdown without a
   schema change. If real usage later shows text-matching is too fragile, promoting this to a real
   enum column is a small, isolated follow-up.
3. **The net-worth line's "cash" component is a snapshot of today's balance repeated backward,
   not a real history — flagged plainly in the UI, not hidden.** `fin_account` has never stored
   history (it's a single mutable balance, "Stage 1: one currency, one account"), so a true
   month-by-month net-worth line can only be historically accurate for the NEW `fin_asset`
   snapshots (which start accumulating from whenever the user first logs one) plus the CURRENT
   cash balance projected flat across past months. The chart labels this honestly (a lighter/
   dashed segment for "current balance, no history yet" vs. a solid line once real snapshots
   exist) rather than presenting fabricated historical cash balances as fact — consistent with
   this codebase's existing "Zero-AI... always show the real number" discipline for Money.
   Retroactively backfilling real cash history is out of scope (Non-Goals).
4. **The reminder is weekly, not daily, and covers two independent conditions.** Unlike bill risk
   (a real, time-sensitive money risk), "did you log this month's numbers" is a light housekeeping
   nudge — daily would be nagging. `detect()` checks income staleness (>20 days since last
   `fin_income` row — roughly one missed pay cycle for most schedules) and asset staleness (>30
   days since any `fin_asset_snapshot`) independently, firing on whichever (or both) is true, at
   most once per 7-day window per space (same `agent_logs`-lookback guard shape as `billRisk.ts`,
   just a wider window).

## Logic

- **Income series**: group `fin_income.date` by calendar month within the requested window
  (default 12 months), `SUM(net_cents)` per month for the total line, plus a `bySource` split
  (`business`/`self-employed`-prefixed `platform` vs. everything else) computed the same pass.
  Pure SQL aggregation, no LLM involved — this whole feature is offline-safe like the rest of
  Financial OS.
- **Net worth series**: for each month-end in the window, `SUM` of (a) the single `fin_account`
  balance as it is *right now* (flat-projected backward per Decision #3) and (b) for every active
  `fin_asset`, its most recent snapshot with `as_of <= that month-end` (0 if none yet exists at
  that point — an asset added last month contributes nothing to earlier months, which is correct,
  not a bug).
- **Chart component**: pure SVG `<path>` built from the series' points (min/max-normalized to the
  viewBox, same category of math as `orbits.ts`'s LOD gap function earlier this session — fully
  unit-testable without rendering). "Live" animation = the path's `stroke-dasharray`/
  `stroke-dashoffset` animated from full-hidden to full-drawn on mount via a CSS transition (a
  well-understood, dependency-free SVG line-draw technique), plus a small pulsing dot at the
  latest point — all gated behind `prefers-reduced-motion` (draws instantly, no pulse) per this
  repo's non-negotiable accessibility rule. Two series on one chart are distinguished by stroke
  style (solid vs. dashed) *and* a legend, never color alone, matching the same rule applied in
  `paystub-ingestion.md` §6.
- **Freshness nudge**: exactly the `billRisk.ts` shape — `detect()` returns zero or one
  `ToolInvocation`, `run()` composes a specific message ("You haven't logged income in 23 days —
  want to add your latest pay stub?" / "Your net worth numbers are a month old — a quick update
  keeps this accurate.") and delivers it via `tc.notify`, which `router.ts` already logs verbatim
  and `App.tsx` already surfaces as an in-app toast (per this session's earlier BillRisk
  in-app-surfacing work) — no new delivery plumbing needed at all.

## UX

- New "📈 Growth" section in `FinancePanel` (peer to the new "📄 Pay Stubs" section from the
  paystub spec, both living in base Money): a toggle chip row (Income / Net Worth), the animated
  chart, and — only under Net Worth — a compact list of tracked assets with an inline "+ Log new
  balance" affordance per asset and a "+ Add account" (name + kind + starting balance) action.
- `AddMoney`'s income form: a small "Source" segmented control (Paycheck / Self-employed / Other)
  above the existing platform text field; picking one pre-fills (never overwrites silently — it's
  a suggestion the user can still edit) the text field.
- Freshness nudges arrive exactly like bill-risk nudges do today — an in-app toast in Soumaya's
  voice — nothing new to learn.

## 🧪 Test plan

- `finance/incomeTrend.ts`: monthly bucketing is correct across a month boundary, an empty range
  returns all-zero months (not missing months — a real chart needs continuous x-axis points), and
  `bySource` correctly separates a "Self-employed: rideshare" platform string from a plain
  "Acme Corp" one.
- `finance/netWorthTrend.ts`: an asset with no snapshot yet contributes 0 to every month; an asset
  with one snapshot contributes that value to every month from its `as_of` date onward and 0
  before; two assets sum correctly; the flat-projected cash balance is clearly flagged in the
  returned shape (e.g. a `cashIsProjected: boolean` on each point) so the UI can render the
  dashed-vs-solid distinction from Decision #3 without re-deriving it.
- `agent/tools/financeFreshness.test.ts` (mirrors `billRisk.test.ts`): fires once when income is
  stale, once when assets are stale, once when both are (one combined message, not two nudges),
  never twice within 7 days, never at all when both are fresh.
- Web: `GrowthTrendChart` renders correct path geometry for a known input (a pure-function
  geometry test, not a rendered-pixel test — same "prove it by measurement" approach as this
  session's orbit-LOD gap-function tests); reduced-motion disables the draw-in animation.
- Regression: adding an income row / a Wealth goal / a bill payment behaves exactly as before —
  this feature reads existing tables, never writes to them.
- Full gate: `npm run typecheck && npm test && npm run build -w @brain/web`.

## Risks

- Decision #3's flat-projected cash history could read as slightly misleading if the dashed/solid
  distinction isn't visually obvious enough — worth a specific look once this is on a real device,
  flagged the same way every other visual change this session has been flagged pending the Fly
  billing-hold blocker.
- The `platform`-text heuristic (Decision #2) is inherently fuzzy — a business income row typed
  without the word "self-employed"/"business" anywhere in it silently falls into the generic
  bucket. Acceptable for a first pass (the total income line is unaffected either way — only the
  `bySource` breakdown is imprecise), called out explicitly rather than silently accepted.
- A brand-new user with zero assets and one pay stub will see a mostly-flat, unimpressive chart —
  not a bug, just an honest reflection of one data point; no attempt is made to fabricate a more
  exciting-looking line.

## ✅ Acceptance criteria

1. A "📈 Growth" section in Money shows an animated Income line and an animated Net Worth line,
   togglable, honoring reduced-motion.
2. A user can add a savings/investment/retirement "asset" and log balance snapshots for it over
   time; those snapshots visibly move the Net Worth line.
3. Self-employed/business income can be logged through the existing Add Income form with a clear
   "Self-employed" option, and it counts toward the same Income line as paycheck/paystub income.
4. Soumaya sends an in-app nudge (not more than once a week) when income or asset data has gone
   stale, in her own voice, matching the existing bill-risk nudge pattern.
5. Nothing about Safe-to-Spend, Wealth, or existing income/expense/bill data changes — this is a
   purely additive read/write surface.
6. Gate green; migration is additive-only and idempotent (`migrateSchema`).

## Open questions for review

1. Confirmed default nudge cadence: income >20 days stale, assets >30 days stale, at most one
   combined nudge per 7 days — flag if these numbers feel wrong for your actual pay cadence
   (weekly/biweekly trucking pay vs. a monthly retainer would want different windows).
2. Should archiving/deleting an asset also delete its snapshot history, or keep the history (asset
   hidden from the "add new snapshot" list, but its past contribution stays in the Net Worth line
   for months before the archive date)? Recommend the latter — matches how `fin_bucket`/`fin_goal`
   archiving already preserves history elsewhere in Wealth.
3. Default chart window: this spec assumes 12 months — flag if you want a different default
   (e.g. "all time" or 6 months) or a user-adjustable range control.

## Next step after approval

Implement per the architecture table above: shared types → schema/migration → repo → trend
services → routes/client → `GrowthTrendChart` → `FinancePanel` wiring → `financeFreshness` tool +
registry, running the full gate after each logical chunk, same discipline as every other
multi-file feature this session. No implementation until this spec is reviewed, per `WORKFLOW.md`
Phase A's Human Approval gate — same pattern as every other spec this session.
