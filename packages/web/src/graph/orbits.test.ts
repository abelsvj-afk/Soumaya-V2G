import { describe, it, expect } from "vitest";
import { makeOrbitSystem } from "./orbits.js";

/**
 * Pins the Performance Program Stage 5 orbit LOD: bodies far from the camera update
 * less often (fewer transcendentals/frame), but must be "stepped but phase-continuous",
 * not frozen — when a throttled body finally updates, it must land exactly where
 * continuous every-frame simulation would have put it (elapsed time banked in
 * `pendingDt`, not lost), and omitting `cameraPos` entirely must reproduce the exact
 * pre-Stage-5 behavior (every node updates every frame).
 */
function star(id: number) {
  return { id, mass: 1, x: 0, y: 0, z: 0 };
}

describe("orbits — Stage 5 LOD", () => {
  it("without cameraPos, every node updates every frame (unchanged pre-Stage-5 behavior)", () => {
    const sys = makeOrbitSystem();
    const nodes = [star(1), star(2), star(3)];
    sys.rebuild(nodes, []);
    const before = nodes.map((n) => ({ x: n.x, y: n.y, z: n.z }));
    sys.update(0.1, nodes); // no cameraPos
    const after = nodes.map((n) => ({ x: n.x, y: n.y, z: n.z }));
    // Every top-level node has nonzero angular speed, so every position must have moved.
    for (let i = 0; i < nodes.length; i++) {
      expect(after[i]).not.toEqual(before[i]);
    }
  });

  it("a far body (rate 4) only ever changes on at most 1 in every 4 frames", () => {
    const sys = makeOrbitSystem();
    const nodes = [star(1)];
    sys.rebuild(nodes, []);
    // Place the camera far enough that this lone top-level body lands in the "far" (rate 4) band.
    const farCamera = { x: 100000, y: 0, z: 0 };
    let last = { x: nodes[0]!.x, y: nodes[0]!.y, z: nodes[0]!.z };
    let changes = 0;
    const FRAMES = 40; // several full rate-4 cycles
    for (let i = 0; i < FRAMES; i++) {
      sys.update(0.1, nodes, farCamera);
      const cur = { x: nodes[0]!.x, y: nodes[0]!.y, z: nodes[0]!.z };
      if (cur.x !== last.x || cur.y !== last.y || cur.z !== last.z) changes++;
      last = cur;
    }
    // +1: a node's very first update is always forced-eligible (see `everUpdated` in
    // orbits.ts) regardless of its stagger slot, so it can't sit at a placeholder
    // position for up to 3 frames right after appearing — that first forced update
    // counts as one "change" on top of the normal periodic rate-4 cadence.
    expect(changes).toBeLessThanOrEqual(Math.ceil(FRAMES / 4) + 1);
    expect(changes).toBeGreaterThan(0); // it does still move — not frozen forever
  });

  it("phase-continuity: a throttled body ends up EXACTLY where continuous simulation would", () => {
    // Two identical systems, single top-level body each, one run every-frame (no
    // cameraPos = rate 1 for everyone), one run with a far camera (rate 4 for the lone
    // body) — after the same total elapsed time they must land on the same angle, i.e.
    // the same position, because pendingDt banks the skipped time rather than losing it.
    const baseline = makeOrbitSystem();
    const baseNodes = [star(1)];
    baseline.rebuild(baseNodes, []);

    const throttled = makeOrbitSystem();
    const throttledNodes = [star(1)];
    throttled.rebuild(throttledNodes, []);
    const farCamera = { x: 100000, y: 0, z: 0 };

    const dt = 1 / 60;
    const frames = 40; // > one full rate-4 cycle several times over
    for (let i = 0; i < frames; i++) {
      baseline.update(dt, baseNodes);
      throttled.update(dt, throttledNodes, farCamera);
    }
    expect(throttledNodes[0]!.x).toBeCloseTo(baseNodes[0]!.x, 6);
    expect(throttledNodes[0]!.y).toBeCloseTo(baseNodes[0]!.y, 6);
    expect(throttledNodes[0]!.z).toBeCloseTo(baseNodes[0]!.z, 6);
  });

  it("a freshly-rebuilt far body gets a real position on its VERY FIRST update, not a placeholder", () => {
    // Regression test for a real bug the measurement harness caught: without forcing a
    // node's first-ever update to be eligible, a brand-new far-band body could sit at
    // its pre-orbit placeholder coordinates for up to `rate-1` frames — a large, real
    // divergence from continuous simulation, not the small bounded staleness the LOD
    // design intends. Comparing against a same-seed rate-1 baseline after ONE frame
    // proves the first update is never deferred by stagger.
    const throttled = makeOrbitSystem();
    const throttledNodes = [star(1)];
    throttled.rebuild(throttledNodes, []);
    const farCamera = { x: 100000, y: 0, z: 0 };
    throttled.update(0.1, throttledNodes, farCamera);

    const baseline = makeOrbitSystem();
    const baseNodes = [star(1)];
    baseline.rebuild(baseNodes, []);
    baseline.update(0.1, baseNodes); // no cameraPos -> rate 1, the "ground truth" for frame 1

    expect(throttledNodes[0]!.x).toBeCloseTo(baseNodes[0]!.x, 9);
    expect(throttledNodes[0]!.y).toBeCloseTo(baseNodes[0]!.y, 9);
    expect(throttledNodes[0]!.z).toBeCloseTo(baseNodes[0]!.z, 9);
  });

  it("a near body (inside NEAR_DIST) still updates every single frame even with cameraPos set", () => {
    const sys = makeOrbitSystem();
    const nodes = [star(1)];
    sys.rebuild(nodes, []);
    const nearCamera = { x: 0, y: 0, z: 0 }; // right on top of the body -> "near" band
    let changed = 0;
    let last = { x: nodes[0]!.x, y: nodes[0]!.y, z: nodes[0]!.z };
    for (let i = 0; i < 5; i++) {
      sys.update(0.1, nodes, nearCamera);
      const cur = { x: nodes[0]!.x, y: nodes[0]!.y, z: nodes[0]!.z };
      if (cur.x !== last.x || cur.y !== last.y || cur.z !== last.z) changed++;
      last = cur;
    }
    expect(changed).toBe(5); // every frame moved — rate 1
  });

  it("a held node accumulates no pending debt while held, and doesn't jump on release", () => {
    const sys = makeOrbitSystem();
    const nodes = [star(1)];
    sys.rebuild(nodes, []);
    sys.hold(1);
    const before = { x: nodes[0]!.x, y: nodes[0]!.y, z: nodes[0]!.z };
    for (let i = 0; i < 10; i++) sys.update(0.1, nodes); // held: must never move
    expect(nodes[0]).toMatchObject(before);
    sys.release(1);
    sys.update(0.1, nodes); // one frame's worth of motion only, not 11 frames' worth
    const afterOneFrame = { x: nodes[0]!.x, y: nodes[0]!.y, z: nodes[0]!.z };
    const fresh = makeOrbitSystem();
    const freshNodes = [star(1)];
    fresh.rebuild(freshNodes, []);
    fresh.update(0.1, freshNodes); // a single frame from the same start state
    expect(afterOneFrame.x).toBeCloseTo(freshNodes[0]!.x, 9);
    expect(afterOneFrame.y).toBeCloseTo(freshNodes[0]!.y, 9);
    expect(afterOneFrame.z).toBeCloseTo(freshNodes[0]!.z, 9);
  });
});
