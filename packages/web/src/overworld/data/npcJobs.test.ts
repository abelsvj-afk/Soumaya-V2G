import { describe, it, expect, beforeEach } from "vitest";
import { hoursWorked } from "./townLedger.js";
import { daysSinceWorked } from "./buildingNeglect.js";
import { recordBuildingWork } from "./npcJobs.js";

describe("npcJobs — recordBuildingWork (the one real-interaction call site)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("credits an hour AND resets the neglect clock together, from a single real call", () => {
    const now = 10_000_000;
    recordBuildingWork("space-1", "bank", now);
    expect(hoursWorked("space-1", "bank")).toBe(1);
    expect(daysSinceWorked("space-1", "bank", now)).toBe(0);
  });

  it("never affects any other building", () => {
    // Task #128 — an un-worked building no longer reports Infinity; it measures from the town's
    // own founding. Age the town to the epoch so "untouched" is unambiguously a long time.
    localStorage.setItem("brain.townFoundedAt.space-1", "0");
    recordBuildingWork("space-1", "bank");
    expect(hoursWorked("space-1", "library")).toBe(0);
    expect(daysSinceWorked("space-1", "library")).toBeGreaterThan(1000);
  });

  it("accumulates across repeated real interactions", () => {
    recordBuildingWork("space-1", "library");
    recordBuildingWork("space-1", "library");
    expect(hoursWorked("space-1", "library")).toBe(2);
  });
});
