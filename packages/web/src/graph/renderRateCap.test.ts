import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { shouldSkipRenderFrame, applyRenderRateCap } from "./renderRateCap.js";

/**
 * The actual fps-cap fix: react-force-graph's own RAF loop submits a real GPU draw
 * every native frame regardless of Graph3D's configured cap — this module is the only
 * place that can genuinely throttle it (see the module's own doc comment for why the
 * composer's render() specifically, not renderer.render directly).
 */
describe("shouldSkipRenderFrame", () => {
  it("never skips the very first call (lastRenderMs === null)", () => {
    expect(shouldSkipRenderFrame(1000, null, 30)).toBe(false);
  });

  it("does not treat a real previous render at performance.now() === 0 as 'no previous render'", () => {
    // The sentinel is `null`, not `0` — a render that legitimately happened at t=0
    // must still gate a too-soon next frame, unlike a fresh/never-rendered composer.
    expect(shouldSkipRenderFrame(5, 0, 30)).toBe(true);
  });

  it("skips a frame arriving well before the target cadence", () => {
    // 30fps target = ~33.3ms between frames; 5ms later is far too soon.
    expect(shouldSkipRenderFrame(1005, 1000, 30)).toBe(true);
  });

  it("does not skip once enough time has passed for the cap", () => {
    expect(shouldSkipRenderFrame(1034, 1000, 30)).toBe(false);
  });

  it("honors the same -1.5ms slack as Graph3D's own tick() gate", () => {
    // 1000/30 - 1.5 = 31.83ms. Just under that should still skip; just at/over should not.
    expect(shouldSkipRenderFrame(1000 + 31, 1000, 30)).toBe(true);
    expect(shouldSkipRenderFrame(1000 + 32, 1000, 30)).toBe(false);
  });

  it("scales the threshold with a higher cap (60fps allows more frames through)", () => {
    // 1000/60 - 1.5 = ~15.2ms.
    expect(shouldSkipRenderFrame(1010, 1000, 60)).toBe(true);
    expect(shouldSkipRenderFrame(1020, 1000, 60)).toBe(false);
  });

  it("never skips for a non-finite or non-positive fpsCap — bogus config must not stop rendering", () => {
    expect(shouldSkipRenderFrame(1001, 1000, 0)).toBe(false);
    expect(shouldSkipRenderFrame(1001, 1000, -5)).toBe(false);
    expect(shouldSkipRenderFrame(1001, 1000, NaN)).toBe(false);
    expect(shouldSkipRenderFrame(1001, 1000, Infinity)).toBe(false);
  });
});

describe("applyRenderRateCap", () => {
  let realNow: () => number;
  let clock: { t: number };

  beforeEach(() => {
    clock = { t: 0 };
    realNow = performance.now.bind(performance);
    performance.now = () => clock.t;
  });

  afterEach(() => {
    performance.now = realNow;
  });

  function fakeComposer() {
    let calls = 0;
    const composer = {
      render(_dt?: number) {
        calls++;
      },
    };
    return { composer, getCalls: () => calls };
  }

  it("lets the first render through unconditionally", () => {
    const { composer, getCalls } = fakeComposer();
    applyRenderRateCap(composer, () => 30);
    composer.render();
    expect(getCalls()).toBe(1);
  });

  it("throttles rapid native-cadence calls down to the configured cap", () => {
    const { composer, getCalls } = fakeComposer();
    applyRenderRateCap(composer, () => 30);
    // Simulate 120 native frames at 8.33ms apart (120Hz) over 1 second — a 30fps cap
    // should let roughly 30 of them through, not all 120.
    for (let i = 0; i < 120; i++) {
      composer.render();
      clock.t += 1000 / 120;
    }
    expect(getCalls()).toBeGreaterThan(20);
    expect(getCalls()).toBeLessThan(40);
  });

  it("renders every call when frames already arrive slower than the cap", () => {
    const { composer, getCalls } = fakeComposer();
    applyRenderRateCap(composer, () => 60);
    // 20 frames at 50ms apart (20fps) — well under a 60fps cap, nothing should skip.
    for (let i = 0; i < 20; i++) {
      composer.render();
      clock.t += 50;
    }
    expect(getCalls()).toBe(20);
  });

  it("reads the fps cap live on every call, not just at install time", () => {
    const { composer, getCalls } = fakeComposer();
    let cap = 30;
    applyRenderRateCap(composer, () => cap);
    composer.render(); // t=0, always renders
    clock.t += 20; // under the 30fps threshold (~33ms) — would normally skip
    composer.render();
    expect(getCalls()).toBe(1);
    cap = 1000; // effectively uncapped now
    composer.render(); // same clock.t — but the raised cap should let it through
    expect(getCalls()).toBe(2);
  });

  it("is idempotent per composer instance — installing twice does not double-wrap", () => {
    const { composer, getCalls } = fakeComposer();
    applyRenderRateCap(composer, () => 30);
    applyRenderRateCap(composer, () => 30);
    composer.render();
    clock.t += 1000; // plenty of time — would render once regardless
    composer.render();
    expect(getCalls()).toBe(2); // not double-invoked per call
  });

  it("wraps a fresh composer instance independently (a remount is not affected by a prior one)", () => {
    const first = fakeComposer();
    const second = fakeComposer();
    applyRenderRateCap(first.composer, () => 30);
    applyRenderRateCap(second.composer, () => 30);
    first.composer.render();
    second.composer.render();
    expect(first.getCalls()).toBe(1);
    expect(second.getCalls()).toBe(1);
  });

  it("passes the original deltaTime argument through when a call is not skipped", () => {
    let seenDelta: number | undefined;
    const composer = {
      render(dt?: number) {
        seenDelta = dt;
      },
    };
    applyRenderRateCap(composer, () => 30);
    composer.render(0.5);
    expect(seenDelta).toBe(0.5);
  });
});
