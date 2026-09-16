/**
 * Population-driven passive income (docs/overworld/simcity-realism-pass.md, real bug fix #2) —
 * the OTHER real SimCity income stream, distinct from `passiveIncome.ts`'s own per-structure
 * rent (gauged by a building's price — a landlord's income). This one is a population's own real
 * tax revenue: every real society NPC currently, deterministically in the real `working`
 * schedule state (`npcSchedule.ts`'s own `scheduleStateAt`/`countWorkingTicks` — the SAME
 * function the visual Working/Break/Home state already reads, never a second invented clock)
 * generates a small real trickle for real time actually spent working. Both income sources stack
 * — they are honestly two different real things, computed and credited independently.
 *
 * Gated the same honest way rent already is: a neglected building's own attendant isn't doing
 * real civic work worth taxing, so a currently-neglected NPC accrues zero for this call — and
 * that neglected stretch is NOT banked for a later lump-sum payout once neglect clears (this
 * module has no way to know precisely when in the elapsed window neglect started, so it doesn't
 * pretend to).
 */

import { SOCIETY_TICK_MS, countWorkingTicks } from "./npcSchedule.js";
import { allSocietyNpcIds, npcProfile } from "./npcDialogue.js";
import { buildingNeglect, isNeglected } from "./buildingNeglect.js";
import { creditPassiveIncome } from "./townLedger.js";

/** 1 real cent per real NPC-hour actually spent working — deliberately small per NPC (this is
 *  ambient background income, not the main economic lever, which stays the player's own real
 *  interactions per npc-economy.md's original intent) but adds up honestly across the town's
 *  real ~24-NPC population. */
const CENTS_PER_WORKING_HOUR = 1;

const TICKS_PER_HOUR = 3_600_000 / SOCIETY_TICK_MS;

/** Same real cap `passiveIncome.ts` already uses — bounds a single accrual call so leaving the
 *  game untouched indefinitely isn't a real AFK-farming exploit. */
const MAX_ACCRUAL_DAYS = 3;
const MAX_ACCRUAL_TICKS = (MAX_ACCRUAL_DAYS * 86_400_000) / SOCIETY_TICK_MS;

function tickAt(nowMs: number): number {
  return Math.floor(nowMs / SOCIETY_TICK_MS);
}

function lastCollectedKey(spaceId: string): string {
  return `brain.passiveNpcIncome.lastCollectedTick.${spaceId}`;
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
 *  `collectPassiveIncome`. `nowMs` defaults to the real clock, only ever overridden in tests.
 *  A society NPC never seen by this function before gets a fresh baseline at `nowMs` with zero
 *  credit this call — real accrual only starts from the first time this ever runs for them, so
 *  shipping this feature to an existing save can never pay out a huge retroactive lump sum for
 *  time that already passed before the feature existed. */
export function collectPassiveNpcIncome(spaceId: string, nowMs: number = Date.now()): void {
  const nowTick = tickAt(nowMs);
  const lastCollected = loadLastCollected(spaceId);
  for (const npcId of allSocietyNpcIds()) {
    const sinceTick = lastCollected[npcId];
    if (sinceTick === undefined) {
      lastCollected[npcId] = nowTick;
      continue;
    }
    const fromTick = Math.max(sinceTick, nowTick - MAX_ACCRUAL_TICKS);
    const placeId = npcProfile(npcId).placeId;
    if (isNeglected(buildingNeglect(spaceId, placeId, nowMs))) {
      lastCollected[npcId] = nowTick; // a neglected stretch is never banked for later
      continue;
    }
    const workingTicks = countWorkingTicks(npcId, fromTick, nowTick);
    const cents = Math.floor((workingTicks / TICKS_PER_HOUR) * CENTS_PER_WORKING_HOUR);
    if (cents <= 0) continue; // leave the stamp alone so sub-cent ticks keep accumulating
    creditPassiveIncome(spaceId, npcId, cents);
    lastCollected[npcId] = nowTick;
  }
  saveLastCollected(spaceId, lastCollected);
}
