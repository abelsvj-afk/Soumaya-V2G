import { describe, it, expect } from "vitest";
import { visionRequirementCents } from "@brain/shared";

/**
 * Life Vision (docs/specs/life-vision.md, C2.1 §2-locked): the shared, deterministic
 * financial-requirement calculation. Pure — no DB, no server context — tested here
 * alongside the rest of this repo's shared-pure-function coverage (celestial.test.ts).
 */
describe("visionRequirementCents", () => {
  it("sums target_cents across active, targeted goals", () => {
    const r = visionRequirementCents([
      { archived: false, targetCents: 30_000 },
      { archived: false, targetCents: 20_000 },
    ]);
    expect(r.totalCents).toBe(50_000);
    expect(r.countedGoals).toBe(2);
    expect(r.openEndedGoals).toBe(0);
    expect(r.hasLinkedGoals).toBe(true);
  });

  it("excludes archived goals from the sum", () => {
    const r = visionRequirementCents([
      { archived: false, targetCents: 30_000 },
      { archived: true, targetCents: 100_000_000 },
    ]);
    expect(r.totalCents).toBe(30_000);
    expect(r.countedGoals).toBe(1);
  });

  it("excludes a NULL target from the sum but counts it as open-ended", () => {
    const r = visionRequirementCents([
      { archived: false, targetCents: 30_000 },
      { archived: false, targetCents: null },
    ]);
    expect(r.totalCents).toBe(30_000);
    expect(r.countedGoals).toBe(1);
    expect(r.openEndedGoals).toBe(1);
  });

  it("includes a zero target as a real, counted value (distinct from NULL)", () => {
    const r = visionRequirementCents([{ archived: false, targetCents: 0 }]);
    expect(r.totalCents).toBe(0);
    expect(r.countedGoals).toBe(1);
    expect(r.openEndedGoals).toBe(0);
    expect(r.hasLinkedGoals).toBe(true);
  });

  it("reports hasLinkedGoals: false for an empty list — distinct from a real $0 total", () => {
    const r = visionRequirementCents([]);
    expect(r.totalCents).toBe(0);
    expect(r.hasLinkedGoals).toBe(false);
  });

  it("is a pure function: identical input always produces identical output", () => {
    const goals = [{ archived: false, targetCents: 5_000 }, { archived: false, targetCents: null }];
    expect(visionRequirementCents(goals)).toEqual(visionRequirementCents(goals));
  });
});
