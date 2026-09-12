import { describe, it, expect, beforeEach } from "vitest";
import {
  PLACEABLE_ITEMS,
  armedItemId,
  armItem,
  canAffordItem,
  clearArmedItem,
  isTileFreeForPlacement,
  isTileOccupiedByPlacedItem,
  placeArmedItem,
  placedItems,
} from "./townBuilder.js";
import { creditHour } from "./townLedger.js";

const SPACE = "test-space";

beforeEach(() => localStorage.clear());

function fundTreasury(cents: number): void {
  // WAGE_PER_HOUR_CENTS is 25 (townLedger.ts) — credit enough hours to a fictional place.
  const hours = Math.ceil(cents / 25);
  for (let i = 0; i < hours; i++) creditHour(SPACE, "bank");
}

describe("townBuilder — the Hangar's real select-then-place mechanism", () => {
  it("won't arm an item the treasury can't afford", () => {
    expect(armItem(SPACE, "bench")).toBe(false);
    expect(armedItemId(SPACE)).toBeNull();
  });

  it("won't arm an unknown item id", () => {
    fundTreasury(1000);
    expect(armItem(SPACE, "nonexistent")).toBe(false);
  });

  it("arms an affordable item and spends the real treasury immediately", () => {
    const bench = PLACEABLE_ITEMS.find((i) => i.id === "bench")!;
    fundTreasury(bench.priceCents);
    expect(canAffordItem(SPACE, bench)).toBe(true);
    expect(armItem(SPACE, "bench")).toBe(true);
    expect(armedItemId(SPACE)).toBe("bench");
    expect(canAffordItem(SPACE, bench)).toBe(false); // spent already
  });

  it("re-arming a second item replaces the first — never a queue", () => {
    fundTreasury(1000);
    armItem(SPACE, "bench");
    armItem(SPACE, "lamp_post");
    expect(armedItemId(SPACE)).toBe("lamp_post");
  });

  it("places the armed item at a free tile, persists it, and clears the armed state", () => {
    fundTreasury(1000);
    armItem(SPACE, "garden_bed");
    const placed = placeArmedItem(SPACE, 10, 10);
    expect(placed?.itemId).toBe("garden_bed");
    expect(placed?.x).toBe(10);
    expect(placed?.y).toBe(10);
    expect(armedItemId(SPACE)).toBeNull();
    expect(isTileOccupiedByPlacedItem(SPACE, 10, 10)).toBe(true);
  });

  it("placing with nothing armed is a no-op, not an error", () => {
    expect(placeArmedItem(SPACE, 5, 5)).toBeNull();
  });

  it("a tile with a real building/object/attendant/grass/spawn is never free, matching isPlacementBlocked", () => {
    // Tile (0,0) is inside the north row's first building footprint (bank) in the real layout.
    expect(isTileFreeForPlacement(SPACE, 2, 1)).toBe(false);
  });

  it("a tile another placed item already occupies is no longer free", () => {
    fundTreasury(1000);
    armItem(SPACE, "bench");
    placeArmedItem(SPACE, 12, 12);
    expect(isTileFreeForPlacement(SPACE, 12, 12)).toBe(false);
  });

  it("placed items persist across separate reads (real localStorage state, not in-memory only)", () => {
    fundTreasury(1000);
    armItem(SPACE, "banner_post");
    placeArmedItem(SPACE, 15, 15);
    expect(placedItems(SPACE)).toHaveLength(1);
    expect(placedItems(SPACE)[0]?.itemId).toBe("banner_post");
  });

  it("clearArmedItem clears without placing anything", () => {
    fundTreasury(1000);
    armItem(SPACE, "bench");
    clearArmedItem(SPACE);
    expect(armedItemId(SPACE)).toBeNull();
    expect(placeArmedItem(SPACE, 20, 20)).toBeNull();
  });
});
