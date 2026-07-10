import { describe, it, expect } from "vitest";
import { smooth, vecOf, bodyRadius } from "./soumayaHelpers.js";

/** Locks the pure soumaya helpers extracted in D4. (makeTaskLabel builds a canvas
 *  sprite and is exercised by the app, not here.) */
describe("soumayaHelpers", () => {
  it("smooth is an eased 0→1 ramp: endpoints exact, midpoint centred, monotonic", () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.5)).toBeCloseTo(0.5, 5);
    expect(smooth(0.25)).toBeLessThan(0.25); // eases in (slow start)
    expect(smooth(0.75)).toBeGreaterThan(0.75); // eases out
  });

  it("vecOf converts a loose {x,y,z} to a Vector3, defaulting missing axes to 0", () => {
    const v = vecOf({ x: 1, y: 2, z: 3 });
    expect([v.x, v.y, v.z]).toEqual([1, 2, 3]);
    const p = vecOf({ x: 5 });
    expect([p.x, p.y, p.z]).toEqual([5, 0, 0]);
  });

  it("bodyRadius grows with mass and always returns a positive size", () => {
    expect(bodyRadius({ mass: 0.5, celestial: "moon" })).toBeGreaterThan(0);
    expect(bodyRadius({ mass: 0.9, celestial: "moon" })).toBeGreaterThan(bodyRadius({ mass: 0.1, celestial: "moon" }));
  });
});
