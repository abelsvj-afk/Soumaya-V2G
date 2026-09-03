import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as THREE from "three";
import type { MoneyStar } from "@brain/shared";

/**
 * Defect #2 regression (Wealth post-implementation validation gate): a Goal star's size
 * used to reuse the bill-sizing formula (size scales with raw amountCents), but a Goal's
 * amountCents is its running ALLOCATED TOTAL — routinely orders of magnitude larger than a
 * monthly bill (a $15,000 truck fund vs. a $70 phone bill) — so a well-funded goal star grew
 * unbounded, dwarfing the ring itself. Fixed to size a goal star off fillPct instead.
 *
 * happy-dom has no real 2D canvas context, which starTexture()/glyphTexture() need — stub
 * just the handful of methods they call (scoped to this file, restored after), same pattern
 * already used by nodeObject.test.ts/deepSpace.test.ts. Unlike those two, moneySky.ts calls
 * starTexture() eagerly at MODULE SCOPE (`const STAR_TEX = starTexture()`), so a static
 * top-level import would resolve before this file's beforeAll ever runs (import statements
 * are hoisted ahead of everything else) — the module must be imported dynamically, after the
 * stub is installed.
 */
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
let makeMoneySky: (stars: MoneyStar[]) => THREE.Group;
beforeAll(async () => {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as any).getContext = function () {
    const grad = { addColorStop: () => {} };
    return {
      font: "",
      textAlign: "",
      textBaseline: "",
      shadowColor: "",
      shadowBlur: 0,
      set fillStyle(_v: unknown) {},
      createRadialGradient: () => grad,
      fillRect: () => {},
      fillText: () => {},
    };
  };
  ({ makeMoneySky } = await import("./moneySky.js"));
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

function billStar(amountCents: number, over: Partial<MoneyStar> = {}): MoneyStar {
  return { kind: "bill", id: 1, label: "Phone", amountCents, state: "calm", glyph: "•", intensity: 0.3, ...over };
}
function goalStar(amountCents: number, fillPct: number | null, over: Partial<MoneyStar> = {}): MoneyStar {
  return { kind: "goal", id: 1, label: "First Truck", amountCents, state: "goal_filling", glyph: "◔", intensity: 0.5, fillPct: fillPct ?? undefined, ...over };
}

function starScale(group: THREE.Group): number {
  const sprite = group.children.find((c) => c instanceof THREE.Sprite) as THREE.Sprite;
  return sprite.scale.x;
}

describe("makeMoneySky — goal star sizing (defect #2 regression)", () => {
  it("a goal star's size is bounded by fillPct, not by its raw dollar total", () => {
    // A modest $70 phone bill (7000 cents) is the baseline "normal" size.
    const billSize = starScale(makeMoneySky([billStar(7000)]));

    // A goal with a HUGE allocated total ($15,000 = 1,500,000 cents) but low fill (10%).
    const bigGoalLowFill = starScale(makeMoneySky([goalStar(1_500_000, 0.1)]));
    // A goal with the same huge total, fully funded (100%).
    const bigGoalFullFill = starScale(makeMoneySky([goalStar(1_500_000, 1)]));

    // Both goal stars must stay in a sane, bounded range regardless of the huge dollar
    // amount — nowhere near what the old (amountCents-based) formula would have produced
    // (60 + 1_500_000/100*0.05 = 810, more than half the 1400-unit ring radius).
    expect(bigGoalLowFill).toBeLessThan(120);
    expect(bigGoalFullFill).toBeLessThan(120);
    // Fill still matters — a fuller goal reads at least as large as a low-fill one.
    expect(bigGoalFullFill).toBeGreaterThanOrEqual(bigGoalLowFill);
    // And a fully-funded $15,000 goal must not dwarf a normal bill star.
    expect(bigGoalFullFill).toBeLessThan(billSize * 3);
  });

  it("an open-ended goal (no fillPct) still gets a modest, bounded size regardless of its huge total", () => {
    const size = starScale(makeMoneySky([goalStar(50_000_000, null)])); // $500,000 allocated, no target
    expect(size).toBeLessThan(120);
  });

  it("bill sizing is unchanged — still scales with its real dollar amount", () => {
    const small = starScale(makeMoneySky([billStar(1000)])); // $10
    const large = starScale(makeMoneySky([billStar(50000)])); // $500
    expect(large).toBeGreaterThan(small);
    expect(small).toBe(60 + (1000 / 100) * 0.05);
    expect(large).toBe(60 + (50000 / 100) * 0.05);
  });
});
