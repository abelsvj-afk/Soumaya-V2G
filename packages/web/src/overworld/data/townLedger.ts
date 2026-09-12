/**
 * Town Economy round (docs/overworld/npc-economy.md) — a purely cosmetic in-game ledger.
 * Resolved directly with the user (2026-09-12): wages are NEVER the real Bank/finance data
 * (`getMoneySky`/`getFinanceSummary`) and never the real `Fuel` resource (shared/types.ts's
 * `Fuel` is "cost the agent pays per autonomous LLM job" — a server-side LLM cost meter, not a
 * player-spendable currency; checked before assuming otherwise). Hours/wages/treasury here are
 * entirely fictional, isolated in their own localStorage bucket, same convention as
 * achievements.ts/npcRelationships.ts.
 */

/** Fictional cents per hour worked — a readable unit, never real money. */
const WAGE_PER_HOUR_CENTS = 25;

function hoursKey(spaceId: string): string {
  return `brain.townLedger.hours.${spaceId}`;
}

function spentKey(spaceId: string): string {
  return `brain.townLedger.spent.${spaceId}`;
}

function loadHours(spaceId: string): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(hoursKey(spaceId)) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function loadSpentCents(spaceId: string): number {
  try {
    const raw = Number(localStorage.getItem(spentKey(spaceId)) || "0");
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  } catch {
    return 0;
  }
}

/** Credits one real hour of work to this building — called once per real interaction
 *  (npcJobs.ts's `recordBuildingWork`), never on a timer. Returns the new total. */
export function creditHour(spaceId: string, placeId: string): number {
  const all = loadHours(spaceId);
  const next = (all[placeId] ?? 0) + 1;
  all[placeId] = next;
  try {
    localStorage.setItem(hoursKey(spaceId), JSON.stringify(all));
  } catch {
    /* the hour still happened — worst case it's just not remembered */
  }
  return next;
}

export function hoursWorked(spaceId: string, placeId: string): number {
  return loadHours(spaceId)[placeId] ?? 0;
}

export function wagesEarnedCents(spaceId: string, placeId: string): number {
  return hoursWorked(spaceId, placeId) * WAGE_PER_HOUR_CENTS;
}

/** Every building that has ever earned an hour, sorted for stable display. */
export function workedPlaceIds(spaceId: string): string[] {
  return Object.keys(loadHours(spaceId)).sort();
}

/** The town's total real earnings across every building — the pool the Market spends from. */
export function townTreasuryEarnedCents(spaceId: string): number {
  const all = loadHours(spaceId);
  return Object.values(all).reduce((sum, hours) => sum + hours * WAGE_PER_HOUR_CENTS, 0);
}

/** What's actually left to spend — earned minus already spent. Never negative. */
export function treasuryBalanceCents(spaceId: string): number {
  return Math.max(0, townTreasuryEarnedCents(spaceId) - loadSpentCents(spaceId));
}

/** Spends from the treasury (a Market purchase) if the balance actually covers it. Returns
 *  false and changes nothing when it doesn't — the treasury can never go negative. */
export function spendFromTreasury(spaceId: string, amountCents: number): boolean {
  if (amountCents <= 0) return false;
  if (amountCents > treasuryBalanceCents(spaceId)) return false;
  const next = loadSpentCents(spaceId) + amountCents;
  try {
    localStorage.setItem(spentKey(spaceId), String(next));
  } catch {
    /* the check above still holds for this call; a failed persist just risks re-spending later */
  }
  return true;
}
