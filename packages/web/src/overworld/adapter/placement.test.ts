import { describe, it, expect } from "vitest";
import { placeCreaturesOnGrid, placeIdsOnGrid, type PlacementGrid } from "./placement.js";
import { nodeToCreature } from "./nodeToCreature.js";
import type { GraphNode } from "@brain/shared";

function openGrid(width: number, height: number): PlacementGrid {
  return { width, height, isBlocked: () => false };
}

describe("placeIdsOnGrid (architecture.md test plan #2 — placement determinism)", () => {
  it("assigns the same ids to the same tiles across independent calls", () => {
    const ids = [3, 17, 42, 8, 91, 2];
    const first = placeIdsOnGrid(ids, openGrid(20, 20));
    const second = placeIdsOnGrid(ids, openGrid(20, 20));
    for (const id of ids) {
      expect(second.get(id)).toEqual(first.get(id));
    }
  });

  it("is independent of input array order", () => {
    const ids = [3, 17, 42, 8, 91, 2];
    const inOrder = placeIdsOnGrid(ids, openGrid(20, 20));
    const reversed = placeIdsOnGrid([...ids].reverse(), openGrid(20, 20));
    for (const id of ids) {
      expect(reversed.get(id)).toEqual(inOrder.get(id));
    }
  });

  it("never places two different ids on the same tile", () => {
    const ids = Array.from({ length: 40 }, (_, i) => i + 1);
    const placed = placeIdsOnGrid(ids, openGrid(8, 8));
    const keys = [...placed.values()].map((p) => `${p.x},${p.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never places an id on a blocked tile", () => {
    const grid: PlacementGrid = { width: 6, height: 6, isBlocked: (x, y) => x < 2 };
    const ids = Array.from({ length: 20 }, (_, i) => i + 1);
    const placed = placeIdsOnGrid(ids, grid);
    for (const { x } of placed.values()) expect(x).toBeGreaterThanOrEqual(2);
  });

  it("leaves an id unplaced rather than erroring when the grid is full", () => {
    const placed = placeIdsOnGrid([1, 2, 3], openGrid(1, 1));
    expect(placed.size).toBe(1);
  });
});

describe("placeCreaturesOnGrid", () => {
  it("fills in tile for every placeable creature and drops nothing that fits", () => {
    const nodes: GraphNode[] = [1, 2, 3].map((id) => ({
      id,
      label: `n${id}`,
      type: "concept",
      content: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    }));
    const creatures = nodes.map((n) => nodeToCreature(n));
    const placed = placeCreaturesOnGrid(creatures, openGrid(10, 10));
    expect(placed).toHaveLength(3);
    for (const c of placed) expect(c.tile).toBeDefined();
  });
});
