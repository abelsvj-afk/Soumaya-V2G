import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { MoneyStar, MoneyStarState } from "@brain/shared";
import { getBudgetSummary } from "./summary.js";
import { FinBillRepo } from "../repositories/finBill.repo.js";
import { parseDay, toDay } from "./bills.js";

/**
 * Money-sky (Stage 4 Part A) — turns bills into "stars" with a STATE the galaxy renders as
 * colour/glow/glyph (cooling = blue). Deterministic, from the Budget Engine (offline). The web
 * moneySky layer draws one small star per entry; the `glyph` is the on-focus status icon.
 * See docs/financial-os/stage-4-galaxy-and-zero-based.md §A2.
 */

const DAY_MS = 86_400_000;
const SOON_DAYS = 7;

const GLYPH: Record<MoneyStarState, string> = {
  calm: "•",
  approaching: "◐",
  cooling: "❄",
  overdue: "!",
  paid: "✓",
  goal_filling: "◔",
  goal_reached: "✦",
};

export function moneySky(handle: DbHandle, spaceId: string = DEFAULT_SPACE, now: Date = new Date()): MoneyStar[] {
  const budget = getBudgetSummary(handle, spaceId, now);
  const bills = new FinBillRepo(handle, spaceId);
  const today = toDay(now);
  // Materialize a window AROUND now (getBudgetSummary only fills forward), so a just-overdue
  // occurrence exists too, then pick each bill's CURRENT-period occurrence (closest to today).
  const from = toDay(new Date(now.getTime() - 35 * DAY_MS));
  const horizon = toDay(new Date(now.getTime() + 45 * DAY_MS));
  bills.materializeAll(from, horizon);
  const autopay = new Map(bills.list().map((b) => [b.id, b.autopay]));

  const current = new Map<number, { billId: number; name: string; amountCents: number; dueDate: string; abs: number }>();
  for (const occ of bills.upcoming(300)) {
    const abs = Math.abs(parseDay(occ.dueDate).getTime() - parseDay(today).getTime());
    const prev = current.get(occ.billId);
    if (!prev || abs < prev.abs) current.set(occ.billId, { billId: occ.billId, name: occ.name, amountCents: occ.amountCents, dueDate: occ.dueDate, abs });
  }

  const stars: MoneyStar[] = [];
  for (const occ of current.values()) {
    const dueInDays = Math.round((parseDay(occ.dueDate).getTime() - parseDay(today).getTime()) / DAY_MS);

    let state: MoneyStarState;
    if (dueInDays < 0) {
      state = "overdue";
    } else if (budget.shortfallCents > 0 || budget.safeToSpendCents < occ.amountCents) {
      // Can't comfortably cover it → cooling (the user's blue). Autopay bills are assumed to
      // clear, so they don't cool unless we're genuinely short.
      state = !autopay.get(occ.billId) || budget.shortfallCents > 0 ? "cooling" : "calm";
    } else if (dueInDays <= SOON_DAYS) {
      state = "approaching";
    } else {
      state = "calm";
    }

    // Intensity: overdue/cooling = high; approaching ramps as the date nears; calm low.
    const intensity =
      state === "overdue" || state === "cooling" ? 1
      : state === "approaching" ? Math.max(0.4, 1 - dueInDays / SOON_DAYS)
      : 0.3;

    stars.push({ kind: "bill", id: occ.billId, label: occ.name, amountCents: occ.amountCents, state, glyph: GLYPH[state], intensity, dueInDays });
  }
  return stars;
}
