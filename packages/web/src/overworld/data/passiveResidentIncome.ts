/**
 * Population-growth passive income (docs/overworld/interior-camera-and-income-fixes.md, task
 * #125, decision #4) — closes the "people coming into the town" half of a real live complaint:
 * `passiveIncome.ts` already pays real rent from PLACED STRUCTURES, and `passiveNpcIncome.ts`
 * already taxes the 24 hand-authored society NPCs' real working hours, but a Resident
 * (`residents.ts`, task #118's population-growth batch) has no job/schedule at all — nothing
 * credited the treasury for their presence, so growing the town's real population had zero
 * economic effect. This module is the third, honestly separate stream: a small real trickle for
 * every Resident who is genuinely, currently housed (`housing.ts`'s own real `assignResidents`
 * output — the same capacity-packed source of truth the Mayor's Hall resident list already
 * trusts, never assumed/invented).
 *
 * Mirrors `passiveNpcIncome.ts`'s own baseline/no-retroactive-payout convention exactly: a
 * Resident id seen for the first time (or seen while not yet housed) just advances its own real
 * stamp with zero credit, so shipping this to an existing save — or a Resident who hasn't been
 * housed yet — can never pay out a surprise lump sum once housing/eligibility catches up.
 */

import { assignResidents } from "./housing.js";
import { allResidentNpcIds } from "./residents.js";
import { creditPassiveIncome } from "./townLedger.js";

/** 1 real cent per real hour genuinely housed — deliberately the same small ambient rate
 *  `passiveNpcIncome.ts` uses per working NPC-hour, so a Resident's contribution reads as "one
 *  more real person," not a shortcut to outearn the town's own hand-authored population. */
const CENTS_PER_RESIDENT_HOUR = 1;

const MS_PER_HOUR = 3_600_000;

/** Bounds a single accrual call so leaving the game untouched indefinitely isn't a real
 *  AFK-farming exploit — a shorter cap than the other two streams' real days-long caps since a
 *  Resident has no structure/wage history to gauge the "how long is reasonable" line against. */
const MAX_ACCRUAL_HOURS = 24;

function lastCollectedKey(spaceId: string): string {
  return `brain.passiveResidentIncome.lastCollected.${spaceId}`;
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

/** Call once per real world-snapshot refresh (`loadWorldSnapshot.ts`), alongside
 *  `collectPassiveIncome`/`collectPassiveNpcIncome`. `nowMs` defaults to the real clock, only
 *  ever overridden in tests. A Resident not currently found in `assignResidents`'s real output
 *  (not yet built enough housing for them) advances its own stamp with zero credit — genuinely
 *  unhoused time is never banked for a later payout once a home is finally built for them. */
export function collectPassiveResidentIncome(spaceId: string, nowMs: number = Date.now()): void {
  const lastCollected = loadLastCollected(spaceId);
  const housedIds = new Set(assignResidents(spaceId, nowMs).map((a) => a.npcId));
  for (const residentId of allResidentNpcIds()) {
    if (!housedIds.has(residentId)) {
      lastCollected[residentId] = nowMs;
      continue;
    }
    const since = lastCollected[residentId];
    if (since === undefined) {
      lastCollected[residentId] = nowMs; // first time seen — baseline only, no retroactive payout
      continue;
    }
    const elapsedMs = Math.min(Math.max(0, nowMs - since), MAX_ACCRUAL_HOURS * MS_PER_HOUR);
    const cents = Math.floor((elapsedMs / MS_PER_HOUR) * CENTS_PER_RESIDENT_HOUR);
    if (cents <= 0) continue; // leave the stamp alone so sub-cent time keeps accumulating
    creditPassiveIncome(spaceId, residentId, cents);
    lastCollected[residentId] = nowMs;
  }
  saveLastCollected(spaceId, lastCollected);
}
