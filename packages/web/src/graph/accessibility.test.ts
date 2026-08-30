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

  it("mirrors the effective state onto <html> so CSS can see the in-app override", () => {
    // Regression: the Settings toggle only wrote localStorage, while every CSS
    // animation keyed off the OS media query — so asking for calm in-app did nothing
    // to the DOM. The attribute is what index.css's second reduced-motion reset reads.
    const root = document.documentElement;
    setReducedMotionOverride(true);
    expect(root.getAttribute("data-reduced-motion")).toBe("1");

    setReducedMotionOverride(false);
    expect(root.hasAttribute("data-reduced-motion")).toBe(false);

    setReducedMotionOverride(null); // back to following the OS (false under happy-dom)
    expect(root.hasAttribute("data-reduced-motion")).toBe(false);
  });

  it("keeps sound in step with the same reduced-motion signal", async () => {
    const { sfxEnabled } = await import("./sfx.js");
    localStorage.removeItem("brain.sfx"); // no explicit sound preference → follow a11y
    setReducedMotionOverride(true);
    expect(sfxEnabled()).toBe(false);
    setReducedMotionOverride(false);
    expect(sfxEnabled()).toBe(true);
  });
});
