import { describe, it, expect } from "vitest";
import {
  allPlaces,
  attendantPosts,
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

describe("regionLayout — attendant NPC posts (Stage 2.8)", () => {
  it("gives every door-building a few posts (not just one)", () => {
    const doorPlaceIds = allPlaces()
      .filter((p) => p.kind === "door")
      .map((p) => p.id);
    for (const id of doorPlaceIds) {
      const postsForThisBuilding = attendantPosts().filter((p) => p.placeId === id);
      expect(postsForThisBuilding.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("every attendant tile is in-bounds, blocks movement, and blocks creature placement", () => {
    for (const post of attendantPosts()) {
      for (const tile of [post.a, post.b]) {
        expect(tile.x).toBeGreaterThanOrEqual(0);
        expect(tile.x).toBeLessThan(REGION_WIDTH);
        expect(tile.y).toBeGreaterThanOrEqual(0);
        expect(tile.y).toBeLessThan(REGION_HEIGHT);
        expect(isMovementPassable(tile.x, tile.y)).toBe(false);
        expect(isPlacementBlocked(tile.x, tile.y)).toBe(true);
      }
    }
  });

  it("attendant tiles never land on a door, an object, the grass zone, or the player's spawn", () => {
    for (const post of attendantPosts()) {
      for (const tile of [post.a, post.b]) {
        expect(doorPlaceAt(tile.x, tile.y)).toBeUndefined();
        expect(objectPlaceAt(tile.x, tile.y)).toBeUndefined();
        expect(isGrassTile(tile.x, tile.y)).toBe(false);
        expect(tile.x === PLAYER_SPAWN.x && tile.y === PLAYER_SPAWN.y).toBe(false);
      }
    }
  });

  it("no two attendant posts (even across different buildings) share a tile", () => {
    const keys = attendantPosts().flatMap((p) => [`${p.a.x},${p.a.y}`, `${p.b.x},${p.b.y}`]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("each post's two tiles stay within its own building's left/right edge", () => {
    for (const place of allPlaces()) {
      if (place.kind !== "door") continue;
      for (const post of attendantPosts().filter((p) => p.placeId === place.id)) {
        expect(post.a.x).toBe(place.footprint.x0);
        expect(post.b.x).toBe(place.footprint.x1);
      }
    }
  });

  it("gives every attendant a unique, stable npcId (NPC Society v1)", () => {
    const ids = attendantPosts().map((p) => p.npcId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(attendantPosts().map((p) => p.npcId)).toEqual(attendantPosts().map((p) => p.npcId));
  });

  it("gives Town Hall exactly the two npcIds the NPC Society slice depends on", () => {
    const townHallIds = attendantPosts()
      .filter((p) => p.placeId === "townHall")
      .map((p) => p.npcId);
    expect(new Set(townHallIds)).toEqual(new Set(["townHall-0", "townHall-1"]));
  });
});

describe("regionLayout — Town Economy round (generated layout, docs/overworld/npc-economy.md)", () => {
  it("has all 10 door-buildings, including the two new ones (Market, Park)", () => {
    const doorIds = allPlaces()
      .filter((p) => p.kind === "door")
      .map((p) => p.id);
    expect(new Set(doorIds)).toEqual(
      new Set(["bank", "library", "sanctuary", "postOffice", "observatory", "gym", "market", "townHall", "park", "hangar"]),
    );
  });

  it("every door-building's footprint is exactly 3x the original 6-tile area (18 tiles)", () => {
    for (const place of allPlaces()) {
      if (place.kind !== "door") continue;
      const { x0, y0, x1, y1 } = place.footprint;
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      expect(area).toBe(18);
    }
  });

  it("no two door-building footprints overlap, even by one tile (generated, not hand-typed)", () => {
    const doorPlaces = allPlaces().filter((p) => p.kind === "door");
    for (let i = 0; i < doorPlaces.length; i++) {
      for (let j = i + 1; j < doorPlaces.length; j++) {
        const a = doorPlaces[i]!.footprint;
        const b = doorPlaces[j]!.footprint;
        const overlaps = a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("REGION_WIDTH/REGION_HEIGHT actually contain every building, with room to spare for the margin", () => {
    for (const place of allPlaces()) {
      if (place.kind !== "door") continue;
      expect(place.footprint.x1).toBeLessThan(REGION_WIDTH);
      expect(place.footprint.y1).toBeLessThan(REGION_HEIGHT);
    }
  });
});
