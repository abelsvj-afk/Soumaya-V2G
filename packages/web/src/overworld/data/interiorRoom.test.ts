import { describe, it, expect } from "vitest";
import { REGION_HEIGHT, REGION_WIDTH } from "../scenes/regionLayout.js";
import {
  INTERIOR_ROOM_HEIGHT,
  INTERIOR_ROOM_WIDTH,
  interiorCounterTile,
  interiorEntryTile,
  interiorRoomBounds,
  interiorRoomOrigin,
  isInsideInteriorRoom,
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

  it("interiorRoomBounds is exactly the room's own footprint (task #125) — never the exterior union a real camera-clamp bug measured", () => {
    const bounds = interiorRoomBounds();
    const origin = interiorRoomOrigin();
    expect(bounds).toEqual({ x: origin.x, y: origin.y, width: INTERIOR_ROOM_WIDTH, height: INTERIOR_ROOM_HEIGHT });
    // Deliberately NOT >= REGION_WIDTH/REGION_HEIGHT — the whole point of the fix is that the
    // camera-bounds rectangle used while inside is small, not a union with the exterior town.
    expect(bounds.width).toBeLessThan(REGION_WIDTH);
    expect(bounds.height).toBeLessThan(REGION_HEIGHT);
  });

  it("is deterministic — repeated calls return the same tiles (no randomness)", () => {
    expect(interiorRoomOrigin()).toEqual(interiorRoomOrigin());
    expect(interiorEntryTile()).toEqual(interiorEntryTile());
    expect(interiorRoomBounds()).toEqual(interiorRoomBounds());
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
