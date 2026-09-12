import { describe, it, expect, beforeEach } from "vitest";
import { COOLING_ENTROPY } from "@brain/shared";
import { buildingNeglect, daysSinceWorked, isNeglected, markWorked, neglectFor } from "./buildingNeglect.js";

describe("buildingNeglect", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("neglectFor (pure math, reuses entropyFrom's real shape)", () => {
    it("is 0 right after a real work event (0 days since)", () => {
      expect(neglectFor(0)).toBe(0);
    });

    it("grows toward 1 the longer it's been since real work", () => {
      expect(neglectFor(5)).toBeGreaterThan(0);
      expect(neglectFor(30)).toBeGreaterThan(neglectFor(5));
      expect(neglectFor(1000)).toBeLessThanOrEqual(1);
    });

    it("treats a building that has never worked (Infinity) as maximally neglected", () => {
      expect(neglectFor(Infinity)).toBe(1);
    });
  });

  describe("isNeglected", () => {
    it("uses the exact same COOLING_ENTROPY threshold as the memory-dimming system", () => {
      expect(isNeglected(COOLING_ENTROPY)).toBe(true);
      expect(isNeglected(COOLING_ENTROPY - 0.01)).toBe(false);
    });
  });

  describe("markWorked / daysSinceWorked / buildingNeglect", () => {
    it("a building with no recorded work is Infinity days since / fully neglected", () => {
      expect(daysSinceWorked("space-1", "bank")).toBe(Infinity);
      expect(buildingNeglect("space-1", "bank")).toBe(1);
    });

    it("marking work resets the building to zero neglect right now", () => {
      const now = 10_000_000;
      markWorked("space-1", "bank", now);
      expect(daysSinceWorked("space-1", "bank", now)).toBe(0);
      expect(buildingNeglect("space-1", "bank", now)).toBe(0);
    });

    it("neglect grows again as real time passes since the last real work event", () => {
      const now = 10_000_000;
      markWorked("space-1", "bank", now);
      const oneWeekLater = now + 7 * 86_400_000;
      expect(daysSinceWorked("space-1", "bank", oneWeekLater)).toBeCloseTo(7, 5);
      expect(buildingNeglect("space-1", "bank", oneWeekLater)).toBeGreaterThan(0);
    });

    it("keeps every building's and every space's neglect fully isolated", () => {
      markWorked("space-1", "bank", 1000);
      expect(daysSinceWorked("space-1", "library")).toBe(Infinity);
      expect(daysSinceWorked("space-2", "bank")).toBe(Infinity);
    });
  });
});
