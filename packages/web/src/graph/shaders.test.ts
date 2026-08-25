import { describe, it, expect } from "vitest";
import { makeStarMaterial, makePlanetMaterial } from "./shaders.js";

/**
 * Pins the Performance Program Stage 4 shader diet: fbm's octave count (the biggest
 * per-pixel cost in both materials — each octave is a full vnoise() call) must scale
 * DOWN with tier, and role must stay differentiated (a star reads at a glance and keeps
 * one more octave than a planet at every tier). GLSL `for` loop bounds are compile-time
 * constants, so the octave count is baked into the shader source string rather than
 * passed as a uniform — these tests read it back out of that string.
 */
function octaveCount(fragmentShader: string): number {
  const m = fragmentShader.match(/for\(int i=0;i<(\d+);/);
  if (!m) throw new Error("fbm loop not found in fragment shader");
  return Number(m[1]);
}

describe("shaders — Stage 4 octave scaling", () => {
  it("star octaves descend performance < balanced < quality, defaulting to quality", () => {
    expect(octaveCount(makeStarMaterial("#ffaa00", "performance").fragmentShader)).toBe(3);
    expect(octaveCount(makeStarMaterial("#ffaa00", "balanced").fragmentShader)).toBe(4);
    expect(octaveCount(makeStarMaterial("#ffaa00", "quality").fragmentShader)).toBe(5);
    expect(octaveCount(makeStarMaterial("#ffaa00").fragmentShader)).toBe(5);
  });

  it("planet octaves descend performance < balanced < quality, defaulting to quality", () => {
    expect(octaveCount(makePlanetMaterial("#3a7", "performance").fragmentShader)).toBe(2);
    expect(octaveCount(makePlanetMaterial("#3a7", "balanced").fragmentShader)).toBe(3);
    expect(octaveCount(makePlanetMaterial("#3a7", "quality").fragmentShader)).toBe(4);
    expect(octaveCount(makePlanetMaterial("#3a7").fragmentShader)).toBe(4);
  });

  it("star always keeps one more octave than planet at the same tier", () => {
    for (const tier of ["performance", "balanced", "quality"] as const) {
      const starOct = octaveCount(makeStarMaterial("#ffaa00", tier).fragmentShader);
      const planetOct = octaveCount(makePlanetMaterial("#3a7", tier).fragmentShader);
      expect(starOct).toBe(planetOct + 1);
    }
  });

  it("planet material trades precision down to mediump; star keeps the renderer default", () => {
    expect(makePlanetMaterial("#3a7").precision).toBe("mediump");
    expect(makeStarMaterial("#ffaa00").precision).toBeNull();
  });
});
