import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { BudgetSummary } from "@brain/shared";
import { FinAccountRepo } from "../repositories/finAccount.repo.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { FinBillRepo } from "../repositories/finBill.repo.js";
import { computeBudget, estimateNextIncomeDate, weekStart } from "./budget.js";
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

  return computeBudget({
    balanceCents: account.balanceCents,
    bufferCents: account.bufferCents,
    occurrences,
    incomeDates,
    weekEarnedCents,
    now,
    cadenceDays,
  });
}
