import { describe, it, expect } from "vitest";
import { completeMove, createMovementState, tryMove, type MovementGrid } from "./movement.js";

function openGrid(width = 5, height = 5): MovementGrid {
  return { width, height, isPassable: () => true };
}

describe("tryMove (architecture.md test plan #4 — collision/movement)", () => {
  it("moves one tile in the given direction when the destination is passable", () => {
    const state = createMovementState({ x: 2, y: 2 });
    const { moved, state: next } = tryMove(state, "right", openGrid());
    expect(moved).toBe(true);
    expect(next.position).toEqual({ x: 3, y: 2 });
    expect(next.isMoving).toBe(true);
  });

  it("refuses to move onto an impassable tile", () => {
    const grid: MovementGrid = { width: 5, height: 5, isPassable: (x, y) => !(x === 3 && y === 2) };
    const state = createMovementState({ x: 2, y: 2 });
    const { moved, state: next } = tryMove(state, "right", grid);
    expect(moved).toBe(false);
    expect(next.position).toEqual({ x: 2, y: 2 });
  });

  it("refuses to move out of bounds", () => {
    const state = createMovementState({ x: 0, y: 0 });
    const { moved, state: next } = tryMove(state, "left", openGrid());
    expect(moved).toBe(false);
    expect(next.position).toEqual({ x: 0, y: 0 });
  });

  it("ignores a new move while mid-tween (isMoving), preventing analog drift", () => {
    const state = createMovementState({ x: 2, y: 2 });
    const { state: mid } = tryMove(state, "right", openGrid());
    expect(mid.isMoving).toBe(true);
    const { moved, state: stillMid } = tryMove(mid, "down", openGrid());
    expect(moved).toBe(false);
    expect(stillMid.position).toEqual({ x: 3, y: 2 }); // unchanged from the in-flight move
  });

  it("allows the next move only after completeMove unlocks it", () => {
    const state = createMovementState({ x: 2, y: 2 });
    const { state: mid } = tryMove(state, "right", openGrid());
    const unlocked = completeMove(mid);
    expect(unlocked.isMoving).toBe(false);
    const { moved, state: next } = tryMove(unlocked, "down", openGrid());
    expect(moved).toBe(true);
    expect(next.position).toEqual({ x: 3, y: 3 });
  });

  it("updates facing even on a blocked/mid-tween attempt (turning in place)", () => {
    const grid: MovementGrid = { width: 5, height: 5, isPassable: () => false };
    const state = createMovementState({ x: 2, y: 2 }, "down");
    const { state: next } = tryMove(state, "up", grid);
    expect(next.facing).toBe("up");
    expect(next.position).toEqual({ x: 2, y: 2 });
  });

  it("never mutates the input state (pure)", () => {
    const state = createMovementState({ x: 2, y: 2 });
    const snapshot = JSON.parse(JSON.stringify(state));
    tryMove(state, "right", openGrid());
    expect(state).toEqual(snapshot);
  });
});
