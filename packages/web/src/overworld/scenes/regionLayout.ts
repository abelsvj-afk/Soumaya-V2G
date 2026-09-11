/**
 * Stage 1's single demo region: a fixed, hand-authored layout (architecture.md — buildings
 * are small fixed layouts even though creature placement is data-driven). Pure/no-Phaser so
 * it's directly unit-testable.
 */

export const REGION_WIDTH = 14;
export const REGION_HEIGHT = 10;
export const PLAYER_SPAWN = { x: 6, y: 5 } as const;
/** The door sits on the building's own south edge (inside the footprint), so stepping
 *  north through it from the open ground below is what triggers the warp. */
export const BANK_DOOR = { x: 2, y: 2 } as const;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const BANK_FOOTPRINT: Rect = { x0: 1, y0: 1, x1: 3, y1: 2 };
const GRASS_ZONE: Rect = { x0: 9, y0: 6, x1: 11, y1: 8 };

function within(x: number, y: number, r: Rect): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

export function isBankBuildingTile(x: number, y: number): boolean {
  return within(x, y, BANK_FOOTPRINT);
}

export function isBankDoor(x: number, y: number): boolean {
  return x === BANK_DOOR.x && y === BANK_DOOR.y;
}

/** FR8 — the tall-grass free-thought zone that triggers the capture flow. */
export function isGrassTile(x: number, y: number): boolean {
  return within(x, y, GRASS_ZONE);
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < REGION_WIDTH && y < REGION_HEIGHT;
}

/** FR2 — collision: the building blocks movement except through its door tile. */
export function isMovementPassable(x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  if (isBankBuildingTile(x, y) && !isBankDoor(x, y)) return false;
  return true;
}

/** Creatures never spawn inside the building, the grass zone, or on the player's own start tile. */
export function isPlacementBlocked(x: number, y: number): boolean {
  if (isBankBuildingTile(x, y)) return true;
  if (isGrassTile(x, y)) return true;
  if (x === PLAYER_SPAWN.x && y === PLAYER_SPAWN.y) return true;
  return false;
}
