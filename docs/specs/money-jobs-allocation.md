# Spec — Give Every Dollar a Job (AI-Reasoned Allocation + the Unassigned-Money Sky)

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) / [WORKFLOW.md](../../WORKFLOW.md).
> **This is not a new idea for this codebase — it's a continuation of an existing, approved design
> that was never finished.** [`docs/financial-os/stage-4-galaxy-and-zero-based.md`](../financial-os/stage-4-galaxy-and-zero-based.md)
> already specced this exact feature (explicitly citing EveryDollar's "give every dollar a job," the
> same inspiration named in this request) back in Stage 4. Status of that doc, verified against the
> current codebase tonight:
> - **Part A (Money in the galaxy) — half-shipped.** `GET /api/finance/sky` and `graph/moneySky.ts`
>   are live, but only ever emit `kind: "bill"` stars. The `MoneyStarState` type already defines
>   `goal_filling`/`goal_reached` (with glyphs `◔`/`✦` and a full color/motion spec in that doc's
>   §A2) — but nothing has ever produced a `kind: "goal"` star. Designed, never wired up.
> - **Part B (Zero-based plan / "jobs")** — **0% built.** `fin_plan`/`fin_allocation` don't exist
>   anywhere in the schema. This is the actual feature being asked for tonight.
> - **Part C (The Audit)** — 0% built, and explicitly **out of scope for this spec** (see below).
>
> Status: **proposed — not yet implemented.**

## 🎯 Objective

Give the user a place to name what their money is *for* — "Emergency Fund," "Investing," "Fun
Money" — and have Soumaya actively reason about the surplus sitting unassigned: when things are
tight, push it toward safety; when things are healthy, push it toward growth or discretionary
spending. Pair it with a real visual: money that hasn't been given a job yet should look
*unanchored* in the galaxy — dim, drifting particles near the money sky — until it's assigned to a
job, at which point it visibly gets pulled in and the job's star brightens/fills.

**Explicitly not in this pass** (per the user's own framing tonight): no real external account
linking or moving of real money — allocation is Soumaya's *advisory bookkeeping*, a running number
the user can see and accept/adjust, not a bank transfer. That's future work, once accounts can
actually be linked. Also not in this pass: Part C (the Audit) and the original doc's formal
`fin_plan` pay-period ritual — see **Decisions** below for why.

## Decisions (deviating from, or filling gaps in, the original Stage 4 doc)

1. **No `fin_plan`.** The original doc's Part B was a formal, period-based "here's my planned
   income, assign it to $0" ritual. Tonight's ask is different in spirit — "AI does the allocating
   *for* you, reactively, so you just know what to do," not a recurring budgeting session the user
   has to sit down and run. Building the period-based ritual on top of what ships here is possible
   later; it isn't needed for this to work, and skipping it meaningfully shrinks the blast radius
   (no plan/period lifecycle to manage).
2. **Jobs don't require a Mind-tab goal.** The original doc ties goal-kind allocations to
   `fin_goal_link` (which requires a `node_id`). Keeping job creation to "name + tier + optional
   target" (no forced trip through goal-node creation) matches the user's explicit "simple named
   buckets" ask. A job *can* optionally link to an existing Mind-tab goal node (reusing the
   dormant, zero-consumer `fin_goal_link` table exactly as it was designed) for anyone who wants
   the deeper tie-in — never required.
3. **Jobs carry a `tier`** (`safety | growth | fun`), chosen by the user at creation — this is the
   one genuinely new concept beyond the original doc, and it's what makes AI-reasoned allocation
   possible without guessing intent from a name string (fragile) or an LLM call (not offline-safe,
   not needed — this is exactly the kind of math this codebase already keeps deterministic). Three
   tiers, not more: safety (emergency fund, buffer top-up), growth (investing, debt payoff), fun
   (discretionary) — matches the three buckets the user named directly.
4. **"Unassigned" is measured against the LIVE safe-to-spend number, not a fixed pay-period
   income figure.** `unassignedCents = max(0, safeToSpendCents − Σ active jobs' allocatedCents)`.
   This is a deliberate simplification: since there's no real account link to reconcile against,
   `allocatedCents` is an honest running pledge, not a guarantee the money hasn't since been spent
   elsewhere. Same "Zero-AI... a shortfall is shown with icon + label + number" honesty this
   codebase already holds itself to in `FinancePanel.tsx` — this drifts a little in exchange for
   not requiring real bank sync, and that tradeoff is stated here plainly, not hidden.
5. **The Audit (Part C) stays a separate, later spec.** It's a good, already-designed feature, but
   it's a different piece of work (deterministic period-over-period variance analysis + LLM
   phrasing) than "give this money a job," and bundling it in risks neither shipping cleanly.

## 📐 Architecture / blast radius

| Layer | Change | Zone |
|-------|--------|------|
| `db/schemaSql.ts` | New `fin_allocation` table: `id, space_id, name, tier ('safety'\|'growth'\|'fun'), target_cents NULL, allocated_cents DEFAULT 0, linked_goal_node_id NULL, archived DEFAULT 0, created_at`. Additive, no migration risk (new table via `migrateSchema`, same pattern as every other Financial-OS table). | 🟢 |
| `repositories/finAllocation.repo.ts` (NEW) | CRUD (`create/list/get/update/archive`) + `allocate(id, cents)` (bumps `allocated_cents`, clamped so a job never exceeds its `target_cents` if one is set — the excess is left unassigned rather than silently overflowing one job). Space-scoped throughout, mirrors every other `fin_*` repo. | 🟢 |
| `finance/allocationSuggest.ts` (NEW) | Pure, deterministic, offline function: `suggestAllocation(budget: BudgetSummary, jobs: FinAllocation[], unassignedCents: number): AllocationSuggestion[]`. Priority order derives from *condition*, not a fixed ranking: thin buffer or `shortfallCents > 0` → weight safety-tier jobs heavily; healthy buffer → split remaining weight across growth then fun. Never allocates more than `unassignedCents` total, never overflows a job past its `target_cents`. No LLM call — same "the math is deterministic, Soumaya only explains it" principle as the rest of Money. | 🟢 |
| `finance/sky.ts` | `moneySky()` gains: (a) one `kind: "goal"` star per active `fin_allocation` (`state: "goal_reached"` once `allocated_cents >= target_cents`, else `"goal_filling"`; `fillPct` set only when `target_cents` is set, omitted for open-ended jobs) — **finishes Part A**, using the visual model that doc already fully specced; (b) at most one `kind: "unassigned"` star when `unassignedCents` clears a small noise floor (≥ $5, avoiding a visual for pocket change). | 🟡 (extends a live, tested function — additive branches, existing bill logic untouched) |
| `shared/types.ts` | `MoneyStar.kind` gains `"unassigned"`. New `FinAllocation` and `AllocationSuggestion` types. | 🟢 |
| `api/routes/finance.ts` | `GET /allocations`, `POST /allocations`, `PATCH /allocations/:id`, `DELETE /allocations/:id` (archives, matches the delete-that-archives pattern already used for bills/nodes where history matters), `GET /allocations/suggest` (thin validate → call `suggestAllocation` → json), `POST /allocations/:id/accept` (applies one suggestion's cents to that job — the only route that actually mutates `allocated_cents`, so accepting is always an explicit, auditable action). | 🟢 |
| `finance/snapshot.ts` | Extend `financialSnapshotText` with a "Money without a job" line (unassigned amount + top suggestion) when `unassignedCents` is meaningfully positive — reuses the existing snapshot injection point rather than adding a parallel one, same discipline as tonight's earlier audit finding about this exact function. | 🟢 |
| `web/api/finance.ts` | `getAllocations`, `createAllocation`, `updateAllocation`, `archiveAllocation`, `getAllocationSuggestions`, `acceptAllocationSuggestion` — thin wrappers, same pattern as every existing finance client call. | 🟢 |
| `web/components/FinancePanel.tsx` | New "🧭 Jobs" section: list of jobs (name, tier icon, progress bar when `target_cents` set, else a plain running total), "+ New job" (name/tier/optional target), and — when `unassignedCents > 0` — a "Soumaya's suggestion" card showing the proposed split with **Accept** / **Adjust** (adjust opens the same simple per-job amount inputs, pre-filled from the suggestion). | 🟢 |
| `graph/moneySky.ts` | Render the new `"unassigned"` star kind: dim, desaturated, gently drifting (no fixed orbit lock like the other money stars — a small independent wobble, reduced-motion → static), a hollow-circle glyph (`○`) distinct from bill/goal glyphs. On accepting a suggestion, a short one-shot particle travel from the unassigned star's position to the target job-star (reuses the existing particle-emission mechanics behind `fireRecall`), then the unassigned star shrinks/dims proportionally to what was just assigned. | 🟡 (new render logic in an existing, already-tested module; no changes to bill rendering) |

No DB migration risk (additive table). No LLM dependency — fully offline-safe, matching every
other Financial-OS surface. No changes to `fin_income`/`fin_expense`/`fin_bill`.

## Logic

- **Tiers drive priority, condition drives the split.** `shortfallCents > 0` or buffer under ~2
  weeks of average bill load → safety jobs get first claim on `unassignedCents` (filled to their
  target before anything else gets a cent); remaining, if any, splits 70/30 growth/fun. Healthy
  buffer + no shortfall → safety jobs still get topped up to target first (a funded emergency fund
  is never actively worked against), then remaining splits 50/50 growth/fun. These exact splits are
  a starting point, not sacred — the acceptance criterion is "reasoning that visibly responds to
  the user's actual condition," not these specific numbers.
- A job with no `target_cents` (an open-ended bucket, e.g. general "Investing") never triggers
  `goal_reached` and always renders as a modest, steady `goal_filling` — there's no ceiling to hit.
- Accepting a suggestion is the ONLY thing that changes `allocated_cents` — nothing here ever moves
  money automatically. This mirrors the codebase's standing rule that every autonomous nudge is
  proposed, never silently acted on (bill-risk, check-ins, weekly review — all the same shape).
- Archiving a job keeps its history (matches `archiveNode`'s "rest it, don't erase it" pattern)
  rather than deleting the allocation record outright.

## UX

- "🧭 Jobs" lives inside the Money tab, alongside the existing Safe-to-Spend / bills / afford
  sections — not a new tab (matches the standing "no tab removal, no rebuild" rule and Progressive
  Discovery's own philosophy of composing within what's there).
- The suggestion card reads plainly, e.g.: *"You've got $120 that isn't doing anything yet. Your
  buffer's a little thin right now, so I'd put $90 toward Emergency Fund and $30 toward Fun Money."*
  — Soumaya's voice when an LLM key is present; a plain deterministic template line otherwise
  (offline-safe, same fallback discipline as the rest of Money).
- In the galaxy: the unassigned star is the one money-star that looks *unsettled* — dim, adrift,
  no fixed place — precisely so "money without a job" reads as visually different from "money with
  somewhere to go," without relying on color alone (shape/motion carry it too, per house rule).

## 🧪 Test plan

- `finance/allocationSuggest.ts`: pure function, hit hard — thin buffer routes surplus to safety
  first; healthy buffer splits growth/fun; a job already at its target is skipped even if it's the
  highest-tier match; total suggested never exceeds `unassignedCents`; zero jobs / zero unassigned
  both return an empty suggestion list without crashing.
- `finance/sky.ts`: extend existing tests — a job below target emits `goal_filling` with correct
  `fillPct`; a job at/above target emits `goal_reached` once (not a repeating bloom trigger); an
  open-ended job never sets `fillPct`; `unassignedCents` below the $5 floor emits no star; space
  isolation (another space's jobs/allocations never leak into `moneySky()`'s output).
- `repositories/finAllocation.repo.ts`: `allocate()` clamps at `target_cents`, never goes negative,
  archived jobs excluded from `list()` by default.
- Route tests: `POST /allocations/:id/accept` is the only path that mutates `allocated_cents`;
  space-scoping regression test (same discipline as every other finance route).
- Full gate: `npm run typecheck && npm test && npm run build -w @brain/web`.

## Risks

- `unassignedCents`'s live-safe-to-spend definition (Decision #4) can drift from reality if the
  user spends money they'd mentally earmarked without touching the app — an inherent limit of
  advisory-only tracking with no real account link. Stated plainly in the UX copy (Soumaya's
  suggestion language should read as "isn't doing anything **yet**," not a hard accounting claim).
- Tier-based priority is a heuristic, not a guarantee of correct financial advice — same "she
  reasons from your real numbers, never preachy" guardrail already governing the rest of Money.

## ✅ Acceptance criteria

1. A user can create a named job with a tier and optional target, see it as a star in the money
   sky, and watch it fill (or sit as a steady open-ended bucket) as allocations land.
2. When there's unassigned surplus, Soumaya proposes a specific split that visibly changes based on
   whether the budget is currently tight or healthy — not a fixed ratio regardless of condition.
3. Accepting a suggestion is the only way `allocated_cents` changes; nothing moves automatically.
4. The unassigned-money visual reads as distinct (dim/drifting/hollow glyph) from a funded bill or
   filling goal, without relying on color alone.
5. Gate green; no schema migration risk; fully offline-safe (works with zero LLM key).

## Open questions for review

1. Tier split ratios above (70/30, 50/50) are a first cut — happy to tune once it's visible.
2. Should archiving a job with `allocated_cents > 0` return that amount to "unassigned," or just
   freeze it in place (recoverable if unarchived)? Leaning toward freeze-in-place — simpler, and
   matches "archive rests it, doesn't undo it" elsewhere in the app — but flagging since it's the
   one real edge case in the model.
3. The Audit (Part C) and the formal `fin_plan` period ritual (Decision #1) are real, valuable
   follow-ons once this ships — not forgotten, just sequenced after.

## Next step after approval

Implement directly — additive throughout, no schema risk, no LLM dependency to gate behind.
