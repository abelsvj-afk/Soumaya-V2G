/**
 * Town Economy round (docs/overworld/npc-economy.md) — "health" resolved directly with the
 * user (2026-09-12) as the old galaxy's own neglect math, extended: `entropyFrom()`/
 * `COOLING_ENTROPY` (shared/celestial.ts) is the exact function that already drives a
 * memory's dim "?" cue when it goes untended. This applies that SAME shape to a new subject —
 * time since a building last had a real work event (npcJobs.ts) — instead of inventing a
 * separate "health" stat with its own math.
 */

import { entropyFrom, COOLING_ENTROPY } from "@brain/shared";

function storageKey(spaceId: string): string {
  return `brain.buildingNeglect.${spaceId}`;
}

function loadLastWorked(spaceId: string): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(spaceId)) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/** Stamps "right now" as this building's last real work event. Called once per real
 *  interaction (npcJobs.ts's `recordBuildingWork`) — never on a timer. */
export function markWorked(spaceId: string, placeId: string, nowMs: number = Date.now()): void {
  const all = loadLastWorked(spaceId);
  all[placeId] = nowMs;
  try {
    localStorage.setItem(storageKey(spaceId), JSON.stringify(all));
  } catch {
    /* worst case: neglect reads slightly high until the next real event re-stamps it */
  }
}

/** Real days since this building's last real work event — Infinity if it has never had one. */
export function daysSinceWorked(spaceId: string, placeId: string, nowMs: number = Date.now()): number {
  const stamp = loadLastWorked(spaceId)[placeId];
  if (stamp == null) return Infinity;
  return (nowMs - stamp) / 86_400_000;
}

/** Pure: the actual neglect math. Reuses `entropyFrom`'s real shape — a building that has
 *  never had a real work event is treated as maximally neglected, same as a memory that has
 *  never been tended. */
export function neglectFor(daysSinceLastWork: number): number {
  if (!Number.isFinite(daysSinceLastWork)) return 1;
  return entropyFrom(daysSinceLastWork);
}

export function isNeglected(neglect: number): boolean {
  return neglect >= COOLING_ENTROPY;
}

/** Convenience: this building's current neglect, from its real stamp. */
export function buildingNeglect(spaceId: string, placeId: string, nowMs: number = Date.now()): number {
  return neglectFor(daysSinceWorked(spaceId, placeId, nowMs));
}
