import { describe, it, expect } from "vitest";
import { moteOffset, strongestThoughts, MOTE_MIN_RADIUS, MOTE_MAX_RADIUS } from "./moteLayout.js";

describe("moteLayout (mindspace.md)", () => {
  it("is a pure function of (thoughtId, timeMs) — same inputs, same output", () => {
    expect(moteOffset(42, 1000)).toEqual(moteOffset(42, 1000));
  });

  it("freezing timeMs at 0 (prefersReducedMotion) gives a stable, non-advancing offset", () => {
    const a = moteOffset(7, 0);
    const b = moteOffset(7, 0);
    expect(a).toEqual(b);
  });

  it("different thought ids get different orbits (not all motes stacked identically)", () => {
    const a = moteOffset(1, 500);
    const b = moteOffset(2, 500);
    expect(a).not.toEqual(b);
  });

  it("the same thought id drifts over time (real orbiting motion when not reduced)", () => {
    const a = moteOffset(3, 0);
    const b = moteOffset(3, 3000);
    expect(a).not.toEqual(b);
  });

  it("stays within the documented radius band", () => {
    for (let id = 0; id < 50; id++) {
      for (const t of [0, 1234, 5000, 9999]) {
        const { dx, dy } = moteOffset(id, t);
        // dy carries a fixed -14 "float near the head" offset on top of the orbit itself
        // (moteOffset's own comment) — undo it before reconstructing the real orbit radius.
        const radius = Math.hypot(dx, (dy + 14) / 0.6);
        expect(radius).toBeGreaterThanOrEqual(MOTE_MIN_RADIUS - 1);
        expect(radius).toBeLessThanOrEqual(MOTE_MAX_RADIUS + 1);
      }
    }
  });

  it("strongestThoughts sorts by strength descending and caps at the limit", () => {
    const thoughts = [{ strength: 0.2 }, { strength: 0.9 }, { strength: 0.5 }, { strength: 0.7 }];
    expect(strongestThoughts(thoughts, 2)).toEqual([{ strength: 0.9 }, { strength: 0.7 }]);
  });

  it("strongestThoughts defaults to a cap of 6", () => {
    const thoughts = Array.from({ length: 10 }, (_, i) => ({ strength: i / 10 }));
    expect(strongestThoughts(thoughts)).toHaveLength(6);
  });

  it("strongestThoughts never mutates the input array", () => {
    const thoughts = [{ strength: 0.1 }, { strength: 0.9 }];
    const copy = [...thoughts];
    strongestThoughts(thoughts);
    expect(thoughts).toEqual(copy);
  });
});
