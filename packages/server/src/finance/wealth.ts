import type { BudgetSummary, WealthSummary, FinGoalWithProgress, ReconciliationStatus } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { FinBucketRepo } from "../repositories/finBucket.repo.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { FinAllocationRepo } from "../repositories/finAllocation.repo.js";

/**
 * Wealth Engine — PURE math (no DB, no LLM), same discipline as finance/budget.ts. This layer
 * reads Safe-to-Spend as an input and never redefines it (docs/specs/wealth-goals-allocation.md
 * §9) — Money stays untouched and authoritative.
 */

/** null when the goal has no target (open-ended — never reaches 100%). Clamped to [0, 1]. */
export function fillPct(totalCents: number, targetCents: number | null | undefined): number | null {
  if (targetCents == null || targetCents <= 0) return null;
  return Math.max(0, Math.min(1, totalCents / targetCents));
}

/** Open-ended goals always render as steadily "filling" — there's no ceiling to reach. */
export function goalState(totalCents: number, targetCents: number | null | undefined): "goal_filling" | "goal_reached" {
  const pct = fillPct(totalCents, targetCents);
  return pct != null && pct >= 1 ? "goal_reached" : "goal_filling";
}

/** Safe-to-Spend minus what's already earmarked toward goals. May be negative — that's the
 *  reconciliation signal, not a bug to guard against. */
export function deployableCents(safeToSpendCents: number, allocatedCents: number): number {
  return safeToSpendCents - allocatedCents;
}

export function reconciliationStatus(deployable: number): ReconciliationStatus {
  return deployable >= 0 ? "ok" : "over_committed";
}

/**
 * Compose the space's Wealth repositories + the pure math above into a live WealthSummary.
 * `budget` is the already-computed BudgetSummary (from finance/summary.ts's getBudgetSummary)
 * — passed in rather than recomputed here, so Wealth can never drift from Money's own numbers.
 */
export function getWealthSummary(handle: DbHandle, spaceId: string = DEFAULT_SPACE, budget: BudgetSummary): WealthSummary {
  const buckets = new FinBucketRepo(handle, spaceId).list();
  const goalRepo = new FinGoalRepo(handle, spaceId);
  const allocationRepo = new FinAllocationRepo(handle, spaceId);

  const rawGoals = goalRepo.list();
  const totals = allocationRepo.totalsByGoal(rawGoals.map((g) => g.id));

  const goals: FinGoalWithProgress[] = rawGoals.map((g) => {
    const totalCents = totals.get(g.id) ?? 0;
    return { ...g, totalCents, fillPct: fillPct(totalCents, g.targetCents), state: goalState(totalCents, g.targetCents) };
  });

  const allocatedCents = goals.reduce((sum, g) => sum + g.totalCents, 0);
  const deployable = deployableCents(budget.safeToSpendCents, allocatedCents);

  return { buckets, goals, allocatedCents, deployableCents: deployable, reconciliation: reconciliationStatus(deployable) };
}
