import { describe, it, expect } from "vitest";
import {
  attendantFrameForPlace,
  creatureFrameForType,
  grassFrameFor,
  IDLE_BOB_PERIOD_MS,
  idleBobDelayMs,
  objectFrameForPlace,
  TileFrame,
  workIconForPlace,
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

    it("Market/Park (Town Economy round) fall back to the same player sprite too — no new attendant art was invented for them", () => {
      expect(attendantFrameForPlace("market")).toBe(TileFrame.player);
      expect(attendantFrameForPlace("park")).toBe(TileFrame.player);
    });
  });

  describe("workIconForPlace", () => {
    it("gives every door-building its own distinct work icon, including Market/Park", () => {
      const doorIds = [
        "bank",
        "library",
        "sanctuary",
        "postOffice",
        "observatory",
        "gym",
        "market",
        "townHall",
        "park",
        "hangar",
      ] as const;
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

  describe("real Park decor frames (park-decor.md, task #74)", () => {
    it("treeA/treeB/bench/fence/mushroom are all distinct frame indices — no accidental collision", () => {
      const frames = [TileFrame.treeA, TileFrame.treeB, TileFrame.bench, TileFrame.fence, TileFrame.mushroom];
      expect(new Set(frames).size).toBe(frames.length);
    });

    it("none of the new decor frames collide with an already-used frame index", () => {
      const decor = new Set<number>([TileFrame.treeA, TileFrame.treeB, TileFrame.bench, TileFrame.fence, TileFrame.mushroom]);
      const everythingElse = Object.entries(TileFrame)
        .filter(([name]) => !["treeA", "treeB", "bench", "fence", "mushroom"].includes(name))
        .map(([, frame]) => frame);
      for (const frame of everythingElse) expect(decor.has(frame)).toBe(false);
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
