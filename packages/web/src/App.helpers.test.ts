import { describe, it, expect } from "vitest";
import { focusItemStyle, songDotStyle, getFigurineIcon, getFigurineLabel } from "./App.helpers.js";

/** Locks the pure presentational helpers extracted from App.tsx (D4), so a future
 *  refactor that touches them fails loudly instead of silently. */
describe("App.helpers", () => {
  it("labels + icons every known figurine, and falls back for unknowns", () => {
    expect(getFigurineLabel("blackhole")).toBe("The Singularity");
    expect(getFigurineIcon("station")).toBe("🌐");
    expect(getFigurineLabel("station")).toBe("Waystation Figurine");
    // Unknown → label echoes the type, icon uses the stone default.
    expect(getFigurineLabel("mystery")).toBe("mystery");
    expect(getFigurineIcon("mystery")).toBe("🗿");
  });

  it("stacks focus-cluster items upward when open, collapsed when closed", () => {
    const closed = focusItemStyle(2, false);
    const open = focusItemStyle(2, true);
    expect(closed).toBeTruthy();
    expect(open).toBeTruthy();
    // Opening changes the style (it animates outward) — exact geometry may evolve, but
    // the two states must differ.
    expect(JSON.stringify(open)).not.toBe(JSON.stringify(closed));
  });

  it("spreads song dots around the ring (each index a distinct position)", () => {
    const a = songDotStyle(0, 3);
    const b = songDotStyle(1, 3);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});
