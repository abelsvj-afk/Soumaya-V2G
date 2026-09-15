/**
 * Passive income from built structures (docs/overworld/wave3-economy-depth.md decision #1) —
 * closes the core economy-pacing complaint: everything built used to be a pure one-time expense
 * that never paid anything back, the exact inversion of how a real city-builder's economy works.
 * Every placed home/business now accrues real rent continuously, computed fresh at read time
 * from a real elapsed-time delta — the same wall-clock convention `buildingNeglect.ts`/
 * `isUnderConstruction` already use, never a running timer.
 *
 * Deliberately does NOT touch `npcJobs.ts`'s `recordBuildingWork`/`creditHour` or
 * `buildingNeglect.ts`'s `markWorked`: earning rent is real elapsed time, not a real player
 * interaction, so it must never reset a business's own neglect clock or count toward its
 * "hours worked" — those stay an honest signal of real visits only (`townLedger.ts`'s new
 * `creditPassiveIncome` credits the earned total directly, bypassing both).
 */

import { creditPassiveIncome } from "./townLedger.js";
import { homeTypeById, placedHomes, isUnderConstruction as isHomeUnderConstruction } from "./housing.js";
import { businessTypeById, placedBusinesses, isUnderConstruction as isBusinessUnderConstruction } from "./business.js";
import { isFootprintAdjacentToZone } from "./zoning.js";

/** 10% of a structure's own real purchase price, per real day elapsed — a genuinely pricier
 *  building earns more, matching `revenueForPriceCents`'s own "gauged by real pricing"
 *  principle. */
const DAILY_RATE = 0.1;

/** Accrual stops accumulating past 3 real days since last collected — bounds the maximum single
 *  credit so leaving the game untouched indefinitely isn't a real AFK-farming exploit. */
const MAX_ACCRUAL_DAYS = 3;

/** A structure genuinely adjacent to a real sidewalk earns rent at 1.5x the base rate — "real
 *  foot traffic access does better." */
const SIDEWALK_BONUS_MULTIPLIER = 1.5;

const MS_PER_DAY = 86_400_000;

function lastCollectedKey(spaceId: string): string {
  return `brain.passiveIncome.lastCollected.${spaceId}`;
}

function loadLastCollected(spaceId: string): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(lastCollectedKey(spaceId)) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function saveLastCollected(spaceId: string, map: Record<string, number>): void {
  try {
    localStorage.setItem(lastCollectedKey(spaceId), JSON.stringify(map));
  } catch {
    /* the accrual already happened this call; worst case it re-accrues from an earlier stamp */
  }
}

function dailyRateCents(priceCents: number, sidewalkAdjacent: boolean): number {
  const base = priceCents * DAILY_RATE;
  return sidewalkAdjacent ? base * SIDEWALK_BONUS_MULTIPLIER : base;
}

/** Credits whatever whole cents have genuinely accrued since `lastCollected[id]` (defaulting to
 *  the structure's own real `builtAt`), capped at `MAX_ACCRUAL_DAYS`. Deliberately only advances
 *  the stamp when it actually credits something — if less than a real elapsed day's worth of a
 *  single cent has passed, the stamp is left alone so that real sub-cent time keeps accumulating
 *  toward the next whole cent instead of being silently discarded by frequent refreshes. */
function accrueOne(
  spaceId: string,
  id: string,
  priceCents: number,
  builtAt: number,
  sidewalkAdjacent: boolean,
  nowMs: number,
  lastCollected: Record<string, number>,
): void {
  const since = lastCollected[id] ?? builtAt;
  const elapsedMs = Math.min(Math.max(0, nowMs - since), MAX_ACCRUAL_DAYS * MS_PER_DAY);
  const cents = Math.floor(dailyRateCents(priceCents, sidewalkAdjacent) * (elapsedMs / MS_PER_DAY));
  if (cents <= 0) return;
  creditPassiveIncome(spaceId, id, cents);
  lastCollected[id] = nowMs;
}

/** Call once per real world-snapshot refresh (`loadWorldSnapshot.ts`) — accrues and credits real
 *  passive income for every placed home/business that's actually finished construction. `nowMs`
 *  defaults to the real clock, only ever overridden in tests. */
export function collectPassiveIncome(spaceId: string, nowMs: number = Date.now()): void {
  const lastCollected = loadLastCollected(spaceId);
  for (const home of placedHomes(spaceId)) {
    if (isHomeUnderConstruction(home, nowMs)) continue;
    const type = homeTypeById(home.typeId);
    if (!type) continue;
    const sidewalkAdjacent = isFootprintAdjacentToZone(spaceId, home.x0, home.y0, home.x1, home.y1, "sidewalk");
    accrueOne(spaceId, home.id, type.priceCents, home.builtAt, sidewalkAdjacent, nowMs, lastCollected);
  }
  for (const business of placedBusinesses(spaceId)) {
    if (isBusinessUnderConstruction(business, nowMs)) continue;
    const type = businessTypeById(business.typeId);
    if (!type) continue;
    const sidewalkAdjacent = isFootprintAdjacentToZone(spaceId, business.x0, business.y0, business.x1, business.y1, "sidewalk");
    accrueOne(spaceId, business.id, type.priceCents, business.builtAt, sidewalkAdjacent, nowMs, lastCollected);
  }
  saveLastCollected(spaceId, lastCollected);
}
