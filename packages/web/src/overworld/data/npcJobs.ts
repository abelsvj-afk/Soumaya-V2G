/**
 * Town Economy round (docs/overworld/npc-economy.md) — the single call every Overlay makes
 * right after one of its own REAL mutating API calls succeeds (a bill paid, a quest posted, an
 * insight resolved, a Journey saved, ...). This is "work is created for them by me interacting
 * with the app areas," resolved literally: one real user action = one real hour credited to
 * that building's NPCs, and one real reset of that building's neglect clock. Never a timer,
 * never invented — see npc-economy.md's table for exactly which real API call feeds which
 * building.
 */

import { creditHour } from "./townLedger.js";
import { markWorked } from "./buildingNeglect.js";
import type { PlaceId } from "../scenes/regionLayout.js";

/** Call once, right after a real mutation for this building actually succeeds. Credits an hour
 *  (townLedger.ts) and resets the neglect clock (buildingNeglect.ts) together, so the two are
 *  never accidentally out of sync with each other. `nowMs` defaults to the real clock; callers
 *  only ever override it in tests, for the same reason buildingNeglect.ts's own functions do. */
export function recordBuildingWork(spaceId: string, placeId: PlaceId, nowMs: number = Date.now()): void {
  creditHour(spaceId, placeId);
  markWorked(spaceId, placeId, nowMs);
}
