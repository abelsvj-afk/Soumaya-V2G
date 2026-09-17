import { describe, it, expect } from "vitest";
import { footprintForFacing, tileInFront } from "./interact.js";
import type { Direction } from "./movement.js";
import { HOME_TYPES } from "../data/housing.js";
import { BUSINESS_TYPES } from "../data/business.js";

const FACINGS: Direction[] = ["up", "down", "left", "right"];
const PLAYER = { x: 20, y: 15 };

describe("footprintForFacing (task #128) — a building grows into the space you face", () => {
  it("always includes the faced tile, for every facing and every real building size", () => {
    for (const type of [...HOME_TYPES, ...BUSINESS_TYPES]) {
      for (const facing of FACINGS) {
        const front = tileInFront(PLAYER, facing);
        const f = footprintForFacing(PLAYER, facing, type.width, type.height);
        expect(front.x).toBeGreaterThanOrEqual(f.x0);
        expect(front.x).toBeLessThanOrEqual(f.x1);
        expect(front.y).toBeGreaterThanOrEqual(f.y0);
        expect(front.y).toBeLessThanOrEqual(f.y1);
      }
    }
  });

  it("NEVER covers the player's own tile — the structural fix for building on top of yourself", () => {
    // Task #126 measured the opposite of this on the old geometry: facing up or left covered the
    // player's tile in 16 of 16 type/facing combinations. Now it is impossible by construction.
    for (const type of [...HOME_TYPES, ...BUSINESS_TYPES]) {
      for (const facing of FACINGS) {
        const f = footprintForFacing(PLAYER, facing, type.width, type.height);
        const covers = PLAYER.x >= f.x0 && PLAYER.x <= f.x1 && PLAYER.y >= f.y0 && PLAYER.y <= f.y1;
        expect(covers).toBe(false);
      }
    }
  });

  it("keeps the exact right/down behaviour that already worked — the faced tile is the top-left", () => {
    const f = footprintForFacing(PLAYER, "down", 3, 2);
    expect(f).toEqual({ x0: 20, y0: 16, x1: 22, y1: 17 });
    const r = footprintForFacing(PLAYER, "right", 3, 2);
    expect(r).toEqual({ x0: 21, y0: 15, x1: 23, y1: 16 });
  });

  it("extends upward when facing up, and leftward when facing left — the two that silently failed", () => {
    // Facing up from (20,15): faced tile is (20,14), and a 3x2 must occupy the rows ABOVE the
    // player, i.e. y 13..14 — not 14..15, which would grow back through them.
    expect(footprintForFacing(PLAYER, "up", 3, 2)).toEqual({ x0: 20, y0: 13, x1: 22, y1: 14 });
    // Facing left from (20,15): faced tile is (19,15), and a 3x2 must occupy x 17..19.
    expect(footprintForFacing(PLAYER, "left", 3, 2)).toEqual({ x0: 17, y0: 15, x1: 19, y1: 16 });
  });

  it("always has exactly the requested dimensions, whatever the facing", () => {
    for (const type of [...HOME_TYPES, ...BUSINESS_TYPES]) {
      for (const facing of FACINGS) {
        const f = footprintForFacing(PLAYER, facing, type.width, type.height);
        expect(f.x1 - f.x0 + 1).toBe(type.width);
        expect(f.y1 - f.y0 + 1).toBe(type.height);
      }
    }
  });
});
