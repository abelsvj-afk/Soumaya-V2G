import { describe, it, expect, beforeEach } from "vitest";
import { EMOTION_COLORS, EMOTION_COLORS_CB } from "@brain/shared";
import { isColorblind, setColorblind, emotionHex, EMOTION_RGB, emotionKind } from "./theme.js";
import { prefersReducedMotion, setReducedMotionOverride, reducedMotionOverride } from "./motion.js";

beforeEach(() => {
  localStorage.clear();
});

describe("colorblind palette toggle (#3a)", () => {
  it("defaults to the standard emotion palette", () => {
    expect(isColorblind()).toBe(false);
    expect(emotionHex("positive")).toBe(EMOTION_COLORS.positive);
    expect(emotionHex("heavy")).toBe(EMOTION_COLORS.heavy);
  });

  it("swaps to the Okabe–Ito palette and updates the live RGB binding", () => {
    setColorblind(true);
    expect(isColorblind()).toBe(true);
    expect(emotionHex("neutral")).toBe(EMOTION_COLORS_CB.neutral);
    // The exported live binding the galaxy reads per-frame reflects the swap.
    const [r, g, b] = EMOTION_RGB[emotionKind(0.5)]; // positive
    const n = parseInt(EMOTION_COLORS_CB.positive.replace("#", ""), 16);
    expect([r, g, b]).toEqual([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
    setColorblind(false);
    expect(emotionHex("positive")).toBe(EMOTION_COLORS.positive);
  });
});

describe("reduced-motion signal (#3b)", () => {
  it("follows an explicit override and clears back to OS", () => {
    expect(reducedMotionOverride()).toBeNull();
    setReducedMotionOverride(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(reducedMotionOverride()).toBe(true);
    setReducedMotionOverride(false);
    expect(prefersReducedMotion()).toBe(false);
    setReducedMotionOverride(null);
    expect(reducedMotionOverride()).toBeNull();
  });
});
