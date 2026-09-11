import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { beginTick, endTick, attachRenderer, snapshot, reset, markMoved, registerGalaxyCounts, getSlowFrameLog, clearSlowFrameLog, type GalaxyCounts } from "./perfStats.js";
import { noteRefreshInvoked, __resetRefreshTrackingForTests } from "./galaxyStateSnapshot.js";

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

  it("programsChurnCount stays 0 when the program count never changes between polls", () => {
    const r = fakeRenderer(1, clock); // fixed 3-program info object across every poll
    attachRenderer(r);
    renderFrame(r, 1);
    snapshot();
    renderFrame(r, 1);
    expect(snapshot().programsChurnCount).toBe(0);
  });

  it("programsChurnCount increments once per DIFFERENCE observed between consecutive polls", () => {
    const counts = [3, 3, 5, 5, 4]; // one real change 3->5, one real change 5->4
    let i = 0;
    const r = {
      render: () => { clock.t += 1; },
      info: {
        render: { calls: 0, triangles: 0, lines: 0, points: 0 },
        memory: { geometries: 0, textures: 0 },
        get programs() { return Array.from({ length: counts[Math.min(i, counts.length - 1)]! }); },
      },
    } as unknown as import("three").WebGLRenderer;
    attachRenderer(r);
    for (; i < counts.length; i++) {
      renderFrame(r, 1);
      snapshot();
    }
    expect(snapshot().programsChurnCount).toBe(2);
  });

  it("reset() clears programsChurnCount and its baseline", () => {
    const counts = [3, 5];
    let i = 0;
    const r = {
      render: () => { clock.t += 1; },
      info: {
        render: { calls: 0, triangles: 0, lines: 0, points: 0 },
        memory: { geometries: 0, textures: 0 },
        get programs() { return Array.from({ length: counts[Math.min(i, counts.length - 1)]! }); },
      },
    } as unknown as import("three").WebGLRenderer;
    attachRenderer(r);
    renderFrame(r, 1);
    snapshot();
    i = 1;
    renderFrame(r, 1);
    expect(snapshot().programsChurnCount).toBe(1);
    reset();
    expect(snapshot().programsChurnCount).toBe(0);
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

/**
 * Refresh-vs-render-stall correlation diagnostic (2026-09-11 forensic pass) — see
 * perfStats.ts's own doc comment above `getSlowFrameLog` for the hypothesis this exists
 * to test on the physical device. This suite only verifies the INSTRUMENT itself is
 * correct (threshold gating, correlation arithmetic, bounded ring behavior, zero cost on
 * ordinary frames) — it says nothing about whether the hypothesis is true, which is a
 * real-device question deliberately left to actual deployment, not this test suite.
 */
describe("perfStats — slow-frame / refresh() correlation diagnostic (2026-09-11)", () => {
  beforeEach(() => {
    clearSlowFrameLog();
    __resetRefreshTrackingForTests();
  });
  afterEach(() => {
    registerGalaxyCounts(null);
    clearSlowFrameLog();
    __resetRefreshTrackingForTests();
  });

  it("logs nothing for ordinary (sub-threshold) render() calls", () => {
    const r = fakeRenderer(50, clock); // well under the 300ms threshold
    attachRenderer(r);
    renderFrame(r, 0);
    expect(getSlowFrameLog()).toHaveLength(0);
  });

  it("logs a slow render() call once it exceeds the 300ms threshold", () => {
    const r = fakeRenderer(350, clock);
    attachRenderer(r);
    renderFrame(r, 0);
    const log = getSlowFrameLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.durationMs).toBeCloseTo(350, 5);
  });

  it("records a small msSinceRefresh when the slow frame immediately follows a refresh() call", () => {
    const r = fakeRenderer(400, clock);
    attachRenderer(r);
    noteRefreshInvoked(clock.t); // refresh() fires right now
    clock.t += 5; // a few ms pass before the render call starts
    renderFrame(r, 0);
    const [sample] = getSlowFrameLog();
    expect(sample!.msSinceRefresh).toBeCloseTo(5, 5);
  });

  it("records msSinceRefresh as null when no refresh() has ever been recorded this session", () => {
    const r = fakeRenderer(400, clock);
    attachRenderer(r);
    renderFrame(r, 0);
    const [sample] = getSlowFrameLog();
    expect(sample!.msSinceRefresh).toBeNull();
  });

  it("records a large msSinceRefresh when the slow frame is unrelated to any recent refresh()", () => {
    const r = fakeRenderer(400, clock);
    attachRenderer(r);
    noteRefreshInvoked(clock.t);
    clock.t += 10_000; // 10 real seconds later, unrelated to that old refresh
    renderFrame(r, 0);
    const [sample] = getSlowFrameLog();
    expect(sample!.msSinceRefresh).toBeCloseTo(10_000, 5);
  });

  it("captures tracked node/link counts from the already-registered galaxyCountsProvider", () => {
    const r = fakeRenderer(400, clock);
    attachRenderer(r);
    registerGalaxyCounts(
      (): GalaxyCounts => ({
        trackedNodes: 240, trackedLinks: 941, visibleNodes: 240, visibleLinks: 941,
        visibleLabels: 16, lightPoolSize: 4, journeyObjects: 0, moneyObjects: 0,
      }),
    );
    renderFrame(r, 0);
    const [sample] = getSlowFrameLog();
    expect(sample!.trackedNodes).toBe(240);
    expect(sample!.trackedLinks).toBe(941);
  });

  it("records null node/link counts when no provider is registered", () => {
    const r = fakeRenderer(400, clock);
    attachRenderer(r);
    renderFrame(r, 0);
    const [sample] = getSlowFrameLog();
    expect(sample!.trackedNodes).toBeNull();
    expect(sample!.trackedLinks).toBeNull();
  });

  it("is a bounded ring — never grows past the cap even under many consecutive slow frames", () => {
    const r = fakeRenderer(400, clock);
    attachRenderer(r);
    for (let i = 0; i < 50; i++) renderFrame(r, 0);
    expect(getSlowFrameLog().length).toBeLessThanOrEqual(20);
  });

  it("drops the oldest entry first once the cap is exceeded, not just truncating/corrupting data", () => {
    const r = fakeRenderer(400, clock);
    attachRenderer(r);
    for (let i = 0; i < 25; i++) {
      noteRefreshInvoked(clock.t);
      renderFrame(r, 1); // 1ms after the refresh each time — a distinguishing fingerprint
    }
    const log = getSlowFrameLog();
    expect(log).toHaveLength(20); // capped, even though 25 slow frames occurred
    // every SURVIVING entry still shows the same "~1ms after refresh" fingerprint —
    // proves eviction drops whole entries cleanly rather than corrupting the remainder.
    for (const sample of log) expect(sample.msSinceRefresh).toBeCloseTo(1, 5);
  });

  it("adds zero observable cost to ordinary (fast) frames — the log never grows", () => {
    const r = fakeRenderer(2, clock);
    attachRenderer(r);
    for (let i = 0; i < 100; i++) renderFrame(r, 10);
    expect(getSlowFrameLog()).toHaveLength(0);
  });
});

/**
 * getGpuInfo/getRendererPixelRatio (Galaxy recovery pass, 2026-09-10): after three
 * verified, tested render-path fixes produced no perceptible real-device improvement, the
 * next highest-value question is whether the device is even running hardware-accelerated
 * WebGL at all — a software rasterizer would explain exactly that pattern. Uses
 * vi.resetModules() + dynamic import (the same technique perfDiag.test.ts already
 * established) because getGpuInfo caches its result in a module-level variable — a real
 * renderer's GPU string never changes, so caching is correct in production, but each test
 * here needs its own fresh module instance to exercise a different scenario.
 */
describe("perfStats — getGpuInfo / getRendererPixelRatio (hardware-vs-software diagnostic)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null before any renderer is attached", async () => {
    const { getGpuInfo, getRendererPixelRatio } = await import("./perfStats.js");
    expect(getGpuInfo()).toBeNull();
    expect(getRendererPixelRatio()).toBeNull();
  });

  it("reads UNMASKED_VENDOR_WEBGL/UNMASKED_RENDERER_WEBGL when the extension is available", async () => {
    const { attachRenderer, getGpuInfo } = await import("./perfStats.js");
    const ext = { UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 };
    const gl = {
      getExtension: (name: string) => (name === "WEBGL_debug_renderer_info" ? ext : null),
      getParameter: (p: number) => (p === 1 ? "Qualcomm" : p === 2 ? "Adreno (TM) 619" : null),
    };
    const r = { render: () => {}, getContext: () => gl, getPixelRatio: () => 1.5 } as unknown as import("three").WebGLRenderer;
    attachRenderer(r);
    expect(getGpuInfo()).toBe("Qualcomm / Adreno (TM) 619");
  });

  it("returns null (not a throw) when the debug-info extension is masked/unavailable", async () => {
    const { attachRenderer, getGpuInfo } = await import("./perfStats.js");
    const gl = { getExtension: () => null, getParameter: () => null };
    const r = { render: () => {}, getContext: () => gl, getPixelRatio: () => 1 } as unknown as import("three").WebGLRenderer;
    attachRenderer(r);
    expect(getGpuInfo()).toBeNull();
  });

  it("caches the result — a second call doesn't re-query the GL context", async () => {
    const { attachRenderer, getGpuInfo } = await import("./perfStats.js");
    let calls = 0;
    const ext = { UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 };
    const gl = {
      getExtension: () => ext,
      getParameter: (p: number) => { calls++; return p === 1 ? "Vendor" : "Renderer"; },
    };
    const r = { render: () => {}, getContext: () => gl, getPixelRatio: () => 1 } as unknown as import("three").WebGLRenderer;
    attachRenderer(r);
    getGpuInfo();
    getGpuInfo();
    expect(calls).toBe(2); // one vendor + one renderer query, only on the FIRST call
  });

  it("reports the renderer's actual pixel ratio, independent of window.devicePixelRatio", async () => {
    const { attachRenderer, getRendererPixelRatio } = await import("./perfStats.js");
    const r = {
      render: () => {},
      getContext: () => null,
      getPixelRatio: () => 1.25,
    } as unknown as import("three").WebGLRenderer;
    attachRenderer(r);
    expect(getRendererPixelRatio()).toBe(1.25);
  });
});

/**
 * GPU timer queries (`EXT_disjoint_timer_query_webgl2`) — the decisive CPU-vs-GPU
 * signal for a device where the synchronous `render()` call itself can block on
 * driver/queue back-pressure (ANGLE's Vulkan backend, this app's real Android test
 * devices) rather than actual per-pixel GPU work. A query's result is NEVER available
 * synchronously in real WebGL, so this fake models that: `createQuery()` returns an
 * object the test can resolve later via `resolveOldestPending`, and
 * `getQueryParameter(q, QUERY_RESULT_AVAILABLE)` only turns true once the test does so
 * — exercising the exact "poll on the next render() call, never block" contract.
 */
describe("perfStats — GPU timer queries (CPU-vs-GPU diagnostic)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  function fakeGpuGl() {
    const TIME_ELAPSED_EXT = 111;
    const GPU_DISJOINT_EXT = 222;
    const ext = { TIME_ELAPSED_EXT, GPU_DISJOINT_EXT };
    const created: { available: boolean; ns: number }[] = [];
    let disjointFlag = false;
    const gl = {
      QUERY_RESULT_AVAILABLE: "AVAILABLE",
      QUERY_RESULT: "RESULT",
      createQuery: () => {
        const q = { available: false, ns: 0 };
        created.push(q);
        return q;
      },
      beginQuery: () => {},
      endQuery: () => {},
      getExtension: (name: string) => (name === "EXT_disjoint_timer_query_webgl2" ? ext : null),
      getQueryParameter: (q: { available: boolean; ns: number }, pname: string) =>
        pname === "AVAILABLE" ? q.available : q.ns,
      getParameter: (pname: number) => (pname === GPU_DISJOINT_EXT ? disjointFlag : null),
      deleteQuery: () => {},
    } as unknown as WebGL2RenderingContext;
    return {
      gl,
      resolveOldestPending: (ns: number) => {
        const q = created.find((x) => !x.available);
        if (q) { q.available = true; q.ns = ns; }
      },
      setDisjoint: (v: boolean) => { disjointFlag = v; },
      pendingCount: () => created.filter((x) => !x.available).length,
    };
  }

  function fakeRendererWithGl(gl: unknown) {
    return { render: () => {}, getContext: () => gl, getPixelRatio: () => 1 } as unknown as import("three").WebGLRenderer;
  }

  it("gpuTimingSupported is false and gpu stays null when the extension is unavailable", async () => {
    const { attachRenderer, snapshot } = await import("./perfStats.js");
    const gl = { getExtension: () => null, createQuery: () => ({}) };
    attachRenderer(fakeRendererWithGl(gl));
    const s = snapshot();
    expect(s.gpuTimingSupported).toBe(false);
    expect(s.gpu).toBeNull();
  });

  it("gpuTimingSupported is true but gpu stays null until a query actually resolves", async () => {
    const { attachRenderer, snapshot } = await import("./perfStats.js");
    const { gl } = fakeGpuGl();
    const r = fakeRendererWithGl(gl);
    attachRenderer(r);
    renderFrame(r, 16);
    const s = snapshot();
    expect(s.gpuTimingSupported).toBe(true);
    expect(s.gpu).toBeNull(); // nothing resolved yet — never a blocking read
  });

  it("records a resolved query's elapsed time in ms, polled on a LATER render() call", async () => {
    const { attachRenderer, snapshot } = await import("./perfStats.js");
    const helper = fakeGpuGl();
    const r = fakeRendererWithGl(helper.gl);
    attachRenderer(r);
    renderFrame(r, 16); // frame 1 — begins a query
    helper.resolveOldestPending(5_000_000); // GPU finishes: 5ms, arrives some frames later
    renderFrame(r, 16); // frame 2 — polls at its START, picks up frame 1's result
    const s = snapshot();
    expect(s.gpu?.p50).toBeCloseTo(5, 5);
  });

  it("a disjoint event discards every pending query instead of recording stale results", async () => {
    const { attachRenderer, snapshot } = await import("./perfStats.js");
    const helper = fakeGpuGl();
    const r = fakeRendererWithGl(helper.gl);
    attachRenderer(r);
    renderFrame(r, 16);
    helper.resolveOldestPending(5_000_000);
    helper.setDisjoint(true);
    renderFrame(r, 16); // polls while disjoint — must drop, not record, the pending result
    expect(snapshot().gpu).toBeNull();
    expect(helper.pendingCount()).toBe(1); // the frame-2 query itself is still in flight
  });

  it("never grows the pending queue unboundedly if queries never resolve", async () => {
    const { attachRenderer, snapshot } = await import("./perfStats.js");
    const helper = fakeGpuGl();
    const r = fakeRendererWithGl(helper.gl);
    attachRenderer(r);
    for (let i = 0; i < 50; i++) renderFrame(r, 16); // none ever resolved
    expect(() => snapshot()).not.toThrow();
    expect(snapshot().gpu).toBeNull();
  });
});
