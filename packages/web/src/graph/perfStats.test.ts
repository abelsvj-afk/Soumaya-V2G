import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { beginTick, endTick, attachRenderer, snapshot, reset, markMoved, registerGalaxyCounts } from "./perfStats.js";

/**
 * The frame-timing instrument (Performance Program, Stage 0). Every later stage is
 * verified against these numbers, so the instrument itself has to be right — a wrong
 * percentile, or a wrong pairing of samples, would send the whole program chasing the
 * wrong bottleneck.
 *
 * The critical thing under test here is that tick() and render() are modeled as
 * INDEPENDENT loops (matching the real 3d-force-graph library, which runs its own
 * uncapped requestAnimationFrame loop calling renderer.render() regardless of our own
 * tick()'s FPS cap) — so tick, render, and present are three separate series, not one
 * fused "workMs" built by pairing whatever tick most recently finished with whatever
 * render call happens to fire next.
 */

/** A minimal stand-in for THREE.WebGLRenderer: just what perfStats touches. */
function fakeRenderer(renderCostMs: number, clock: { t: number }) {
  return {
    render: () => {
      clock.t += renderCostMs;
    },
    info: {
      render: { calls: 7, triangles: 1234, lines: 5, points: 9 },
      memory: { geometries: 11, textures: 13 },
      programs: [{}, {}, {}],
    },
  } as unknown as import("three").WebGLRenderer;
}

let clock: { t: number };
let realNow: () => number;

beforeEach(() => {
  clock = { t: 0 };
  realNow = performance.now.bind(performance);
  // Deterministic clock so percentiles are exact.
  performance.now = () => clock.t;
  reset();
});

/** One real render() call, `gapMs` after the previous one. */
function renderFrame(r: import("three").WebGLRenderer, gapMs: number) {
  clock.t += gapMs;
  r.render(null as never, null as never);
}

/** One real tick() invocation (i.e. NOT a frame the FPS cap skipped). */
function tickFrame(costMs: number) {
  beginTick();
  clock.t += costMs;
  endTick();
}

describe("perfStats", () => {
  it("measures tick and render as independent series, not a fused/paired metric", () => {
    const r = fakeRenderer(2, clock);
    attachRenderer(r);

    // tick() runs at HALF the rate render() does — exactly the real-world case this
    // instrument exists to handle correctly (our FPS cap vs. the library's uncapped loop).
    for (let i = 0; i < 10; i++) {
      tickFrame(6);
      renderFrame(r, 10);
      renderFrame(r, 10); // a render with NO corresponding tick this cycle
    }

    const s = snapshot();
    // tick reflects only the frames that actually ran tick() — unaffected by how many
    // extra renders happened in between.
    expect(s.tick.p50).toBeCloseTo(6, 5);
    expect(s.tickSamples).toBe(10);
    // render reflects the draw-submission cost alone, sampled on every real render call.
    expect(s.render.p50).toBeCloseTo(2, 5);
    expect(s.presentSamples).toBe(19); // 20 renders, first has no prior gap to measure
  });

  it("exposes the CPU-vs-GPU bound signal via gapMs (render vs. present, same sampling site)", () => {
    // Fill-rate bound: submission itself is cheap, but frames still arrive slowly — the
    // GPU is the thing taking the extra time between calls.
    const gpuBound = fakeRenderer(1, clock);
    attachRenderer(gpuBound);
    for (let i = 0; i < 20; i++) renderFrame(gpuBound, 30);
    const s = snapshot();

    expect(s.render.p95).toBeLessThan(3); // submission is trivial...
    expect(s.gapMs).toBeGreaterThan(20); // ...yet the gap between frames is large
  });

  it("reports a small gap when submission cost explains the frame interval", () => {
    const r = fakeRenderer(24, clock);
    attachRenderer(r);
    // No idle time beyond the render call itself — render cost IS the whole frame interval.
    for (let i = 0; i < 20; i++) renderFrame(r, 0);
    const s = snapshot();

    expect(s.render.p95).toBeGreaterThan(20);
    expect(s.gapMs).toBeLessThan(2); // nothing unexplained
  });

  it("computes percentiles over the window, so a rare stall shows in p99 but not p50", () => {
    // 2% outliers: with exactly-nearest-rank percentiles, a single 1-in-100 spike legitimately
    // sits right at the p99 boundary rather than past it (p99 means "99% of samples are AT OR
    // BELOW this value", and with only 1 outlier among 100 that boundary is the last normal
    // value, not the outlier itself) — so use a rate the p99 rank is guaranteed to include.
    for (let i = 0; i < 196; i++) tickFrame(4);
    for (let i = 0; i < 4; i++) tickFrame(100); // occasional stalls — what a GC pause looks like

    const s = snapshot();
    expect(s.tick.p50).toBeCloseTo(4, 5); // median is unmoved by a minority of stalls...
    expect(s.tick.max).toBeCloseTo(100, 5); // ...but the worst case is not hidden...
    expect(s.tick.p99).toBeCloseTo(100, 5); // ...and neither is the tail percentile.
  });

  it("never records a tick sample for a frame the FPS cap skipped", () => {
    // A skipped frame calls neither beginTick nor endTick at all — simulate by simply
    // not calling tickFrame(), and confirm the sample count doesn't move.
    tickFrame(2);
    tickFrame(2);
    const before = snapshot().tickSamples;

    clock.t += 100; // time passes; the cap gate would have returned here, calling nothing

    expect(snapshot().tickSamples).toBe(before);
  });

  it("surfaces renderer.info counters for the HUD", () => {
    const r = fakeRenderer(1, clock);
    attachRenderer(r);
    renderFrame(r, 1);
    renderFrame(r, 1);
    const s = snapshot();

    expect(s.drawInfo).toEqual({ calls: 7, triangles: 1234, lines: 5, points: 9 });
    expect(s.memory).toEqual({ geometries: 11, textures: 13 });
    expect(s.programs).toBe(3); // the shader-recompile canary
  });

  it("consumes the moved flag so each reader sees motion since its own last read", () => {
    expect(snapshot().movedRecently).toBe(false);
    markMoved();
    expect(snapshot().movedRecently).toBe(true);
    expect(snapshot().movedRecently).toBe(false); // consumed
  });

  it("re-patches a fresh renderer on remount instead of going quiet", () => {
    const first = fakeRenderer(1, clock);
    attachRenderer(first);
    renderFrame(first, 5);
    reset();

    // Simulate a Graph3D remount handing us a brand-new WebGLRenderer instance.
    const second = fakeRenderer(3, clock);
    attachRenderer(second);
    renderFrame(second, 5);
    renderFrame(second, 5);

    const s = snapshot();
    expect(s.render.p50).toBeCloseTo(3, 5); // the second renderer's cost, not stale/zero
    expect(s.presentSamples).toBe(1);
  });

  it("reset clears all three windows so a quality change isn't averaged with the old regime", () => {
    const r = fakeRenderer(1, clock);
    attachRenderer(r);
    for (let i = 0; i < 10; i++) { tickFrame(30); renderFrame(r, 30); }
    expect(snapshot().tickSamples).toBeGreaterThan(0);

    reset();
    const s = snapshot();
    expect(s.tickSamples).toBe(0);
    expect(s.presentSamples).toBe(0);
    expect(s.tick.p95).toBe(0);
  });

  it("restores the real clock", () => {
    performance.now = realNow;
    expect(typeof performance.now()).toBe("number");
  });

  describe("galaxyCounts (Phase 1 measurement — soumaya-galaxy-rendering-architecture-audit.md)", () => {
    afterEach(() => registerGalaxyCounts(null)); // don't leak a provider into other tests

    it("is null until Graph3D registers a provider", () => {
      expect(snapshot().galaxyCounts).toBeNull();
    });

    it("pulls fresh values from the registered provider on every snapshot() call, not once", () => {
      let calls = 0;
      registerGalaxyCounts(() => {
        calls++;
        return {
          trackedNodes: 300, trackedLinks: 1200, visibleNodes: 300, visibleLinks: 1200,
          visibleLabels: 24, lightPoolSize: 6, journeyObjects: 4, moneyObjects: 8,
        };
      });
      const first = snapshot().galaxyCounts;
      const second = snapshot().galaxyCounts;
      expect(first).toEqual({
        trackedNodes: 300, trackedLinks: 1200, visibleNodes: 300, visibleLinks: 1200,
        visibleLabels: 24, lightPoolSize: 6, journeyObjects: 4, moneyObjects: 8,
      });
      expect(second).toEqual(first);
      expect(calls).toBe(2); // pull-based: invoked on demand, not cached across calls
    });

    it("reverts to null once unregistered (e.g. Graph3D unmount)", () => {
      registerGalaxyCounts(() => ({
        trackedNodes: 1, trackedLinks: 1, visibleNodes: 1, visibleLinks: 1,
        visibleLabels: 1, lightPoolSize: 1, journeyObjects: 0, moneyObjects: 0,
      }));
      expect(snapshot().galaxyCounts).not.toBeNull();
      registerGalaxyCounts(null);
      expect(snapshot().galaxyCounts).toBeNull();
    });
  });
});
