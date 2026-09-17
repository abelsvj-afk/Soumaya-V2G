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
    it("task #128 — a never-worked building in a BRAND NEW town is not yet neglected", () => {
      // This used to return Infinity (maximally neglected from the first frame), which meant a
      // new town earned zero NPC income forever until the player walked a full circuit of all 12
      // buildings — the real mechanism behind "money is not being made".
      const now = 10_000_000;
      expect(daysSinceWorked("space-new", "bank", now)).toBe(0);
      expect(isNeglected(buildingNeglect("space-new", "bank", now))).toBe(false);
    });

    it("task #128 — but a never-worked building DOES neglect as real time passes since founding", () => {
      const founded = 10_000_000;
      daysSinceWorked("space-old", "bank", founded); // first read stamps the town's founding
      const muchLater = founded + 60 * 86_400_000; // 60 real days later, still never worked
      expect(daysSinceWorked("space-old", "bank", muchLater)).toBeGreaterThan(30);
      expect(isNeglected(buildingNeglect("space-old", "bank", muchLater))).toBe(true);
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
      const founded = 0;
      const later = 50 * 86_400_000; // 50 real days after this town was founded
      daysSinceWorked("space-1", "library", founded); // first read stamps space-1's founding at 0
      markWorked("space-1", "bank", later);

      // The worked building resets to zero; its SIBLING in the same town does not borrow that
      // work event and still measures the full 50 days from space-1's own founding.
      expect(daysSinceWorked("space-1", "bank", later)).toBe(0);
      expect(daysSinceWorked("space-1", "library", later)).toBe(50);

      // A different space is fully independent — it founds itself on its own first read.
      expect(daysSinceWorked("space-2", "bank", later)).toBe(0);
    });
  });
});
