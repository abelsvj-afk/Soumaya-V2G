import { describe, it, expect } from "vitest";
import { resolveGraphics, type GraphicsSettings } from "./graphicsConfig.js";
import type { RungSettings } from "./adaptiveController.js";

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

/**
 * Performance Program Stage 6: `detailTier` is the narrow surface the adaptive
 * controller's rung can move — it must equal the coarse `tier` unless BOTH mode is
 * "auto" AND a rung was actually supplied, and even then it must only affect
 * pixelRatio/bloom/detailTier, never starCount/particles/animation (those stay on the
 * detected/mode tier so the controller's rung ladder can't silently touch systems it
 * was never designed to touch).
 */
describe("resolveGraphics — Stage 6 adaptive rung", () => {
  const rung = (over: Partial<RungSettings> = {}): RungSettings => ({
    pixelRatioCap: 1.75,
    detailTier: "quality",
    bloom: true,
    bloomStrength: 0.35,
    heavyScenery: true,
    ...over,
  });

  it("without a rung, detailTier always equals tier (identical to pre-Stage-6 behavior)", () => {
    for (const mode of ["auto", "performance", "balanced", "quality"] as const) {
      const g = resolveGraphics(base({ mode }));
      expect(g.detailTier).toBe(g.tier);
    }
  });

  it("a rung is IGNORED outside auto mode — an explicit pick stays on its own stored fields", () => {
    // Explicit (non-auto) modes resolve from the settings object AS STORED (`eff = s`),
    // not a fresh preset lookup — `base()` fixes bloom: false regardless of mode, so the
    // rung's bloom:true must NOT leak through for any explicit mode.
    for (const mode of ["performance", "balanced", "quality"] as const) {
      const g = resolveGraphics(base({ mode }), rung());
      expect(g.detailTier).toBe(mode);
      expect(g.bloom).toBe(false);
    }
  });

  it("in auto mode, a rung overrides detailTier/bloom/bloomStrength", () => {
    const g = resolveGraphics(base({ mode: "auto" }), rung({ detailTier: "balanced", bloom: false, bloomStrength: 0 }));
    expect(g.detailTier).toBe("balanced");
    expect(g.bloom).toBe(false);
  });

  it("in auto mode, a rung's pixelRatioCap replaces the tier's cap (renderQuality still 'auto')", () => {
    // renderQuality defaults to "low" in `base()`'s performance-flavored fields, so use
    // "auto" explicitly to exercise the tierCap/rung.pixelRatioCap path.
    const g = resolveGraphics(base({ mode: "auto", renderQuality: "auto" }), rung({ pixelRatioCap: 1.75 }));
    expect(g.pixelRatio).toBeLessThanOrEqual(1.75);
  });

  it("does not let a rung touch starCount/particles/animation — those stay tier-derived", () => {
    const withoutRung = resolveGraphics(base({ mode: "auto" }));
    const withRung = resolveGraphics(base({ mode: "auto" }), rung({ detailTier: "quality" }));
    expect(withRung.starCount).toBe(withoutRung.starCount);
    expect(withRung.particleScale).toBe(withoutRung.particleScale);
    expect(withRung.animationScale).toBe(withoutRung.animationScale);
  });

  it("Battery Saver still forces bloom off even when the rung wants it on", () => {
    // (Battery Saver's own auto-mode wiring is a pre-existing, separate gap — see
    // GEMINI_CHANGES.md-adjacent notes; this test only pins the rung/battery-saver
    // INTERACTION for whichever mode actually applies batterySaver.)
    const g = resolveGraphics(base({ mode: "performance", batterySaver: true }), rung());
    expect(g.bloom).toBe(false);
  });

  it("in auto mode, a rung's heavyScenery:false (rung 0 — the device measured its way to the floor) turns it off", () => {
    const g = resolveGraphics(base({ mode: "auto" }), rung({ heavyScenery: false }));
    expect(g.heavyScenery).toBe(false);
  });

  it("in auto mode, a rung's heavyScenery:true keeps it on (every rung above 0)", () => {
    const g = resolveGraphics(base({ mode: "auto" }), rung({ heavyScenery: true }));
    expect(g.heavyScenery).toBe(true);
  });

  it("a rung's heavyScenery is ignored outside auto mode — an explicit pick keeps the tier default", () => {
    for (const mode of ["performance", "balanced", "quality"] as const) {
      const g = resolveGraphics(base({ mode }), rung({ heavyScenery: false }));
      expect(g.heavyScenery).toBe(true); // the tier default (no Battery Saver, no override)
    }
  });

  it("an explicit sceneryOverride still wins over the rung either direction", () => {
    expect(resolveGraphics(base({ mode: "auto", sceneryOverride: "on" }), rung({ heavyScenery: false })).heavyScenery).toBe(true);
    expect(resolveGraphics(base({ mode: "auto", sceneryOverride: "off" }), rung({ heavyScenery: true })).heavyScenery).toBe(false);
  });
});
