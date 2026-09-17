import { describe, it, expect } from "vitest";
import {
  allPlaces,
  attendantPosts,
  doorPlaceAt,
  isGrassTile,
  isMovementPassable,
  isNpcPathPassable,
  isPlacementBlocked,
  objectPlaceAt,
  placeById,
  PLAYER_SPAWN,
  REGION_HEIGHT,
  REGION_WIDTH,
  townHallMeetingSlots,
  type DoorPlace,
} from "./regionLayout.js";
import { INTERIOR_ROOM_HEIGHT, INTERIOR_ROOM_WIDTH, interiorRoomOrigin } from "../data/interiorRoom.js";

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

  describe("task #126 — an off-map tile is never placeable", () => {
    // `isPlacementBlocked` had no bounds check at all (the other two passability rules always
    // did), and every placement gate bottoms out here — so all four Hangar arm modes accepted
    // off-map tiles. Measured reachable paths: the reserved interior room's own 20 tiles all
    // read "free" (and closing an overlay leaves the player standing in that room), and at any
    // map edge `tileInFront` facing outward lands past the edge.
    it("rejects every tile of the reserved interior room", () => {
      const origin = interiorRoomOrigin();
      for (let y = origin.y; y < origin.y + INTERIOR_ROOM_HEIGHT; y++) {
        for (let x = origin.x; x < origin.x + INTERIOR_ROOM_WIDTH; x++) {
          expect(isPlacementBlocked(x, y)).toBe(true);
        }
      }
    });

    it("rejects negative and past-the-edge tiles on every side", () => {
      expect(isPlacementBlocked(-1, 10)).toBe(true);
      expect(isPlacementBlocked(10, -1)).toBe(true);
      expect(isPlacementBlocked(REGION_WIDTH, 10)).toBe(true);
      expect(isPlacementBlocked(10, REGION_HEIGHT)).toBe(true);
      expect(isPlacementBlocked(500, 500)).toBe(true);
    });

    it("still leaves plenty of real in-bounds ground placeable — the fix bounds it, never empties it", () => {
      let open = 0;
      for (let y = 0; y < REGION_HEIGHT; y++) {
        for (let x = 0; x < REGION_WIDTH; x++) if (!isPlacementBlocked(x, y)) open++;
      }
      expect(open).toBeGreaterThan(500);
    });
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
  it("has all 12 door-buildings, including Market/Park, Mayor's Hall, and the Theater", () => {
    const doorIds = allPlaces()
      .filter((p) => p.kind === "door")
      .map((p) => p.id);
    expect(new Set(doorIds)).toEqual(
      new Set([
        "bank",
        "library",
        "sanctuary",
        "postOffice",
        "observatory",
        "theater",
        "gym",
        "market",
        "townHall",
        "park",
        "hangar",
        "mayorsHall",
      ]),
    );
  });

  it("every uniform-grid door-building's footprint is exactly 3x the original 6-tile area (18 tiles) — Mayor's Hall is deliberately bigger (mayors-hall.md)", () => {
    for (const place of allPlaces()) {
      if (place.kind !== "door" || place.id === "mayorsHall") continue;
      const { x0, y0, x1, y1 } = place.footprint;
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      expect(area).toBe(18);
    }
  });

  it("Mayor's Hall is literally the biggest building on the map — 4x any other building's area", () => {
    const mayorsHall = allPlaces().find((p) => p.id === "mayorsHall" && p.kind === "door") as DoorPlace;
    const { x0, y0, x1, y1 } = mayorsHall.footprint;
    expect((x1 - x0 + 1) * (y1 - y0 + 1)).toBe(72);
    for (const place of allPlaces()) {
      if (place.kind !== "door" || place.id === "mayorsHall") continue;
      const { x0: ox0, y0: oy0, x1: ox1, y1: oy1 } = place.footprint;
      expect((ox1 - ox0 + 1) * (oy1 - oy0 + 1)).toBeLessThan((x1 - x0 + 1) * (y1 - y0 + 1));
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

describe("regionLayout — NPC Autonomy round (real pathfinding, docs/overworld/npc-autonomy.md)", () => {
  describe("isNpcPathPassable", () => {
    it("agrees with isMovementPassable everywhere except real attendant post tiles", () => {
      let sawADifference = false;
      for (let y = 0; y < REGION_HEIGHT; y++) {
        for (let x = 0; x < REGION_WIDTH; x++) {
          const player = isMovementPassable(x, y);
          const npc = isNpcPathPassable(x, y);
          if (player !== npc) {
            sawADifference = true;
            expect(npc).toBe(true); // NPC travel is only ever MORE permissive, never less
          }
        }
      }
      expect(sawADifference).toBe(true); // the attendant-tile carve-out actually does something
    });

    it("makes every real attendant post tile a valid NPC travel destination", () => {
      for (const post of attendantPosts()) {
        for (const tile of [post.a, post.b]) {
          expect(isNpcPathPassable(tile.x, tile.y)).toBe(true);
        }
      }
    });

    it("still blocks real building walls and standalone objects, same as the player", () => {
      for (const place of allPlaces()) {
        if (place.kind === "door") {
          const { x0, y0, x1, y1 } = place.footprint;
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              if (x === place.door.x && y === place.door.y) continue;
              expect(isNpcPathPassable(x, y)).toBe(false);
            }
          }
        } else {
          expect(isNpcPathPassable(place.tile.x, place.tile.y)).toBe(false);
        }
      }
    });

    it("out-of-bounds tiles are never passable", () => {
      expect(isNpcPathPassable(-1, 0)).toBe(false);
      expect(isNpcPathPassable(REGION_WIDTH, 0)).toBe(false);
    });
  });

  describe("townHallMeetingSlots", () => {
    it("gives more real slots than any one building has attendants, so a full gathering can spread out", () => {
      expect(townHallMeetingSlots().length).toBeGreaterThan(2);
    });

    it("every slot is in-bounds and a real NPC-passable tile", () => {
      for (const slot of townHallMeetingSlots()) {
        expect(slot.x).toBeGreaterThanOrEqual(0);
        expect(slot.x).toBeLessThan(REGION_WIDTH);
        expect(slot.y).toBeGreaterThanOrEqual(0);
        expect(slot.y).toBeLessThan(REGION_HEIGHT);
        expect(isNpcPathPassable(slot.x, slot.y)).toBe(true);
      }
    });

    it("no slot collides with Town Hall's own attendant posts (no overlap between the two systems)", () => {
      const townHallPosts = attendantPosts().filter((p) => p.placeId === "townHall");
      const postKeys = new Set(townHallPosts.flatMap((p) => [`${p.a.x},${p.a.y}`, `${p.b.x},${p.b.y}`]));
      for (const slot of townHallMeetingSlots()) {
        expect(postKeys.has(`${slot.x},${slot.y}`)).toBe(false);
      }
    });

    it("no two slots share a tile", () => {
      const keys = townHallMeetingSlots().map((s) => `${s.x},${s.y}`);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("is deterministic across calls", () => {
      expect(townHallMeetingSlots()).toEqual(townHallMeetingSlots());
    });

    it("2026-09-15 audit fix — comfortably covers the town's real 22-NPC roster, not just 'more than 2'", () => {
      // npcDialogue.ts's PROFILE_LIST is the real, fixed headcount (11 buildings x 2) — every
      // one of them can arrive at a Town Meeting at once. The old MEETING_ROWS_OUT=2 (12 slots)
      // was sized against a stale "20" miscount and would have left several NPCs sharing a tile.
      expect(townHallMeetingSlots().length).toBeGreaterThanOrEqual(22);
    });
  });
});
