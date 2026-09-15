import { describe, it, expect, beforeEach } from "vitest";
import { footprintOverlapsAny, isInsideAnyFootprint, placedBusinessFootprints, placedHomeFootprints } from "./placedStructures.js";

const SPACE = "test-space";

beforeEach(() => localStorage.clear());

describe("placedStructures — the read-only cross-category projection (2026-09-15 audit fix)", () => {
  it("reads real home footprints from the exact same key housing.ts's placedHomes uses", () => {
    localStorage.setItem(
      `brain.housing.placed.${SPACE}`,
      JSON.stringify([{ id: "h1", typeId: "cottage", x0: 2, y0: 10, x1: 3, y1: 11, door: { x: 2, y: 11 }, builtAt: 0 }]),
    );
    expect(placedHomeFootprints(SPACE)).toEqual([{ x0: 2, y0: 10, x1: 3, y1: 11 }]);
  });

  it("reads real business footprints from the exact same key business.ts's placedBusinesses uses", () => {
    localStorage.setItem(
      `brain.business.placed.${SPACE}`,
      JSON.stringify([{ id: "b1", typeId: "bakery", x0: 5, y0: 5, x1: 6, y1: 6, door: { x: 5, y: 6 }, builtAt: 0 }]),
    );
    expect(placedBusinessFootprints(SPACE)).toEqual([{ x0: 5, y0: 5, x1: 6, y1: 6 }]);
  });

  it("tolerates missing/malformed localStorage rather than crashing", () => {
    localStorage.setItem(`brain.housing.placed.${SPACE}`, "not json");
    expect(placedHomeFootprints(SPACE)).toEqual([]);
    expect(placedBusinessFootprints("no-such-space")).toEqual([]);
  });

  it("isInsideAnyFootprint is true only for a tile actually within a footprint's inclusive bounds", () => {
    const footprints = [{ x0: 2, y0: 10, x1: 3, y1: 11 }];
    expect(isInsideAnyFootprint(footprints, 2, 10)).toBe(true); // top-left corner
    expect(isInsideAnyFootprint(footprints, 3, 11)).toBe(true); // bottom-right corner
    expect(isInsideAnyFootprint(footprints, 4, 10)).toBe(false); // one tile outside
  });

  it("footprintOverlapsAny detects a real rectangle intersection, not just a shared corner miss", () => {
    const footprints = [{ x0: 2, y0: 10, x1: 3, y1: 11 }];
    expect(footprintOverlapsAny({ x0: 3, y0: 11, x1: 5, y1: 12 }, footprints)).toBe(true); // overlaps at (3,11)
    expect(footprintOverlapsAny({ x0: 4, y0: 12, x1: 6, y1: 13 }, footprints)).toBe(false); // fully clear
  });
});
