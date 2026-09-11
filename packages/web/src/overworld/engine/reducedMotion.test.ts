import { describe, it, expect, afterEach } from "vitest";
import { prefersReducedMotion } from "./reducedMotion.js";

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

describe("prefersReducedMotion", () => {
  afterEach(() => {
    stubMatchMedia(false);
  });

  it("returns true when the OS/browser signals a reduced-motion preference", () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it("returns false otherwise", () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});
