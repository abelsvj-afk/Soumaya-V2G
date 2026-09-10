import { describe, it, expect, beforeEach, vi } from "vitest";
import { isComposerBypassEnabled, setComposerBypassEnabled, applyComposerBypass } from "./composerBypassDiag.js";

/**
 * Composer-bypass diagnostic (render-stall investigation, 2026-09-10). Verifies:
 * (a) the persisted toggle round-trips through localStorage like the established
 * boundedLinks/lite-mode pattern, defaulting OFF; (b) `applyComposerBypass` replaces
 * the composer's own `.render()` with EXACTLY one `renderer.render(scene, camera)`
 * call, and is idempotent per composer instance (a WeakSet, matching perfStats.ts's
 * own `patchedRenderers` precedent) so a remount with a fresh composer still gets
 * patched.
 */

beforeEach(() => {
  localStorage.clear();
});

describe("composerBypassDiag — isComposerBypassEnabled / setComposerBypassEnabled", () => {
  it("defaults to disabled — the normal composer path — with nothing persisted", () => {
    expect(isComposerBypassEnabled()).toBe(false);
  });

  it("persists true, readable across calls", () => {
    setComposerBypassEnabled(true);
    expect(isComposerBypassEnabled()).toBe(true);
  });

  it("persists false explicitly (removes the key rather than storing a falsy string)", () => {
    setComposerBypassEnabled(true);
    setComposerBypassEnabled(false);
    expect(isComposerBypassEnabled()).toBe(false);
    expect(localStorage.getItem("galaxy.diag.composerBypass")).toBeNull();
  });
});

describe("composerBypassDiag — applyComposerBypass", () => {
  it("replaces composer.render() with a direct renderer.render(scene, camera) call", () => {
    const renderCalls: unknown[][] = [];
    const composer = { render: vi.fn() };
    const renderer = { render: (...args: unknown[]) => renderCalls.push(args) };
    const scene = { tag: "scene" };
    const camera = { tag: "camera" };

    applyComposerBypass(composer, renderer, scene, camera);
    composer.render(); // simulates three-render-objects.mjs's tick() calling this

    expect(renderCalls).toHaveLength(1); // exactly one renderer.render() call
    expect(renderCalls[0]).toEqual([scene, camera]);
  });

  it("never calls the original pass-iteration render logic once patched", () => {
    const original = vi.fn();
    const composer = { render: original };
    const renderer = { render: vi.fn() };

    applyComposerBypass(composer, renderer, {}, {});
    composer.render();

    expect(original).not.toHaveBeenCalled();
  });

  it("is idempotent per composer instance — re-applying doesn't double-wrap or change behavior", () => {
    const renderCalls: unknown[] = [];
    const composer = { render: vi.fn() };
    const renderer = { render: () => renderCalls.push("call") };

    applyComposerBypass(composer, renderer, {}, {});
    const patchedOnce = composer.render;
    applyComposerBypass(composer, renderer, {}, {}); // same composer instance again

    expect(composer.render).toBe(patchedOnce); // not re-wrapped
    composer.render();
    expect(renderCalls).toHaveLength(1); // still exactly one render() per call, not two
  });

  it("patches a DIFFERENT composer instance independently (e.g. after a remount)", () => {
    const rendererA = { render: vi.fn() };
    const rendererB = { render: vi.fn() };
    const composerA = { render: vi.fn() };
    const composerB = { render: vi.fn() };

    applyComposerBypass(composerA, rendererA, {}, {});
    applyComposerBypass(composerB, rendererB, {}, {});
    composerA.render();
    composerB.render();

    expect(rendererA.render).toHaveBeenCalledTimes(1);
    expect(rendererB.render).toHaveBeenCalledTimes(1);
  });
});
