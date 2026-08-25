import { describe, it, expect } from "vitest";
import { resolveGraphics, type GraphicsSettings } from "./graphicsConfig.js";

/**
 * Locks `heavyScenery`'s resolution rules (Performance Program Stage 1).
 *
 * This knob was previously computed with full override logic but had ZERO consumers —
 * the Settings "Background scenery" control did nothing. Wiring it to actually gate the
 * deep-space backdrop (Graph3D.tsx) must NOT, on its own, remove scenery that was
 * already rendering on mid/low-tier phones — only an explicit override or Battery Saver
 * should turn it off. These tests pin that contract so a future change can't silently
 * regress back to "quality tier only" (the pre-fix behavior).
 */

const base = (over: Partial<GraphicsSettings>): GraphicsSettings => ({
  mode: "performance",
  bloom: false,
  starDensity: "low",
  particles: "low",
  animationQuality: "low",
  renderQuality: "low",
  batterySaver: false,
  fpsCap: 30,
  ...over,
});

describe("resolveGraphics — heavyScenery", () => {
  it("is ON by default on every explicit mode, not just quality", () => {
    for (const mode of ["performance", "balanced", "quality"] as const) {
      expect(resolveGraphics(base({ mode })).heavyScenery).toBe(true);
    }
  });

  it("Battery Saver turns it off regardless of tier", () => {
    for (const mode of ["performance", "balanced", "quality"] as const) {
      expect(resolveGraphics(base({ mode, batterySaver: true })).heavyScenery).toBe(false);
    }
  });

  it("an explicit override always wins, including over Battery Saver", () => {
    expect(resolveGraphics(base({ sceneryOverride: "off" })).heavyScenery).toBe(false);
    expect(resolveGraphics(base({ sceneryOverride: "on", batterySaver: true })).heavyScenery).toBe(true);
  });

  it("'auto' override falls back to the tier/battery-saver default", () => {
    expect(resolveGraphics(base({ sceneryOverride: "auto" })).heavyScenery).toBe(true);
    expect(resolveGraphics(base({ sceneryOverride: "auto", batterySaver: true })).heavyScenery).toBe(false);
  });
});
