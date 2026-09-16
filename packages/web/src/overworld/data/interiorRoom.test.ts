import { describe, it, expect } from "vitest";
import { REGION_HEIGHT, REGION_WIDTH } from "../scenes/regionLayout.js";
import {
  INTERIOR_ROOM_HEIGHT,
  INTERIOR_ROOM_WIDTH,
  interiorCounterTile,
  interiorEntryTile,
  interiorRoomOrigin,
  isInsideInteriorRoom,
  worldBoundsTiles,
} from "./interiorRoom.js";

describe("interiorRoom (backlog #80 — reserved off-map room for walk-in transitions)", () => {
  it("never overlaps the real town — origin.x is always past REGION_WIDTH", () => {
    const origin = interiorRoomOrigin();
    expect(origin.x).toBeGreaterThanOrEqual(REGION_WIDTH);
  });

  it("the room's full footprint stays past the real town on every side", () => {
    const origin = interiorRoomOrigin();
    // The real town occupies x in [0, REGION_WIDTH) — the room must start at or after that,
    // so no tile of the room can ever coincide with a real exterior tile.
    expect(origin.x).toBeGreaterThanOrEqual(REGION_WIDTH);
    expect(origin.x + INTERIOR_ROOM_WIDTH).toBeGreaterThan(REGION_WIDTH);
  });

  it("the entry tile is inside the room's own footprint, at the bottom-center", () => {
    const origin = interiorRoomOrigin();
    const entry = interiorEntryTile();
    expect(entry.x).toBeGreaterThanOrEqual(origin.x);
    expect(entry.x).toBeLessThan(origin.x + INTERIOR_ROOM_WIDTH);
    expect(entry.y).toBe(origin.y + INTERIOR_ROOM_HEIGHT - 1);
  });

  it("world bounds cover both the real town and the reserved room, never smaller than either", () => {
    const bounds = worldBoundsTiles();
    expect(bounds.width).toBeGreaterThanOrEqual(REGION_WIDTH);
    expect(bounds.height).toBeGreaterThanOrEqual(REGION_HEIGHT);
    const origin = interiorRoomOrigin();
    expect(bounds.width).toBeGreaterThanOrEqual(origin.x + INTERIOR_ROOM_WIDTH);
    expect(bounds.height).toBeGreaterThanOrEqual(origin.y + INTERIOR_ROOM_HEIGHT);
  });

  it("is deterministic — repeated calls return the same tiles (no randomness)", () => {
    expect(interiorRoomOrigin()).toEqual(interiorRoomOrigin());
    expect(interiorEntryTile()).toEqual(interiorEntryTile());
    expect(worldBoundsTiles()).toEqual(worldBoundsTiles());
  });

  describe("real walk-in agency (simcity-realism-pass.md) — the counter tile and room bounds", () => {
    it("the counter tile is inside the room's own footprint, at the top-center", () => {
      const origin = interiorRoomOrigin();
      const counter = interiorCounterTile();
      expect(counter.x).toBeGreaterThanOrEqual(origin.x);
      expect(counter.x).toBeLessThan(origin.x + INTERIOR_ROOM_WIDTH);
      expect(counter.y).toBe(origin.y);
    });

    it("the counter tile is always distinct from the entry tile — a real room to walk across", () => {
      expect(interiorCounterTile()).not.toEqual(interiorEntryTile());
    });

    it("isInsideInteriorRoom is true for every tile in the room's own footprint", () => {
      const origin = interiorRoomOrigin();
      for (let y = origin.y; y < origin.y + INTERIOR_ROOM_HEIGHT; y++) {
        for (let x = origin.x; x < origin.x + INTERIOR_ROOM_WIDTH; x++) {
          expect(isInsideInteriorRoom(x, y)).toBe(true);
        }
      }
    });

    it("isInsideInteriorRoom is false just outside every edge of the room", () => {
      const origin = interiorRoomOrigin();
      expect(isInsideInteriorRoom(origin.x - 1, origin.y)).toBe(false);
      expect(isInsideInteriorRoom(origin.x + INTERIOR_ROOM_WIDTH, origin.y)).toBe(false);
      expect(isInsideInteriorRoom(origin.x, origin.y - 1)).toBe(false);
      expect(isInsideInteriorRoom(origin.x, origin.y + INTERIOR_ROOM_HEIGHT)).toBe(false);
    });

    it("isInsideInteriorRoom is false for every real exterior tile — the two spaces never overlap", () => {
      expect(isInsideInteriorRoom(0, 0)).toBe(false);
      expect(isInsideInteriorRoom(REGION_WIDTH - 1, REGION_HEIGHT - 1)).toBe(false);
    });
  });
});
