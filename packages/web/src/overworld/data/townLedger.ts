/**
 * Town Economy round (docs/overworld/npc-economy.md) — a purely cosmetic in-game ledger.
 * Resolved directly with the user (2026-09-12): wages are NEVER the real Bank/finance data
 * (`getMoneySky`/`getFinanceSummary`) and never the real `Fuel` resource (shared/types.ts's
 * `Fuel` is "cost the agent pays per autonomous LLM job" — a server-side LLM cost meter, not a
 * player-spendable currency; checked before assuming otherwise). Hours/wages/treasury here are
 * entirely fictional, isolated in their own localStorage bucket, same convention as
 * achievements.ts/npcRelationships.ts.
 *
 * Real pricing-gauged income (docs/overworld/simcity-economy-construction.md, task #86) — real
 * feedback that treasury income should be "gauged correctly based on... pricing," not a flat
 * rate identical for every building regardless of what actually happened. `creditHour` now
 * accumulates real EARNED CENTS per place (not `hours × flat-rate` computed at read time), so a
 * point-of-sale caller (a Market/Business good purchase) can credit a real cut of that specific
 * sale's price via `revenueForPriceCents`, while every civic-building call site keeps the exact
 * same flat rate as before by simply not passing an override.
 */

/** Fictional cents per hour worked — the flat baseline for civic buildings (no real pricing
 *  data exists there to gauge against) and the floor under any pricing-gauged sale below. */
const WAGE_PER_HOUR_CENTS = 25;

/** The real cut of a sale's own price that flows to the treasury as earned income — a genuinely
 *  pricier good earns more, a cheap one still earns at least the flat baseline. */
const REVENUE_RATE = 0.5;

/** How much a real point-of-sale (a Market/Business good purchase) should credit the treasury,
 *  gauged by that specific sale's own real price — never invented, never flat regardless of
 *  value (simcity-economy-construction.md decision #1). */
export function revenueForPriceCents(priceCents: number): number {
  return Math.max(WAGE_PER_HOUR_CENTS, Math.round(priceCents * REVENUE_RATE));
}

function hoursKey(spaceId: string): string {
  return `brain.townLedger.hours.${spaceId}`;
}

function earnedKey(spaceId: string): string {
  return `brain.townLedger.earned.${spaceId}`;
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

function loadEarned(spaceId: string): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(earnedKey(spaceId)) || "{}");
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

/** Credits one real interaction to this building — called once per real interaction
 *  (npcJobs.ts's `recordBuildingWork`), never on a timer. `wageCents` defaults to the flat civic
 *  baseline; a point-of-sale caller passes `revenueForPriceCents(priceCents)` instead so the
 *  real amount earned is gauged by what was actually sold. Returns the new interaction count
 *  (unchanged contract — still "hours worked", an interaction count, not earned cents). */
export function creditHour(spaceId: string, placeId: string, wageCents: number = WAGE_PER_HOUR_CENTS): number {
  const hours = loadHours(spaceId);
  const nextHours = (hours[placeId] ?? 0) + 1;
  hours[placeId] = nextHours;
  const earned = loadEarned(spaceId);
  earned[placeId] = (earned[placeId] ?? 0) + wageCents;
  try {
    localStorage.setItem(hoursKey(spaceId), JSON.stringify(hours));
    localStorage.setItem(earnedKey(spaceId), JSON.stringify(earned));
  } catch {
    /* the interaction still happened — worst case it's just not remembered */
  }
  return nextHours;
}

export function hoursWorked(spaceId: string, placeId: string): number {
  return loadHours(spaceId)[placeId] ?? 0;
}

export function wagesEarnedCents(spaceId: string, placeId: string): number {
  return loadEarned(spaceId)[placeId] ?? 0;
}

/** Every building that has ever earned an hour, sorted for stable display. */
export function workedPlaceIds(spaceId: string): string[] {
  return Object.keys(loadHours(spaceId)).sort();
}

/** The town's total real earnings across every building — the pool the Market spends from. */
export function townTreasuryEarnedCents(spaceId: string): number {
  return Object.values(loadEarned(spaceId)).reduce((sum, cents) => sum + cents, 0);
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

/** The exact inverse of `spendFromTreasury` — real cents given back because a purchase was
 *  voided before it was ever placed (re-arming a Hangar/Housing/Business slot that had already
 *  spent on a different selection forfeited that money with no way to get it back — a real bug,
 *  fixed here rather than in the callers so every arm-then-place module shares one refund path).
 *  Never lets the recorded "spent" total go negative, which would otherwise inflate the balance
 *  beyond what the town ever actually earned. A no-op for a non-positive amount. */
export function refundToTreasury(spaceId: string, amountCents: number): void {
  if (amountCents <= 0) return;
  const next = Math.max(0, loadSpentCents(spaceId) - amountCents);
  try {
    localStorage.setItem(spentKey(spaceId), String(next));
  } catch {
    /* the refund still applies for this call; a failed persist just risks not being remembered */
  }
}
