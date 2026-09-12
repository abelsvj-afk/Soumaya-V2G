import { describe, it, expect, beforeEach } from "vitest";
import {
  armedZoneType,
  armZoneType,
  clearArmedZone,
  isTileZonable,
  zoneCounts,
  zonedTiles,
  zoneTileAt,
  zoneTypeAt,
} from "./zoning.js";

const SPACE = "test-space";

beforeEach(() => localStorage.clear());

describe("zoning — the SimCity foundation under housing/business (zoning.md)", () => {
  it("arming a zone type is free — no treasury check, unlike town-builder's armItem", () => {
    armZoneType(SPACE, "residential");
    expect(armedZoneType(SPACE)).toBe("residential");
  });

  it("arming a second type re-arms rather than queuing", () => {
    armZoneType(SPACE, "residential");
    armZoneType(SPACE, "commercial");
    expect(armedZoneType(SPACE)).toBe("commercial");
  });

  it("paints the armed type onto a free tile, persists it, and clears the armed state", () => {
    armZoneType(SPACE, "sidewalk");
    const tile = zoneTileAt(SPACE, 10, 10);
    expect(tile).toEqual({ x: 10, y: 10, type: "sidewalk" });
    expect(zoneTypeAt(SPACE, 10, 10)).toBe("sidewalk");
    expect(armedZoneType(SPACE)).toBeNull();
  });

  it("painting with nothing armed is a no-op, not an error", () => {
    expect(zoneTileAt(SPACE, 5, 5)).toBeNull();
  });

  it("re-zoning a tile overwrites its previous tag rather than stacking", () => {
    armZoneType(SPACE, "residential");
    zoneTileAt(SPACE, 12, 12);
    armZoneType(SPACE, "transit");
    zoneTileAt(SPACE, 12, 12);
    expect(zoneTypeAt(SPACE, 12, 12)).toBe("transit");
    expect(zonedTiles(SPACE)).toHaveLength(1);
  });

  it("a tile with real town geometry (a building footprint) is never zonable", () => {
    // Tile (2,1) is inside the north row's first building footprint (bank) in the real layout —
    // same tile loadWorldSnapshot.test.ts and townBuilder.test.ts already verify is blocked.
    expect(isTileZonable(SPACE, 2, 1)).toBe(false);
  });

  it("a tile already zoned is still zonable — re-zoning is allowed", () => {
    armZoneType(SPACE, "commercial");
    zoneTileAt(SPACE, 15, 15);
    expect(isTileZonable(SPACE, 15, 15)).toBe(true);
  });

  it("clearArmedZone clears without painting anything", () => {
    armZoneType(SPACE, "residential");
    clearArmedZone(SPACE);
    expect(armedZoneType(SPACE)).toBeNull();
    expect(zoneTileAt(SPACE, 20, 20)).toBeNull();
  });

  it("zoneCounts is an honest per-type tally, never an invented score", () => {
    armZoneType(SPACE, "residential");
    zoneTileAt(SPACE, 1, 1);
    armZoneType(SPACE, "residential");
    zoneTileAt(SPACE, 1, 2);
    armZoneType(SPACE, "commercial");
    zoneTileAt(SPACE, 1, 3);
    expect(zoneCounts(SPACE)).toEqual({ residential: 2, commercial: 1, sidewalk: 0, transit: 0 });
  });

  it("zoning persists across separate reads (real localStorage state)", () => {
    armZoneType(SPACE, "transit");
    zoneTileAt(SPACE, 30, 5);
    expect(zonedTiles(SPACE)).toHaveLength(1);
    expect(zonedTiles(SPACE)[0]).toEqual({ x: 30, y: 5, type: "transit" });
  });
});
