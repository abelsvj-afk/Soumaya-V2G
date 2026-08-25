import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeDeepSpace, makeBackdropBakeSources } from "./deepSpace.js";

/**
 * Pins the Performance Program Stage 3 split: `makeDeepSpace` must return ONLY the cheap
 * live dust (nothing else gets added back to the live scene graph), and
 * `makeBackdropBakeSources` must return the expensive sprite layers separately, at the
 * same counts the old combined `makeDeepSpace` used to produce — so the baked backdrop is
 * exactly as dense as the live one used to be, just delivered once instead of every frame.
 *
 * happy-dom (this project's test environment) has no real 2D canvas context, and the
 * pre-existing (unchanged by this split) nebula/galaxy texture generators use one —
 * `createRadialGradient`/`fillRect`/`fillStyle`/`globalCompositeOperation` is the entire
 * surface they touch, so a minimal local stub (scoped to this file only, restored after)
 * is enough to exercise the real object-construction code instead of skipping it.
 */
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement) {
    const grad = { addColorStop: () => {} };
    return {
      createRadialGradient: () => grad,
      fillRect: () => {},
      set fillStyle(_v: unknown) {},
      set globalCompositeOperation(_v: unknown) {},
    };
  };
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});
describe("deepSpace — Stage 3 split", () => {
  it("makeDeepSpace returns only the dust (one child: the Points cloud)", () => {
    for (const level of ["low", "medium", "high"] as const) {
      const group = makeDeepSpace(level);
      expect(group.children).toHaveLength(1);
      expect((group.children[0] as any).isPoints).toBe(true);
    }
  });

  it("makeBackdropBakeSources produces the same per-tier counts the old combined function did", () => {
    // clouds: 3/5/8, galaxies: 2/3/5 — matches the pre-split byLevel() values exactly, so
    // baking doesn't quietly thin out (or bulk up) the backdrop's density.
    const expected = { low: 3 + 2, medium: 5 + 3, high: 8 + 5 };
    for (const level of ["low", "medium", "high"] as const) {
      expect(makeBackdropBakeSources(level)).toHaveLength(expected[level]);
    }
  });

  it("bake sources are sprites (the additive, depthWrite:false quads that cause overdraw)", () => {
    for (const o of makeBackdropBakeSources("high")) {
      expect((o as any).isSprite).toBe(true);
    }
  });
});
