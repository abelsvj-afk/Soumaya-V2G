import { describe, it, expect } from "vitest";
import { makeGalaxies } from "./starfield.js";

/**
 * Regression coverage for the Galaxy render recovery pass (2026-09-10): the spiral
 * galaxy's rotation used to be a per-CALL accumulator (`rotation.y += 0.00032`), unlike
 * every other scenery object in this file (starfield/milky way both use `rotation = t *
 * constant`, a pure function of absolute elapsed time). An accumulator's rotation speed is
 * tied to how often the update callback is invoked, not to real time — on a device with an
 * uneven tick cadence (long stalls, then a burst of several quick frames), the galaxy
 * visibly jumped forward by many increments at once during a burst, reading as "flying
 * around fast" rather than a slow, calm drift (user-reported). Fixed to be a pure function
 * of `t`, matching the established, burst-immune pattern already used by
 * makeStarfield/makeMilkyWay in this same file.
 */
describe("starfield — spiral galaxy rotation (burst-jump fix)", () => {
  it("rotation is a pure function of elapsed time — calling update() many times with the same t never advances it further", () => {
    const group = makeGalaxies(1);
    const galaxy = group.children[0]!;
    galaxy.userData.update!(10);
    const angleAfterOneCall = galaxy.rotation.y;
    for (let i = 0; i < 50; i++) galaxy.userData.update!(10); // simulate a burst of frames at the same instant
    expect(galaxy.rotation.y).toBe(angleAfterOneCall); // no accumulation — same t, same angle
  });

  it("landing on the same t gives the same rotation, whether reached in one jump or many small steps", () => {
    // Uneven cadence: a long stall (no calls), then jump straight to t=20.
    const jumpGroup = makeGalaxies(1);
    const jumpGalaxy = jumpGroup.children[0]!;
    const base = jumpGalaxy.rotation.y; // capture BEFORE any update call
    jumpGalaxy.userData.update!(20);
    const afterJump = jumpGalaxy.rotation.y;

    // Smooth cadence: many small steps up to the same t=20, on a galaxy with the SAME
    // base orientation (construct it repeatedly until the random base matches, or just
    // compare the ADVANCE from each galaxy's own captured base instead of the absolute
    // angle, which is what actually matters and avoids relying on matching randomness).
    const stepGroup = makeGalaxies(1);
    const stepGalaxy = stepGroup.children[0]!;
    const stepBase = stepGalaxy.rotation.y;
    for (let t = 0; t <= 20; t += 0.5) stepGalaxy.userData.update!(t);
    const afterSteps = stepGalaxy.rotation.y;

    expect(afterJump - base).toBeCloseTo(20 * 0.00032, 10);
    expect(afterSteps - stepBase).toBeCloseTo(20 * 0.00032, 10);
  });

  it("two galaxies keep their own distinct starting orientation as a phase offset, not a shared accumulator", () => {
    const group = makeGalaxies(2);
    const [a, b] = group.children;
    // Before any update, their initial random rotations are (almost certainly) distinct.
    const initialA = a!.rotation.y;
    const initialB = b!.rotation.y;
    a!.userData.update!(5);
    b!.userData.update!(5);
    // Same t, same speed constant -> the DIFFERENCE between them is preserved exactly.
    expect(a!.rotation.y - b!.rotation.y).toBeCloseTo(initialA - initialB, 10);
  });
});
