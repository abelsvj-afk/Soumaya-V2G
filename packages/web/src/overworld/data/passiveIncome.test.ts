import { describe, it, expect, beforeEach } from "vitest";
import { collectPassiveIncome } from "./passiveIncome.js";
import { HOME_TYPES, armHomeType, placeArmedHome } from "./housing.js";
import { BUSINESS_TYPES, armBusinessType, placeArmedBusiness } from "./business.js";
import { armZoneType, zoneTileAt } from "./zoning.js";
import { creditHour, hoursWorked, treasuryBalanceCents, wagesEarnedCents, workedPlaceIds } from "./townLedger.js";

const SPACE = "test-space";
const MS_PER_DAY = 86_400_000;

beforeEach(() => localStorage.clear());

function fundTreasury(cents: number): void {
  const hours = Math.ceil(cents / 25); // WAGE_PER_HOUR_CENTS is 25 (townLedger.ts)
  for (let i = 0; i < hours; i++) creditHour(SPACE, "bank");
}

function zoneResidentialRect(x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      armZoneType(SPACE, "residential");
      zoneTileAt(SPACE, x, y);
    }
  }
}

describe("passiveIncome — real rent accrual from built structures (wave3-economy-depth.md decision #1)", () => {
  it("accrues zero income right after placement — no real time has elapsed yet", () => {
    zoneResidentialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armHomeType(SPACE, "cottage");
    const home = placeArmedHome(SPACE, 2, 10, 0)!; // built "long ago" so it's move-in ready
    const balanceBefore = treasuryBalanceCents(SPACE);
    collectPassiveIncome(SPACE, 0); // "now" is the same instant as builtAt — zero elapsed
    expect(treasuryBalanceCents(SPACE)).toBe(balanceBefore);
  });

  it("task #125 — a representative structure visibly earns a real whole cent within single-digit real minutes, not real hours/days", () => {
    zoneResidentialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armHomeType(SPACE, "cottage"); // 300c, the town's own cheapest (slowest-earning) home type
    const builtAt = 0;
    placeArmedHome(SPACE, 2, 10, builtAt)!;
    const balanceBefore = treasuryBalanceCents(SPACE);
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    collectPassiveIncome(SPACE, builtAt + FIVE_MINUTES_MS);
    expect(treasuryBalanceCents(SPACE)).toBeGreaterThan(balanceBefore);
  });

  it("accrues real rent proportional to elapsed real time and the structure's own real price", () => {
    zoneResidentialRect(2, 10, 9, 17);
    fundTreasury(2000);
    const cottage = HOME_TYPES.find((t) => t.id === "cottage")!; // $3.00 = 300c
    armHomeType(SPACE, "cottage");
    const builtAt = 0;
    const home = placeArmedHome(SPACE, 2, 10, builtAt)!;
    const balanceBefore = treasuryBalanceCents(SPACE);
    const oneDayLater = builtAt + MS_PER_DAY;
    collectPassiveIncome(SPACE, oneDayLater);
    // 120% of $3.00 = 360c for one real day elapsed (no sidewalk bonus here) — task #125's
    // retuned rate (up from the original 10%, which took real hours to earn a single cent).
    expect(treasuryBalanceCents(SPACE)).toBe(balanceBefore + Math.floor(cottage.priceCents * 1.2));
  });

  it("never counts as a real interaction — hoursWorked/workedPlaceIds stay untouched by passive accrual", () => {
    zoneResidentialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armHomeType(SPACE, "cottage");
    const home = placeArmedHome(SPACE, 2, 10, 0)!;
    collectPassiveIncome(SPACE, 5 * MS_PER_DAY);
    expect(hoursWorked(SPACE, home.id)).toBe(0);
    expect(workedPlaceIds(SPACE)).not.toContain(home.id);
  });

  it("caps accrual at 1 real day (task #125, down from 3) — never rewards leaving a structure untouched indefinitely", () => {
    zoneResidentialRect(2, 10, 9, 17);
    fundTreasury(2000);
    const cottage = HOME_TYPES.find((t) => t.id === "cottage")!;
    armHomeType(SPACE, "cottage");
    const home = placeArmedHome(SPACE, 2, 10, 0)!;
    const balanceBefore = treasuryBalanceCents(SPACE);
    collectPassiveIncome(SPACE, 30 * MS_PER_DAY); // 30 real days later, never collected
    const cappedGain = treasuryBalanceCents(SPACE) - balanceBefore;
    const oneDayGain = Math.floor(cottage.priceCents * 1.2);
    expect(cappedGain).toBe(oneDayGain);
  });

  it("a home still under construction accrues nothing", () => {
    zoneResidentialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armHomeType(SPACE, "cottage");
    const builtAt = Date.now(); // real "just placed" clock — still under construction
    const home = placeArmedHome(SPACE, 2, 10, builtAt)!;
    const balanceBefore = treasuryBalanceCents(SPACE);
    collectPassiveIncome(SPACE, builtAt + 1000); // 1 real second later — still well inside CONSTRUCTION_MS (90s)
    expect(treasuryBalanceCents(SPACE)).toBe(balanceBefore);
  });

  it("a real business accrues too, gauged by its own real price", () => {
    for (let y = 10; y <= 17; y++) {
      for (let x = 2; x <= 9; x++) {
        armZoneType(SPACE, "commercial");
        zoneTileAt(SPACE, x, y);
      }
    }
    fundTreasury(2000);
    const bakery = BUSINESS_TYPES.find((t) => t.id === "bakery")!; // $4.00
    armBusinessType(SPACE, "bakery");
    const builtAt = 0;
    const business = placeArmedBusiness(SPACE, 2, 10, builtAt)!;
    const balanceBefore = treasuryBalanceCents(SPACE);
    collectPassiveIncome(SPACE, builtAt + MS_PER_DAY);
    expect(treasuryBalanceCents(SPACE)).toBe(balanceBefore + Math.floor(bakery.priceCents * 1.2));
  });

  it("a sidewalk-adjacent structure earns 1.5x the base rate", () => {
    zoneResidentialRect(2, 10, 9, 17);
    fundTreasury(2000);
    const cottage = HOME_TYPES.find((t) => t.id === "cottage")!;
    armHomeType(SPACE, "cottage");
    const builtAt = 0;
    const home = placeArmedHome(SPACE, 2, 10, builtAt)!; // 2x2 at (2,10)-(3,11)
    armZoneType(SPACE, "sidewalk");
    zoneTileAt(SPACE, 2, 9); // directly above the footprint — real sidewalk adjacency
    const balanceBefore = treasuryBalanceCents(SPACE);
    collectPassiveIncome(SPACE, builtAt + MS_PER_DAY);
    const boostedGain = treasuryBalanceCents(SPACE) - balanceBefore;
    expect(boostedGain).toBe(Math.floor(cottage.priceCents * 1.2 * 1.5));
  });

  it("doesn't lose sub-cent progress to frequent refreshes — many small calls total close to one big one", () => {
    // Step size (60s) is deliberately smaller than what it takes to earn a single whole cent
    // (4 real minutes at this cottage's real 360c/day rate, task #125's retuned pacing) — most
    // individual calls credit nothing, proving unpaid fractional time isn't discarded when a
    // call happens to earn 0 cents. Many separate floor()s vs. one big floor() can differ by a
    // cent or two from rounding alone — the real guarantee under test is "roughly the same
    // total," not bit-identical.
    const STEP_MS = 60_000;
    const CALLS = 100;
    const TOTAL_MS = STEP_MS * CALLS;

    zoneResidentialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armHomeType(SPACE, "cottage");
    const builtAt = 0;
    placeArmedHome(SPACE, 2, 10, builtAt)!;
    for (let i = 1; i <= CALLS; i++) collectPassiveIncome(SPACE, builtAt + i * STEP_MS);
    const balanceAfterManySmallCalls = treasuryBalanceCents(SPACE);
    expect(balanceAfterManySmallCalls).toBeGreaterThan(0); // real progress DID accumulate

    // A single call covering the exact same total elapsed time should credit close to the same
    // amount — if fractional progress were being discarded on every zero-cent call, this would
    // be dramatically lower instead of within a cent or two.
    localStorage.clear();
    zoneResidentialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armHomeType(SPACE, "cottage");
    placeArmedHome(SPACE, 2, 10, builtAt);
    collectPassiveIncome(SPACE, builtAt + TOTAL_MS);
    expect(Math.abs(treasuryBalanceCents(SPACE) - balanceAfterManySmallCalls)).toBeLessThanOrEqual(2);
  });

  it("a fresh town with nothing built is a no-op, not a crash", () => {
    expect(() => collectPassiveIncome(SPACE)).not.toThrow();
    expect(treasuryBalanceCents(SPACE)).toBe(0);
  });
});
