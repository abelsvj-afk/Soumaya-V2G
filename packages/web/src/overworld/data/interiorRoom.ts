/**
 * Backlog #80 (docs/overworld/walk-in-interiors.md) — pure placement math for the single
 * reusable interior "room" every door-building's walk-in transition teleports the player into.
 * Kept Phaser-free (no import of ExteriorScene.ts) so it can be unit-tested directly, matching
 * this repo's convention for anything spatial (see engine/movement.ts, adapter/placement.ts).
 */

import { REGION_HEIGHT, REGION_WIDTH } from "../scenes/regionLayout.js";

/** How far past the real town's east edge the reserved room starts — never 0, so there's no
 *  chance of it butting directly against a real east-edge building's own door approach. */
const MARGIN_TILES = 6;

export const INTERIOR_ROOM_WIDTH = 5;
export const INTERIOR_ROOM_HEIGHT = 4;

/** Top-left corner of the reserved room, in world tile coordinates. Always past `REGION_WIDTH`
 *  on x, so normal exterior movement (clamped to `{REGION_WIDTH, REGION_HEIGHT}` by
 *  engine/movement.ts's `tryMove`) can never reach it — only an explicit teleport can. */
export function interiorRoomOrigin(): { x: number; y: number } {
  return { x: REGION_WIDTH + MARGIN_TILES, y: 0 };
}

/** Where the player lands on entry — bottom-center of the room, facing "up" into it (mirrors a
 *  real door-mat convention: you arrive just inside the doorway, not in the middle of the room). */
export function interiorEntryTile(): { x: number; y: number } {
  const origin = interiorRoomOrigin();
  return { x: origin.x + Math.floor(INTERIOR_ROOM_WIDTH / 2), y: origin.y + INTERIOR_ROOM_HEIGHT - 1 };
}

/** The world-bounds rectangle the camera needs to cover both the real town AND the reserved
 *  room, computed from the same `REGION_WIDTH`/`REGION_HEIGHT` the exterior camera already uses
 *  — a single `setBounds` call at scene creation, never toggled at transition time. */
export function worldBoundsTiles(): { width: number; height: number } {
  const origin = interiorRoomOrigin();
  return {
    width: Math.max(REGION_WIDTH, origin.x + INTERIOR_ROOM_WIDTH),
    height: Math.max(REGION_HEIGHT, origin.y + INTERIOR_ROOM_HEIGHT),
  };
}
