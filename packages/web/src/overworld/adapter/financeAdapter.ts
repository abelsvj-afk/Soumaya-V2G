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

/**
 * Town Economy round (docs/overworld/npc-economy.md) — real Bank "work": a bill actually paid
 * or a goal actually reached since the last snapshot. BankOverlay.tsx has no button of its own
 * (it's a read-only ledger), so unlike every other building this is detected by diffing two
 * snapshots rather than hooked at a single call site — OverworldRoot.tsx calls this on every
 * refresh with the previous and current rows. Never re-credits a row already paid/reached
 * before (no free hours just from re-opening the Bank).
 */
export function detectBankWork(oldRows: readonly BankLedgerRow[], newRows: readonly BankLedgerRow[]): boolean {
  const DONE_STATES: ReadonlySet<MoneyStarState> = new Set(["paid", "goal_reached"]);
  const wasDone = new Set(oldRows.filter((r) => DONE_STATES.has(r.state)).map((r) => `${r.kind}-${r.id}`));
  return newRows.some((r) => DONE_STATES.has(r.state) && !wasDone.has(`${r.kind}-${r.id}`));
}
