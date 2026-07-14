import type { FinBill } from "@brain/shared";

/**
 * Forecast Engine (Stage 3) — PURE cash-flow projection (no DB/LLM). Normalizes recurring bills
 * to a weekly load, then answers scenario questions ("can I afford X", "when can I…") from the
 * user's average weekly income. Deterministic; the LLM only phrases the answer. See
 * docs/financial-os/architecture.md §7.
 */

/** A bill's cost expressed as cents-per-week (so different frequencies are comparable). */
export function billWeeklyCents(bill: Pick<FinBill, "amountCents" | "frequency" | "everyDays">): number {
  switch (bill.frequency) {
    case "weekly": return bill.amountCents;
    case "biweekly": return bill.amountCents / 2;
    case "monthly": return (bill.amountCents * 12) / 52;
    case "custom": return (bill.amountCents * 7) / Math.max(1, bill.everyDays ?? 30);
  }
}

/** Total weekly bill load across active bills, in whole cents. */
export function weeklyBillLoadCents(bills: Array<Pick<FinBill, "amountCents" | "frequency" | "everyDays" | "active">>): number {
  return Math.round(bills.filter((b) => b.active !== false).reduce((s, b) => s + billWeeklyCents(b), 0));
}

/** Weekly surplus = average weekly income − weekly bill load (may be negative). */
export function weeklySurplusCents(avgWeeklyIncomeCents: number, weeklyBillCents: number): number {
  return Math.round(avgWeeklyIncomeCents - weeklyBillCents);
}

/**
 * Whole weeks to accumulate `targetCents` of surplus at the current pace. Returns Infinity when
 * the surplus is ≤ 0 (you can't get there without earning more or cutting bills). `extraPerWeek`
 * models "if I work N extra shifts" — added to the surplus.
 */
export function weeksToAfford(targetCents: number, surplusCents: number, extraPerWeekCents = 0): number {
  const rate = surplusCents + extraPerWeekCents;
  if (rate <= 0) return Infinity;
  return Math.ceil(targetCents / rate);
}
