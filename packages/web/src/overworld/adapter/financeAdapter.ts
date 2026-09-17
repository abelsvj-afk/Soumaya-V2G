import type { MoneyStar, MoneyStarState } from "@brain/shared";
import type { BankLedgerRow } from "../types.js";

/** D9/FR7 — every MoneyStarState gets its own icon; urgency is never color-only. */
const ICON_BY_STATE: Record<MoneyStarState, string> = {
  calm: "🕊️",
  approaching: "⏳",
  cooling: "🧊",
  overdue: "⚠️",
  paid: "✅",
  goal_filling: "🌱",
  goal_reached: "🏁",
};

const URGENT_STATES: ReadonlySet<MoneyStarState> = new Set(["overdue", "approaching"]);

/** Maps a real MoneyStar (GET /api/finance/sky) to a Bank ledger row — no new finance math. */
export function moneyStarToBankRow(star: MoneyStar): BankLedgerRow {
  return {
    id: star.id,
    kind: star.kind,
    label: star.label,
    amountCents: star.amountCents,
    state: star.state,
    icon: ICON_BY_STATE[star.state],
    isUrgent: URGENT_STATES.has(star.state),
    dueInDays: star.dueInDays,
    fillPct: star.fillPct,
  };
}

export function moneyStarsToBankRows(stars: readonly MoneyStar[]): BankLedgerRow[] {
  return stars.map(moneyStarToBankRow);
}

/** FR6 — the shop-counter afford check: greys out anything above safeToSpendCents. */
export function canAfford(priceCents: number, safeToSpendCents: number): boolean {
  return priceCents <= safeToSpendCents;
}
