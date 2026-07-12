import type { BudgetSummary, ReservedLine } from "@brain/shared";
import { parseDay, toDay } from "./bills.js";

/**
 * Budget Engine — PURE money math (no DB, no LLM). This is the heart of the Financial OS:
 * balance − reserved − buffer = Safe to Spend, computed deterministically so it's correct
 * with zero AI and easy to test hard. Amounts are INTEGER cents. See docs/financial-os/.
 */

const DAY_MS = 86_400_000;
const DEFAULT_HORIZON_DAYS = 14; // fallback "next income" horizon when cadence is unknown

/** Median whole-day gap between consecutive income dates (ascending). null if < 2. */
export function medianIncomeGapDays(incomeDates: string[]): number | null {
  const days = [...incomeDates]
    .map((d) => parseDay(d).getTime())
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (days.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) gaps.push(Math.round((days[i]! - days[i - 1]!) / DAY_MS));
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const m = gaps.length % 2 ? gaps[mid]! : (gaps[mid - 1]! + gaps[mid]!) / 2;
  return Math.max(1, Math.round(m));
}

/**
 * Estimate the date of the NEXT income — the horizon before which bills must be reserved.
 * Uses the recent income cadence (median gap from the last income), or an explicit
 * `cadenceDays`, else a safe default. Never returns a date in the past relative to `now`.
 */
export function estimateNextIncomeDate(
  incomeDates: string[],
  now: Date,
  cadenceDays?: number,
): string {
  const cadence = cadenceDays && cadenceDays > 0 ? Math.round(cadenceDays) : medianIncomeGapDays(incomeDates);
  const nowMs = now.getTime();
  if (cadence) {
    // Project forward from the most recent income by whole cadence steps until it's future.
    const last = [...incomeDates]
      .map((d) => parseDay(d).getTime())
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)
      .pop();
    if (last != null) {
      let next = last;
      let guard = 0;
      while (next <= nowMs && guard++ < 10_000) next += cadence * DAY_MS;
      return toDay(new Date(next));
    }
  }
  return toDay(new Date(nowMs + DEFAULT_HORIZON_DAYS * DAY_MS));
}

export interface UnpaidOccurrence {
  billId: number;
  name: string;
  amountCents: number;
  dueDate: string;
}

export interface BudgetInput {
  balanceCents: number;
  bufferCents: number;
  /** Unpaid, upcoming bill occurrences (any date; we filter by the horizon here). */
  occurrences: UnpaidOccurrence[];
  /** Dates of recorded income (for the cadence estimate). */
  incomeDates: string[];
  /** Net income already recorded this week (Mon-anchored), in cents. */
  weekEarnedCents: number;
  /** "now" — injected so the engine is deterministic under test. */
  now: Date;
  /** Optional explicit pay cadence (days) from settings. */
  cadenceDays?: number;
}

/**
 * Compute the live budget. RESERVED = unpaid occurrences due strictly before the next
 * expected income (so the money to cover them is set aside now). SAFE TO SPEND is floored
 * at 0 for display; the true SHORTFALL (reserved+buffer over balance) is surfaced separately
 * so we never show a misleadingly-positive number.
 */
export function computeBudget(input: BudgetInput): BudgetSummary {
  const nextIncomeDate = estimateNextIncomeDate(input.incomeDates, input.now, input.cadenceDays);
  const horizon = parseDay(nextIncomeDate).getTime();

  const reserved: ReservedLine[] = input.occurrences
    .filter((o) => parseDay(o.dueDate).getTime() <= horizon)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((o) => ({ billId: o.billId, name: o.name, amountCents: o.amountCents, dueDate: o.dueDate }));

  const reservedCents = reserved.reduce((s, r) => s + r.amountCents, 0);
  const balanceCents = input.balanceCents;
  const bufferCents = Math.max(0, input.bufferCents);
  const raw = balanceCents - reservedCents - bufferCents;

  return {
    balanceCents,
    bufferCents,
    reservedCents,
    reserved,
    safeToSpendCents: Math.max(0, raw),
    shortfallCents: raw < 0 ? -raw : 0,
    weekEarnedCents: input.weekEarnedCents,
    nextIncomeDate,
  };
}

/** Monday-anchored start of the week containing `now` (UTC), as `YYYY-MM-DD`. */
export function weekStart(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return toDay(new Date(d.getTime() - dow * DAY_MS));
}
