import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  installComposerTrace,
  installRenderPassTrace,
  getLatestComposerMs,
  getLatestRenderPassMs,
  getMedianComposerMs,
  getMedianRenderPassMs,
  getPassesInLastComposerFrame,
  __resetForTests,
} from "./renderStageTrace.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";

describe("renderStageTrace", () => {
  beforeEach(() => {
    __resetForTests();
  });

  it("installComposerTrace times composer.render() without changing its behavior", () => {
    const calls: number[] = [];
    const composer = {
      render(dt?: number) {
        calls.push(dt ?? -1);
      },
    };
    installComposerTrace(composer);
    composer.render(0.5);
    expect(calls).toEqual([0.5]); // original still runs with the same arguments
    expect(getLatestComposerMs()).not.toBeNull();
    expect(getLatestComposerMs()!).toBeGreaterThanOrEqual(0);
  });

  it("installComposerTrace is idempotent per instance (patching twice doesn't double-wrap)", () => {
    let callCount = 0;
    const composer = { render: () => { callCount++; } };
    installComposerTrace(composer);
    installComposerTrace(composer); // second call must be a no-op
    composer.render();
    expect(callCount).toBe(1);
  });

  it("installRenderPassTrace times RenderPass.render() globally and preserves its behavior", () => {
    // Stub the real implementation BEFORE installing the trace, so the trace wraps this
    // stub (never touching real WebGL/scene state) — installRenderPassTrace captures
    // whatever's on the prototype at install time as "the original" to call through to.
    const renderMock = vi.fn(() => "ok");
    (RenderPass.prototype as any).render = renderMock;
    installRenderPassTrace();
    const fakeInstance = {};
    const result = (RenderPass.prototype as any).render.call(fakeInstance, 1, 2, 3);
    expect(result).toBe("ok");
    expect(renderMock).toHaveBeenCalledWith(1, 2, 3);
    expect(getLatestRenderPassMs()).not.toBeNull();
  });

  it("tracks how many RenderPass.render() calls happened inside one composer.render()", () => {
    (RenderPass.prototype as any).render = () => {}; // stub before install — see the test above
    installRenderPassTrace();
    const composer = {
      render() {
        (RenderPass.prototype as any).render();
        (RenderPass.prototype as any).render();
      },
    };
    installComposerTrace(composer);
    composer.render();
    expect(getPassesInLastComposerFrame()).toBe(2);
  });

  it("median reports null with no samples and a real value once samples exist", () => {
    expect(getMedianComposerMs()).toBeNull();
    expect(getMedianRenderPassMs()).toBeNull();
    const composer = { render: () => {} };
    installComposerTrace(composer);
    composer.render();
    composer.render();
    expect(getMedianComposerMs()).not.toBeNull();
  });

  it("getLatestComposerMs / getLatestRenderPassMs are null before any trace is installed", () => {
    expect(getLatestComposerMs()).toBeNull();
    expect(getLatestRenderPassMs()).toBeNull();
  });
});
