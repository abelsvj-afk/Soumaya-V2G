import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isComposerBypassEnabled,
  setComposerBypassEnabled,
  applyComposerBypass,
  setComposerBypassLive,
} from "./composerBypassDiag.js";

/**
 * Composer-bypass diagnostic (render-stall investigation, 2026-09-10). Verifies:
 * (a) the persisted toggle round-trips through localStorage like the established
 * boundedLinks/lite-mode pattern, defaulting OFF; (b) the bypass replaces the
 * composer's own `.render()` with EXACTLY one `renderer.render(scene, camera)` call;
 * (c) `setComposerBypassLive` can be flipped on and back off any number of times in
 * one session (the automated in-session diagnostic harness's core requirement — no
 * reload between conditions), always restoring the EXACT original render function,
 * not just "some" restored behavior.
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

describe("composerBypassDiag — setComposerBypassLive (in-session, reload-free toggling)", () => {
  it("turning it on then off restores the EXACT original render function", () => {
    const original = vi.fn();
    const composer = { render: original };
    const renderer = { render: vi.fn() };

    setComposerBypassLive(composer, renderer, {}, {}, true);
    expect(composer.render).not.toBe(original);
    setComposerBypassLive(composer, renderer, {}, {}, false);
    expect(composer.render).toBe(original); // the real pass-iteration logic, byte-identical
  });

  it("can be flipped on/off repeatedly within one session without losing the original", () => {
    const original = vi.fn();
    const composer = { render: original };
    const renderer = { render: vi.fn() };

    for (let i = 0; i < 5; i++) {
      setComposerBypassLive(composer, renderer, {}, {}, true);
      setComposerBypassLive(composer, renderer, {}, {}, false);
    }
    expect(composer.render).toBe(original);
  });

  it("while ON, calling composer.render() calls renderer.render(scene, camera) exactly once", () => {
    const composer = { render: vi.fn() };
    const renderer = { render: vi.fn() };
    const scene = { tag: "scene" };
    const camera = { tag: "camera" };

    setComposerBypassLive(composer, renderer, scene, camera, true);
    composer.render();

    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
  });

  it("while OFF (never turned on), composer.render() is untouched", () => {
    const original = vi.fn();
    const composer = { render: original };
    const renderer = { render: vi.fn() };

    setComposerBypassLive(composer, renderer, {}, {}, false);
    expect(composer.render).toBe(original);
    composer.render();
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it("independently toggles two different composer instances", () => {
    const originalA = vi.fn();
    const originalB = vi.fn();
    const composerA = { render: originalA };
    const composerB = { render: originalB };
    const rendererA = { render: vi.fn() };
    const rendererB = { render: vi.fn() };

    setComposerBypassLive(composerA, rendererA, {}, {}, true);
    // composerB never touched — must stay exactly as it was.
    expect(composerB.render).toBe(originalB);

    setComposerBypassLive(composerA, rendererA, {}, {}, false);
    expect(composerA.render).toBe(originalA);
  });
});
