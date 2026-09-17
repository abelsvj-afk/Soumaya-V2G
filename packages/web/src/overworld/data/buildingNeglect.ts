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

function foundedKey(spaceId: string): string {
  return `brain.townFoundedAt.${spaceId}`;
}

/** Task #128 — when this town was first seen. A building that has never had a work event now
 *  measures its neglect from here instead of from the epoch. Written once, then never moved, so
 *  neglect still accrues honestly with real elapsed time; it just starts when the town starts. */
export function townFoundedAt(spaceId: string, nowMs: number = Date.now()): number {
  try {
    const raw = localStorage.getItem(foundedKey(spaceId));
    const parsed = raw == null ? NaN : Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    localStorage.setItem(foundedKey(spaceId), String(nowMs));
  } catch {
    /* storage unavailable — fall through to "founded right now", never a crash */
  }
  return nowMs;
}

/** Real days since this building's last real work event. Task #128 — a building that has NEVER
 *  had one measures from the town's own founding rather than returning Infinity.
 *
 *  Why this changed: returning Infinity made `neglectFor` return 1, so every building in a brand
 *  new town was MAXIMALLY neglected from the first frame. `passiveNpcIncome.ts` skips any NPC
 *  whose building is neglected, so a new town earned exactly zero NPC tax forever — until the
 *  player happened to walk a full circuit of all 12 buildings. Combined with structure rent and
 *  Resident income both needing a placed building (which task #128 also found was impossible to
 *  do), a new town was structurally incapable of earning anything at all. That is the literal
 *  mechanism behind repeated real feedback that "money is not being made."
 *
 *  A brand-new town is therefore not in crisis on its first day, which is also why `civicConcern`
 *  no longer announces a town meeting the instant a fresh save loads — deliberate, and an
 *  improvement on behaviour that was documented as intentional but always read as a bug. */
export function daysSinceWorked(spaceId: string, placeId: string, nowMs: number = Date.now()): number {
  const stamp = loadLastWorked(spaceId)[placeId] ?? townFoundedAt(spaceId, nowMs);
  return Math.max(0, (nowMs - stamp) / 86_400_000);
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
