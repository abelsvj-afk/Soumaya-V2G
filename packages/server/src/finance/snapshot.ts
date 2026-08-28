import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { getBudgetSummary } from "./summary.js";
import { FinBillRepo } from "../repositories/finBill.repo.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { weekStart } from "./budget.js";
import { toDay } from "./bills.js";
import { weeklyBillLoadCents, weeklySurplusCents } from "./forecast.js";

/**
 * Compact, AGGREGATED financial snapshot for the AI Orchestrator (Stage 2). Per decision D5,
 * only totals + top lines are exposed to the LLM — never raw statements or full transaction
 * logs. The math is deterministic (Budget Engine); the LLM only explains it. Returns null when
 * the module is empty so chat stays silent about money for users who don't use it.
 */
export function financialSnapshotText(handle: DbHandle, spaceId: string = DEFAULT_SPACE, now: Date = new Date()): string | null {
  const income = new FinIncomeRepo(handle, spaceId);
  const bills = new FinBillRepo(handle, spaceId).list();
  const hasData = income.list(1).length > 0 || bills.length > 0;
  if (!hasData) return null;

  const b = getBudgetSummary(handle, spaceId, now);
  const d = (c: number) => `$${(c / 100).toFixed(2)}`;
  const weekEarned = b.weekEarnedCents;
  const avgWeekly = b.avgWeeklyIncomeCents;

  const reserved = b.reserved.map((r) => `${r.name} ${d(r.amountCents)} (due ${r.dueDate})`).join(", ") || "none";

  // Forecast (Stage 3): weekly bill load + surplus, so scenario questions ("can I afford X",
  // "when can I…", "if I work extra shifts") are answerable from the pace.
  const weeklyBills = weeklyBillLoadCents(bills);
  const surplus = weeklySurplusCents(avgWeekly, weeklyBills);

  // The Money tab is more than "reserved before next income" — the FULL recurring-bill
  // list (already fetched above) and where spending actually goes both live there too,
  // same reasoning as the Mind-tab snapshot covering more than just tracked people.
  const allBills =
    bills.length > 0
      ? bills.map((bl) => `${bl.name} ${d(bl.amountCents)}/${bl.frequency}${bl.autopay ? " (autopay)" : ""}`).join(", ")
      : "none";
  const monthAgo = toDay(new Date(now.getTime() - 30 * 86_400_000));
  const today = toDay(now);
  const categoryRows = handle.sqlite
    .prepare(
      `SELECT category, SUM(amount_cents) AS total FROM fin_expense
       WHERE space_id = ? AND direction = 'out' AND date >= ? AND date <= ?
       GROUP BY category ORDER BY total DESC LIMIT 5`,
    )
    .all(spaceId, monthAgo, today) as { category: string; total: number }[];
  const categories = categoryRows.length > 0 ? categoryRows.map((c) => `${c.category} ${d(c.total)}`).join(", ") : "none recorded";

  return [
    "FINANCE SNAPSHOT (aggregated, deterministic — cite these numbers, do NOT recompute):",
    `- Balance: ${d(b.balanceCents)}; Buffer kept aside: ${d(b.bufferCents)}.`,
    `- Reserved for bills before next expected income (${b.nextIncomeDate}): ${d(b.reservedCents)} — ${reserved}.`,
    `- Safe to spend now: ${d(b.safeToSpendCents)}${b.shortfallCents > 0 ? `; SHORTFALL of ${d(b.shortfallCents)} (bills exceed balance)` : ""}.`,
    `- Earned this week (since ${weekStart(now)}): ${d(weekEarned)}; ~4-week average weekly income: ${d(avgWeekly)}.`,
    `- Weekly bill load: ${d(weeklyBills)}; weekly surplus at current pace: ${d(surplus)}${surplus <= 0 ? " (not saving — earning barely covers bills)" : ""}.`,
    `- All recurring bills: ${allBills}.`,
    `- Top spending categories (last 30 days): ${categories}.`,
    "For scenarios (can I afford X by when / when can I reach a goal / if I pick up extra shifts), reason from the weekly surplus and the user's goals. Be concrete + encouraging, never preachy; show the rough math (weeks ≈ target ÷ weekly surplus).",
  ].join("\n");
}
