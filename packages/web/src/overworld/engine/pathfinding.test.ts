import { describe, it, expect } from "vitest";
import type { MovementGrid } from "./movement.js";
import { findPath } from "./pathfinding.js";

function openGrid(width = 10, height = 10): MovementGrid {
  return { width, height, isPassable: () => true };
}

describe("findPath (NPC Autonomy round — real cross-town movement)", () => {
  it("returns just the start tile when start equals goal", () => {
    const path = findPath({ x: 2, y: 2 }, { x: 2, y: 2 }, openGrid());
    expect(path).toEqual([{ x: 2, y: 2 }]);
  });

  it("finds the real shortest path on open ground (Manhattan distance, no diagonals)", () => {
    const path = findPath({ x: 0, y: 0 }, { x: 3, y: 2 }, openGrid());
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 0, y: 0 });
    expect(path![path!.length - 1]).toEqual({ x: 3, y: 2 });
    expect(path!.length).toBe(1 + 3 + 2); // start tile + 5 steps, shortest possible
  });

  it("every consecutive pair of tiles in the path is a real orthogonal neighbor (no diagonal jumps)", () => {
    const path = findPath({ x: 0, y: 0 }, { x: 4, y: 4 }, openGrid());
    expect(path).not.toBeNull();
    for (let i = 1; i < path!.length; i++) {
      const a = path![i - 1]!;
      const b = path![i]!;
      const manhattan = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      expect(manhattan).toBe(1);
    }
  });

  it("routes around a real wall instead of walking through it", () => {
    // A vertical wall at x=2, rows 0..3, with a gap at row 4.
    const grid: MovementGrid = {
      width: 6,
      height: 6,
      isPassable: (x, y) => !(x === 2 && y < 4),
    };
    const path = findPath({ x: 0, y: 0 }, { x: 4, y: 0 }, grid);
    expect(path).not.toBeNull();
    for (const tile of path!) {
      expect(grid.isPassable(tile.x, tile.y)).toBe(true);
    }
  });

  it("returns null for a genuinely unreachable goal (fully walled off)", () => {
    const grid: MovementGrid = {
      width: 6,
      height: 6,
      isPassable: (x, y) => !(x === 2), // a solid wall spanning the whole height, no gap
    };
    expect(findPath({ x: 0, y: 0 }, { x: 4, y: 4 }, grid)).toBeNull();
  });

  it("returns null when the goal tile itself isn't passable, even if adjacent tiles are", () => {
    const grid: MovementGrid = { width: 5, height: 5, isPassable: (x, y) => !(x === 3 && y === 3) };
    expect(findPath({ x: 0, y: 0 }, { x: 3, y: 3 }, grid)).toBeNull();
  });

  it("returns null for an out-of-bounds start or goal, never throws", () => {
    expect(findPath({ x: -1, y: 0 }, { x: 2, y: 2 }, openGrid())).toBeNull();
    expect(findPath({ x: 0, y: 0 }, { x: 99, y: 99 }, openGrid())).toBeNull();
  });

  it("never hangs on an unreachable goal — a low search budget returns null quickly instead", () => {
    const grid: MovementGrid = {
      width: 200,
      height: 200,
      isPassable: (x, y) => !(x === 100), // a wall the search would otherwise explore forever around
    };
    const path = findPath({ x: 0, y: 0 }, { x: 199, y: 199 }, grid, { maxVisited: 50 });
    expect(path).toBeNull();
  });

  it("is deterministic — the same start/goal/grid always yields the identical path", () => {
    const grid = openGrid();
    const a = findPath({ x: 1, y: 1 }, { x: 8, y: 8 }, grid);
    const b = findPath({ x: 1, y: 1 }, { x: 8, y: 8 }, grid);
    expect(a).toEqual(b);
  });
});
