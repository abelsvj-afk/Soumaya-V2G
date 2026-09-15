import { describe, it, expect } from "vitest";
import { REGION_HEIGHT, REGION_WIDTH } from "../scenes/regionLayout.js";
import {
  INTERIOR_ROOM_HEIGHT,
  INTERIOR_ROOM_WIDTH,
  interiorEntryTile,
  interiorRoomOrigin,
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
});
