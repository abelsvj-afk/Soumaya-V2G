import { describe, it, expect } from "vitest";
import {
  BANK_DOOR,
  PLAYER_SPAWN,
  isBankBuildingTile,
  isBankDoor,
  isGrassTile,
  isMovementPassable,
  isPlacementBlocked,
  REGION_WIDTH,
  REGION_HEIGHT,
} from "./regionLayout.js";

describe("regionLayout", () => {
  it("the bank door is inside the bank footprint but is the one passable tile in it", () => {
    expect(isBankBuildingTile(BANK_DOOR.x, BANK_DOOR.y)).toBe(true);
    expect(isMovementPassable(BANK_DOOR.x, BANK_DOOR.y)).toBe(true);
  });

  it("every other bank building tile blocks movement", () => {
    let sawBlocked = false;
    for (let y = 0; y < REGION_HEIGHT; y++) {
      for (let x = 0; x < REGION_WIDTH; x++) {
        if (isBankBuildingTile(x, y) && !isBankDoor(x, y)) {
          expect(isMovementPassable(x, y)).toBe(false);
          sawBlocked = true;
        }
      }
    }
    expect(sawBlocked).toBe(true);
  });

  it("out-of-bounds tiles are never passable", () => {
    expect(isMovementPassable(-1, 0)).toBe(false);
    expect(isMovementPassable(0, -1)).toBe(false);
    expect(isMovementPassable(REGION_WIDTH, 0)).toBe(false);
    expect(isMovementPassable(0, REGION_HEIGHT)).toBe(false);
  });

  it("the grass zone is walkable (not a movement obstacle)", () => {
    let sawGrass = false;
    for (let y = 0; y < REGION_HEIGHT; y++) {
      for (let x = 0; x < REGION_WIDTH; x++) {
        if (isGrassTile(x, y)) {
          expect(isMovementPassable(x, y)).toBe(true);
          sawGrass = true;
        }
      }
    }
    expect(sawGrass).toBe(true);
  });

  it("creatures never spawn in the building, the grass zone, or the player's own spawn tile", () => {
    expect(isPlacementBlocked(BANK_DOOR.x, BANK_DOOR.y)).toBe(true);
    expect(isPlacementBlocked(PLAYER_SPAWN.x, PLAYER_SPAWN.y)).toBe(true);
    let sawBlockedGrass = false;
    for (let y = 0; y < REGION_HEIGHT; y++) {
      for (let x = 0; x < REGION_WIDTH; x++) {
        if (isGrassTile(x, y)) {
          expect(isPlacementBlocked(x, y)).toBe(true);
          sawBlockedGrass = true;
        }
      }
    }
    expect(sawBlockedGrass).toBe(true);
  });

  it("the player spawn tile itself is passable for movement", () => {
    expect(isMovementPassable(PLAYER_SPAWN.x, PLAYER_SPAWN.y)).toBe(true);
  });
});
