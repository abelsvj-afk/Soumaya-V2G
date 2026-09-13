import { describe, it, expect, beforeEach } from "vitest";
import {
  armedZoneMode,
  armedZoneType,
  armZoneType,
  clearArmedZone,
  clearZoneAnchor,
  disarmZoning,
  isTileZonable,
  setZoneAnchor,
  zoneAnchor,
  zoneCounts,
  zonedTiles,
  zoneRectangle,
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

  it("paints the armed type onto a free tile, persists it, and leaves the arm active (zoning-rework.md)", () => {
    armZoneType(SPACE, "sidewalk");
    const tile = zoneTileAt(SPACE, 10, 10);
    expect(tile).toEqual({ x: 10, y: 10, type: "sidewalk" });
    expect(zoneTypeAt(SPACE, 10, 10)).toBe("sidewalk");
    expect(armedZoneType(SPACE)).toBe("sidewalk");
  });

  it("stays armed across many paints — no Hangar round-trip needed between tiles", () => {
    armZoneType(SPACE, "sidewalk");
    zoneTileAt(SPACE, 1, 1);
    zoneTileAt(SPACE, 1, 2);
    zoneTileAt(SPACE, 1, 3);
    expect(armedZoneType(SPACE)).toBe("sidewalk");
    expect(zonedTiles(SPACE)).toHaveLength(3);
  });

  it("armedZoneMode defaults to \"tile\" and is set by armZoneType's mode argument", () => {
    armZoneType(SPACE, "residential");
    expect(armedZoneMode(SPACE)).toBe("tile");
    armZoneType(SPACE, "commercial", "area");
    expect(armedZoneMode(SPACE)).toBe("area");
  });

  it("disarmZoning clears both the armed type and any pending anchor", () => {
    armZoneType(SPACE, "residential", "area");
    setZoneAnchor(SPACE, 3, 3);
    disarmZoning(SPACE);
    expect(armedZoneType(SPACE)).toBeNull();
    expect(zoneAnchor(SPACE)).toBeNull();
  });

  it("re-arming discards a stale pending anchor from a prior arm", () => {
    armZoneType(SPACE, "residential", "area");
    setZoneAnchor(SPACE, 3, 3);
    armZoneType(SPACE, "commercial", "area");
    expect(zoneAnchor(SPACE)).toBeNull();
  });

  it("setZoneAnchor/zoneAnchor/clearZoneAnchor round-trip a pending corner", () => {
    expect(zoneAnchor(SPACE)).toBeNull();
    setZoneAnchor(SPACE, 7, 9);
    expect(zoneAnchor(SPACE)).toEqual({ x: 7, y: 9 });
    clearZoneAnchor(SPACE);
    expect(zoneAnchor(SPACE)).toBeNull();
  });

  it("zoneRectangle zones every zonable tile in the area in one action, keeping the arm active", () => {
    // (10,10)-(12,11) is real open ground (measured directly against isPlacementBlocked — the
    // same known-free tile (10,10) the rest of this suite and townBuilder.test.ts already use).
    armZoneType(SPACE, "residential", "area");
    const tiles = zoneRectangle(SPACE, 10, 10, 12, 11);
    expect(tiles).toHaveLength(6); // full 3x2 block, nothing skipped
    for (const t of tiles) expect(zoneTypeAt(SPACE, t.x, t.y)).toBe("residential");
    expect(armedZoneType(SPACE)).toBe("residential"); // still armed — no Hangar trip needed
  });

  it("zoneRectangle normalizes corners passed in either order", () => {
    armZoneType(SPACE, "commercial", "area");
    const forward = zoneRectangle(SPACE, 10, 10, 11, 10);
    localStorage.clear();
    armZoneType(SPACE, "commercial", "area");
    const reversed = zoneRectangle(SPACE, 11, 10, 10, 10);
    expect(reversed.map((t) => `${t.x},${t.y}`).sort()).toEqual(forward.map((t) => `${t.x},${t.y}`).sort());
  });

  it("zoneRectangle skips real town geometry inside the area rather than erroring", () => {
    armZoneType(SPACE, "residential", "area");
    // (2,1) is inside a real building footprint (see the isTileZonable test below) — a rectangle
    // that spans it should zone everything else in the box but silently skip that one tile.
    const tiles = zoneRectangle(SPACE, 1, 1, 3, 1);
    expect(tiles.some((t) => t.x === 2 && t.y === 1)).toBe(false);
  });

  it("zoneRectangle is a no-op returning an empty array when nothing is armed", () => {
    expect(zoneRectangle(SPACE, 0, 0, 2, 2)).toEqual([]);
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
