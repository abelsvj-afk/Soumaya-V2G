import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { BudgetSummary } from "@brain/shared";
import { FinAccountRepo } from "../repositories/finAccount.repo.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { FinBillRepo } from "../repositories/finBill.repo.js";
import { computeBudget, estimateNextIncomeDate, weekStart, weeksOfIncomeHistory } from "./budget.js";
import { toDay } from "./bills.js";

/**
 * Compose the space's repositories into a live BudgetSummary. This is the single entry point
 * the (future) route + the AI snapshot use. It (a) estimates the next-income horizon from the
 * income cadence, (b) idempotently materializes bill occurrences up to that horizon, then
 * (c) runs the pure Budget Engine. `now` is injectable for deterministic tests.
 */
export function getBudgetSummary(
  handle: DbHandle,
  spaceId: string = DEFAULT_SPACE,
  now: Date = new Date(),
  cadenceDays?: number,
): BudgetSummary {
  const accounts = new FinAccountRepo(handle, spaceId);
  const income = new FinIncomeRepo(handle, spaceId);
  const bills = new FinBillRepo(handle, spaceId);

  const account = accounts.getOrCreate();
  const incomeDates = income.dates();
  const today = toDay(now);
  const nextIncomeDate = estimateNextIncomeDate(incomeDates, now, cadenceDays);

  // Ensure occurrences exist through the horizon (idempotent), then read the unpaid ones.
  bills.materializeAll(today, nextIncomeDate);
  const occurrences = bills.unpaidThrough(nextIncomeDate).map((o) => ({
    billId: o.billId, name: o.name, amountCents: o.amountCents, dueDate: o.dueDate,
  }));

  const weekEarnedCents = income.sumNetBetween(weekStart(now), today);
  // Rough trailing average over up to 4 weeks — what scenario questions ("how many weeks
  // to afford X") are computed from. Computed once here so every consumer (chat snapshot,
  // the /afford route) reads the same number instead of each re-deriving it independently.
  // Divide by ACTUAL weeks of income history, not a hardcoded 4 — dividing a brand-new
  // account's first paycheck by 4 understated a real $800/wk earner as $200/wk on day 2
  // (measured directly). weeksOfIncomeHistory caps at 4 once there's real history, so this
  // reproduces the prior fixed-window behavior exactly for anyone past their first month.
  const fourWeeksAgo = toDay(new Date(now.getTime() - 28 * 86_400_000));
  const weeks = weeksOfIncomeHistory(incomeDates[0], today);
  const avgWeeklyIncomeCents = Math.round(income.sumNetBetween(fourWeeksAgo, today) / weeks);

  return computeBudget({
    balanceCents: account.balanceCents,
    bufferCents: account.bufferCents,
    occurrences,
    incomeDates,
    weekEarnedCents,
    avgWeeklyIncomeCents,
    now,
    cadenceDays,
  });
}
