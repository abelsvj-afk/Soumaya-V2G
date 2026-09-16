import { describe, it, expect, beforeEach } from "vitest";
import { collectPassiveResidentIncome } from "./passiveResidentIncome.js";
import { armHomeType, placeArmedHome } from "./housing.js";
import { armZoneType, zoneTileAt } from "./zoning.js";
import { creditHour, treasuryBalanceCents } from "./townLedger.js";
import { allResidentNpcIds } from "./residents.js";

const SPACE = "test-space";
const HOUR_MS = 3_600_000;

beforeEach(() => localStorage.clear());

function fundTreasury(cents: number): void {
  const hours = Math.ceil(cents / 25); // WAGE_PER_HOUR_CENTS is 25 (townLedger.ts)
  for (let i = 0; i < hours; i++) creditHour(SPACE, "bank");
}

/** A real, confirmed-open 16x10 rectangle (mirrors housing.test.ts's own population-growth
 *  fixture exactly) — big enough to build past the fixed 24-society-NPC floor, which a smaller
 *  rect can't fit. */
function zoneLargeResidentialRect(): void {
  for (let y = 6; y <= 15; y++) {
    for (let x = 0; x <= 15; x++) {
      armZoneType(SPACE, "residential");
      zoneTileAt(SPACE, x, y);
    }
  }
}

/** 7 real Apartment Blocks (capacity 4 each) = 28 real capacity — past the 24-society floor by
 *  exactly 4, matching this town's own real 4-Resident roster, so every Resident is genuinely
 *  housed by the time this returns (same fixture housing.test.ts's own population-growth suite
 *  already proved against the real `isPlacementBlocked`). */
function houseEverySocietyNpcAndEveryResident(): void {
  zoneLargeResidentialRect();
  for (let i = 0; i < 7; i++) {
    fundTreasury(2000);
    armHomeType(SPACE, "apartment");
    const x0 = (i % 4) * 4;
    const y0 = 6 + Math.floor(i / 4) * 3;
    placeArmedHome(SPACE, x0, y0, 0);
  }
}

describe("passiveResidentIncome — population-growth passive income (task #125)", () => {
  it("credits nothing on the very first call — establishes a baseline, never a retroactive lump sum", () => {
    houseEverySocietyNpcAndEveryResident();
    const before = treasuryBalanceCents(SPACE);
    collectPassiveResidentIncome(SPACE, 0);
    expect(treasuryBalanceCents(SPACE)).toBe(before);
  });

  it("credits real cents for real elapsed time once a Resident is genuinely housed and a baseline already exists", () => {
    houseEverySocietyNpcAndEveryResident();
    collectPassiveResidentIncome(SPACE, 0); // baseline call — credits nothing
    const before = treasuryBalanceCents(SPACE);
    collectPassiveResidentIncome(SPACE, 5 * HOUR_MS);
    expect(treasuryBalanceCents(SPACE)).toBeGreaterThan(before);
  });

  it("credits exactly 1 cent per real Resident per real hour housed, summed across the whole real roster", () => {
    houseEverySocietyNpcAndEveryResident();
    collectPassiveResidentIncome(SPACE, 0);
    const before = treasuryBalanceCents(SPACE);
    const elapsedHours = 5;
    collectPassiveResidentIncome(SPACE, elapsedHours * HOUR_MS);
    const expected = allResidentNpcIds().length * elapsedHours; // 1 cent/resident/hour
    expect(treasuryBalanceCents(SPACE) - before).toBe(expected);
  });

  it("credits nothing while built housing capacity stays at or under the 24-society floor — no Resident is housed yet", () => {
    // Deliberately no homes built at all — assignResidents finds zero Residents housed.
    collectPassiveResidentIncome(SPACE, 0); // baseline
    const before = treasuryBalanceCents(SPACE);
    collectPassiveResidentIncome(SPACE, 500 * HOUR_MS);
    expect(treasuryBalanceCents(SPACE)).toBe(before);
  });

  it("an unhoused stretch is never banked for later — housing a Resident doesn't pay out the skipped time retroactively", () => {
    collectPassiveResidentIncome(SPACE, 0); // baseline, unhoused
    collectPassiveResidentIncome(SPACE, 500 * HOUR_MS); // still unhoused — credits nothing, but the stamp still advances
    houseEverySocietyNpcAndEveryResident();
    const balanceBeforeHousing = treasuryBalanceCents(SPACE);
    collectPassiveResidentIncome(SPACE, 500 * HOUR_MS + 1); // essentially zero new elapsed time since housing
    expect(treasuryBalanceCents(SPACE)).toBe(balanceBeforeHousing); // no retroactive payout for the 500 skipped hours
  });

  it("caps accrual at 24 real hours — never rewards leaving a fully-housed town untouched indefinitely", () => {
    houseEverySocietyNpcAndEveryResident();
    collectPassiveResidentIncome(SPACE, 0); // baseline
    const before = treasuryBalanceCents(SPACE);
    collectPassiveResidentIncome(SPACE, 30 * 24 * HOUR_MS); // 30 real days later, never collected
    const cappedGain = treasuryBalanceCents(SPACE) - before;
    expect(cappedGain).toBe(allResidentNpcIds().length * 24); // capped at 24 real hours per Resident
  });

  it("a fresh town with nothing built is a no-op, not a crash", () => {
    expect(() => collectPassiveResidentIncome(SPACE)).not.toThrow();
    expect(treasuryBalanceCents(SPACE)).toBe(0);
  });
});
