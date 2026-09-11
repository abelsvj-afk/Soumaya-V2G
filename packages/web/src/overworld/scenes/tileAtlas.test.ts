import { describe, it, expect } from "vitest";
import {
  attendantFrameForPlace,
  buildingTileFrame,
  creatureFrameForType,
  grassFrameFor,
  IDLE_BOB_PERIOD_MS,
  idleBobDelayMs,
  objectFrameForPlace,
  TileFrame,
  wallFamilyForIndex,
  workIconForPlace,
} from "./tileAtlas.js";
import { placeById } from "./regionLayout.js";

describe("tileAtlas", () => {
  describe("grassFrameFor", () => {
    it("is deterministic — same tile always yields the same frame", () => {
      const tiles: Array<[number, number]> = [[0, 0], [3, 7], [25, 17], [12, 9]];
      for (const [x, y] of tiles) {
        expect(grassFrameFor(x, y)).toBe(grassFrameFor(x, y));
      }
    });

    it("only ever returns one of the three grass frames", () => {
      const valid = new Set<number>([TileFrame.grassA, TileFrame.grassB, TileFrame.grassFlowers]);
      for (let x = 0; x < 26; x++) {
        for (let y = 0; y < 18; y++) {
          expect(valid.has(grassFrameFor(x, y))).toBe(true);
        }
      }
    });

    it("produces more than one frame across the region (not a constant fill)", () => {
      const seen = new Set<number>();
      for (let x = 0; x < 26; x++) {
        for (let y = 0; y < 18; y++) {
          seen.add(grassFrameFor(x, y));
        }
      }
      expect(seen.size).toBeGreaterThan(1);
    });
  });

  describe("wallFamilyForIndex", () => {
    it("alternates between the tan and blue wall families", () => {
      expect(wallFamilyForIndex(0).wall).toBe(TileFrame.wallTan);
      expect(wallFamilyForIndex(1).wall).toBe(TileFrame.wallBlue);
      expect(wallFamilyForIndex(2).wall).toBe(TileFrame.wallTan);
    });

    it("keeps a family's door/roof lined up with its own wall/left/right frames", () => {
      const tan = wallFamilyForIndex(0);
      expect(tan).toEqual({
        wall: TileFrame.wallTan,
        wallLeft: TileFrame.wallTanLeft,
        door: TileFrame.doorTan,
        wallRight: TileFrame.wallTanRight,
        roof: TileFrame.roofTan,
      });
    });
  });

  describe("buildingTileFrame", () => {
    const family = wallFamilyForIndex(0); // tan

    it("north-row building (door on the footprint's BOTTOM row): roof on top, wall/door/wall on the bottom", () => {
      const bank = placeById("bank");
      if (bank.kind !== "door") throw new Error("expected a door place");
      const { x0, x1, y0, y1 } = bank.footprint;
      // Top row (no door here) is the roofline, not another wall row.
      expect(buildingTileFrame(family, { x: x0, y: y0 }, bank.door, bank.footprint)).toBe(family.roof);
      expect(buildingTileFrame(family, { x: x1, y: y0 }, bank.door, bank.footprint)).toBe(family.roof);
      // Bottom row (the door's actual row) is wallLeft/door/wallRight.
      expect(buildingTileFrame(family, { x: x0, y: y1 }, bank.door, bank.footprint)).toBe(family.wallLeft);
      expect(buildingTileFrame(family, bank.door, bank.door, bank.footprint)).toBe(family.door);
      expect(buildingTileFrame(family, { x: x1, y: y1 }, bank.door, bank.footprint)).toBe(family.wallRight);
    });

    it("south-row building (door on the footprint's TOP row): wall/door/wall on top, roof on the bottom", () => {
      const gym = placeById("gym");
      if (gym.kind !== "door") throw new Error("expected a door place");
      const { x0, x1, y0, y1 } = gym.footprint;
      expect(gym.door.y).toBe(y0); // sanity: this building really does face the other way
      // The door's actual row (top, for this building) is wallLeft/door/wallRight — this is
      // exactly the case the old hardcoded "door is always on the bottom row" logic got wrong.
      expect(buildingTileFrame(family, { x: x0, y: y0 }, gym.door, gym.footprint)).toBe(family.wallLeft);
      expect(buildingTileFrame(family, gym.door, gym.door, gym.footprint)).toBe(family.door);
      expect(buildingTileFrame(family, { x: x1, y: y0 }, gym.door, gym.footprint)).toBe(family.wallRight);
      // The row without the door (bottom, for this building) is the roofline.
      expect(buildingTileFrame(family, { x: x0, y: y1 }, gym.door, gym.footprint)).toBe(family.roof);
      expect(buildingTileFrame(family, { x: x1, y: y1 }, gym.door, gym.footprint)).toBe(family.roof);
    });
  });

  describe("objectFrameForPlace", () => {
    it("gives Soumaya her own marker", () => {
      expect(objectFrameForPlace("soumaya")).toBe(TileFrame.soumayaMarker);
    });

    it("falls back to the generic signpost for every other object id", () => {
      expect(objectFrameForPlace("bulletinBoard")).toBe(TileFrame.signpost);
    });
  });

  describe("attendantFrameForPlace", () => {
    it("gives every door-building its own distinct attendant sprite", () => {
      const doorIds = ["bank", "library", "sanctuary", "postOffice", "observatory", "gym", "townHall", "hangar"] as const;
      const frames = new Set(doorIds.map((id) => attendantFrameForPlace(id)));
      expect(frames.size).toBe(doorIds.length);
    });

    it("falls back to the player sprite for a place with no dedicated attendant art", () => {
      expect(attendantFrameForPlace("bulletinBoard")).toBe(TileFrame.player);
    });
  });

  describe("workIconForPlace", () => {
    it("gives every door-building its own distinct work icon", () => {
      const doorIds = ["bank", "library", "sanctuary", "postOffice", "observatory", "gym", "townHall", "hangar"] as const;
      const icons = new Set(doorIds.map((id) => workIconForPlace(id)));
      expect(icons.size).toBe(doorIds.length);
    });

    it("never returns an empty string, even for an unmapped place", () => {
      expect(workIconForPlace("bulletinBoard").length).toBeGreaterThan(0);
    });
  });

  describe("creatureFrameForType", () => {
    it("gives every known NodeType its own frame", () => {
      const types = ["person", "project", "decision", "company", "meeting", "daily", "knowledge", "concept", "other"] as const;
      const frames = new Set(types.map((t) => creatureFrameForType(t)));
      expect(frames.size).toBe(types.length);
    });

    it("tolerates an unmapped type gracefully (falls back to the generic creature, never throws)", () => {
      // "moc" (constellation hub) has no dedicated art yet — must still render, not crash.
      expect(() => creatureFrameForType("moc")).not.toThrow();
      expect(creatureFrameForType("moc")).toBe(TileFrame.creatureOther);
    });
  });

  describe("idleBobDelayMs", () => {
    it("is deterministic — same node id always yields the same delay", () => {
      expect(idleBobDelayMs(42)).toBe(idleBobDelayMs(42));
      expect(idleBobDelayMs(1)).toBe(idleBobDelayMs(1));
    });

    it("always stays within one bob period", () => {
      for (const id of [0, 1, 2, 42, 999, 123456]) {
        const delay = idleBobDelayMs(id);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThan(IDLE_BOB_PERIOD_MS);
      }
    });

    it("desyncs different node ids (not every creature bobs in lockstep)", () => {
      const delays = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(idleBobDelayMs));
      expect(delays.size).toBeGreaterThan(1);
    });
  });
});
