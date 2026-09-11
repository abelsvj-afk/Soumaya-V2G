import { describe, it, expect } from "vitest";
import {
  allPlaces,
  doorPlaceAt,
  isGrassTile,
  isMovementPassable,
  isPlacementBlocked,
  objectPlaceAt,
  placeById,
  PLAYER_SPAWN,
  REGION_HEIGHT,
  REGION_WIDTH,
} from "./regionLayout.js";

describe("regionLayout — every place", () => {
  it("every door place's door tile is passable, and every other footprint tile is not", () => {
    for (const place of allPlaces()) {
      if (place.kind !== "door") continue;
      expect(isMovementPassable(place.door.x, place.door.y)).toBe(true);
      let sawWall = false;
      for (let y = place.footprint.y0; y <= place.footprint.y1; y++) {
        for (let x = place.footprint.x0; x <= place.footprint.x1; x++) {
          if (x === place.door.x && y === place.door.y) continue;
          expect(isMovementPassable(x, y)).toBe(false);
          sawWall = true;
        }
      }
      expect(sawWall).toBe(true);
    }
  });

  it("every object place's tile blocks movement (approach + interact, never walk-through)", () => {
    for (const place of allPlaces()) {
      if (place.kind !== "object") continue;
      expect(isMovementPassable(place.tile.x, place.tile.y)).toBe(false);
    }
  });

  it("doorPlaceAt/objectPlaceAt resolve every place at its own coordinates and nowhere else", () => {
    for (const place of allPlaces()) {
      if (place.kind === "door") {
        expect(doorPlaceAt(place.door.x, place.door.y)?.id).toBe(place.id);
      } else {
        expect(objectPlaceAt(place.tile.x, place.tile.y)?.id).toBe(place.id);
      }
    }
    expect(doorPlaceAt(0, 0)).toBeUndefined();
    expect(objectPlaceAt(0, 0)).toBeUndefined();
  });

  it("placeById finds every declared place and throws on an unknown id", () => {
    for (const place of allPlaces()) {
      expect(placeById(place.id)).toBe(place);
    }
  });

  it("no two places share a door/object tile (every building is independently reachable)", () => {
    const keys = allPlaces().map((p) => (p.kind === "door" ? `${p.door.x},${p.door.y}` : `${p.tile.x},${p.tile.y}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("out-of-bounds tiles are never passable", () => {
    expect(isMovementPassable(-1, 0)).toBe(false);
    expect(isMovementPassable(0, -1)).toBe(false);
    expect(isMovementPassable(REGION_WIDTH, 0)).toBe(false);
    expect(isMovementPassable(0, REGION_HEIGHT)).toBe(false);
  });

  it("the grass zone is walkable and never spawns a place on top of it", () => {
    let sawGrass = false;
    for (let y = 0; y < REGION_HEIGHT; y++) {
      for (let x = 0; x < REGION_WIDTH; x++) {
        if (isGrassTile(x, y)) {
          expect(isMovementPassable(x, y)).toBe(true);
          expect(doorPlaceAt(x, y)).toBeUndefined();
          expect(objectPlaceAt(x, y)).toBeUndefined();
          sawGrass = true;
        }
      }
    }
    expect(sawGrass).toBe(true);
  });

  it("creatures never spawn inside a building, on an object tile, in the grass zone, or on the player's spawn tile", () => {
    for (const place of allPlaces()) {
      if (place.kind === "door") {
        expect(isPlacementBlocked(place.door.x, place.door.y)).toBe(true);
      } else {
        expect(isPlacementBlocked(place.tile.x, place.tile.y)).toBe(true);
      }
    }
    expect(isPlacementBlocked(PLAYER_SPAWN.x, PLAYER_SPAWN.y)).toBe(true);
  });

  it("the player spawn tile itself is passable and outside every place/grass zone", () => {
    expect(isMovementPassable(PLAYER_SPAWN.x, PLAYER_SPAWN.y)).toBe(true);
    expect(isGrassTile(PLAYER_SPAWN.x, PLAYER_SPAWN.y)).toBe(false);
  });
});
