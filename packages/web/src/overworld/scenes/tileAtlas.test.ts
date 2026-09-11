import { describe, it, expect } from "vitest";
import {
  creatureFrameForType,
  grassFrameFor,
  objectFrameForPlace,
  TileFrame,
  wallFamilyForIndex,
} from "./tileAtlas.js";

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

    it("keeps a family's door lined up with its own wall/left/right frames", () => {
      const tan = wallFamilyForIndex(0);
      expect(tan).toEqual({
        wall: TileFrame.wallTan,
        wallLeft: TileFrame.wallTanLeft,
        door: TileFrame.doorTan,
        wallRight: TileFrame.wallTanRight,
      });
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
});
