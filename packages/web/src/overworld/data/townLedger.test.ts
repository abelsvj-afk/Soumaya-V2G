import { describe, it, expect, beforeEach } from "vitest";
import {
  creditHour,
  hoursWorked,
  revenueForPriceCents,
  spendFromTreasury,
  townTreasuryEarnedCents,
  treasuryBalanceCents,
  wagesEarnedCents,
  workedPlaceIds,
} from "./townLedger.js";

describe("townLedger (cosmetic only — never real finance/Fuel)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("creditHour / hoursWorked / wagesEarnedCents", () => {
    it("starts every building at zero hours and zero wages", () => {
      expect(hoursWorked("space-1", "bank")).toBe(0);
      expect(wagesEarnedCents("space-1", "bank")).toBe(0);
    });

    it("accumulates real hours one at a time, never invented in bulk", () => {
      creditHour("space-1", "bank");
      creditHour("space-1", "bank");
      creditHour("space-1", "bank");
      expect(hoursWorked("space-1", "bank")).toBe(3);
      expect(wagesEarnedCents("space-1", "bank")).toBeGreaterThan(0);
    });

    it("keeps different buildings and different spaces fully isolated", () => {
      creditHour("space-1", "bank");
      expect(hoursWorked("space-1", "library")).toBe(0);
      expect(hoursWorked("space-2", "bank")).toBe(0);
    });
  });

  describe("workedPlaceIds", () => {
    it("lists only buildings that have actually earned an hour", () => {
      expect(workedPlaceIds("space-1")).toEqual([]);
      creditHour("space-1", "library");
      creditHour("space-1", "bank");
      expect(workedPlaceIds("space-1")).toEqual(["bank", "library"]);
    });
  });

  describe("simcity-economy-construction.md — revenue gauged by real pricing, not a flat wage", () => {
    it("revenueForPriceCents is a real cut of the specific price, never a flat amount", () => {
      expect(revenueForPriceCents(400)).toBe(200); // 50% of a $4.00 good
      expect(revenueForPriceCents(1000)).toBe(500); // 50% of a $10.00 good — scales, doesn't cap
    });

    it("revenueForPriceCents floors at the old flat wage so a cheap sale never earns less than before", () => {
      expect(revenueForPriceCents(10)).toBe(25); // 50% of 10c is 5c, floored up to the flat 25c baseline
    });

    it("creditHour's optional wageCents override credits the real gauged amount, not the flat default", () => {
      creditHour("space-1", "market", revenueForPriceCents(400)); // a $4.00 sale
      expect(wagesEarnedCents("space-1", "market")).toBe(200);
      expect(hoursWorked("space-1", "market")).toBe(1); // still one interaction, unchanged contract
    });

    it("a civic building with no override still earns the flat baseline, byte-identical to before", () => {
      creditHour("space-1", "bank");
      expect(wagesEarnedCents("space-1", "bank")).toBe(25);
    });
  });

  describe("treasury (Town Ledger's real mechanical effect for the Market)", () => {
    it("the treasury is the real sum of every building's real wages", () => {
      creditHour("space-1", "bank");
      creditHour("space-1", "library");
      creditHour("space-1", "library");
      const expected = wagesEarnedCents("space-1", "bank") + wagesEarnedCents("space-1", "library");
      expect(townTreasuryEarnedCents("space-1")).toBe(expected);
      expect(treasuryBalanceCents("space-1")).toBe(expected);
    });

    it("refuses a purchase larger than the real balance and changes nothing", () => {
      creditHour("space-1", "bank");
      const balanceBefore = treasuryBalanceCents("space-1");
      const ok = spendFromTreasury("space-1", balanceBefore + 1);
      expect(ok).toBe(false);
      expect(treasuryBalanceCents("space-1")).toBe(balanceBefore);
    });

    it("spends real earned wages and reduces the balance by exactly that much", () => {
      creditHour("space-1", "bank");
      creditHour("space-1", "bank");
      creditHour("space-1", "bank");
      creditHour("space-1", "bank");
      const balanceBefore = treasuryBalanceCents("space-1");
      const ok = spendFromTreasury("space-1", 25);
      expect(ok).toBe(true);
      expect(treasuryBalanceCents("space-1")).toBe(balanceBefore - 25);
    });

    it("the treasury can never go negative even after spending everything", () => {
      creditHour("space-1", "bank");
      const full = treasuryBalanceCents("space-1");
      expect(spendFromTreasury("space-1", full)).toBe(true);
      expect(treasuryBalanceCents("space-1")).toBe(0);
    });

    it("refuses a zero or negative spend", () => {
      creditHour("space-1", "bank");
      expect(spendFromTreasury("space-1", 0)).toBe(false);
      expect(spendFromTreasury("space-1", -10)).toBe(false);
    });
  });
});
