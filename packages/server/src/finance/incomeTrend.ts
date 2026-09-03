import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { IncomePoint } from "@brain/shared";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";

/**
 * Income trend (docs/specs/income-net-worth-trend.md) — monthly net-income totals across
 * every source (paycheck, pay-stub-derived, self-employed/business), for the "📈 Growth"
 * chart. Pure SQL aggregation, no LLM — offline-safe like the rest of Financial OS.
 *
 * `bySource` (spec Decision #2) is a nice-to-have breakdown from a platform-text heuristic,
 * NOT a hard categorization — a business income row typed without a recognizable word falls
 * into the generic "paycheck" bucket. The total line is unaffected either way.
 */
const SELF_EMPLOYED_RE = /\b(self[- ]?employed|business|freelance|contractor|1099)\b/i;

function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7); // YYYY-MM
}

/** `months` consecutive month-start ISO dates, oldest first, ending at `now`'s month. */
function monthStarts(months: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 10));
  }
  return out;
}

export function incomeSeries(handle: DbHandle, spaceId: string = DEFAULT_SPACE, months = 12, now: Date = new Date()): IncomePoint[] {
  const starts = monthStarts(Math.max(1, months), now);
  const rangeStart = starts[0]!;
  const rangeEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const rows = new FinIncomeRepo(handle, spaceId).listBetween(rangeStart, rangeEnd);

  const byMonth = new Map<string, { total: number; paycheck: number; selfEmployed: number }>();
  for (const periodStart of starts) byMonth.set(monthKey(periodStart), { total: 0, paycheck: 0, selfEmployed: 0 });

  for (const row of rows) {
    const bucket = byMonth.get(monthKey(row.date));
    if (!bucket) continue; // defensive: outside the requested range
    bucket.total += row.netCents;
    if (row.platform && SELF_EMPLOYED_RE.test(row.platform)) bucket.selfEmployed += row.netCents;
    else bucket.paycheck += row.netCents;
  }

  return starts.map((periodStart) => {
    const b = byMonth.get(monthKey(periodStart))!;
    return { periodStart, totalCents: b.total, bySource: { paycheck: b.paycheck, selfEmployed: b.selfEmployed } };
  });
}
