import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { fillPct, goalState, deployableCents, reconciliationStatus, getWealthSummary } from "../finance/wealth.js";
import { getBudgetSummary } from "../finance/summary.js";
import { FinAccountRepo } from "../repositories/finAccount.repo.js";
import { FinBucketRepo } from "../repositories/finBucket.repo.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { FinAllocationRepo } from "../repositories/finAllocation.repo.js";
import type { BudgetSummary } from "@brain/shared";

function budget(safeToSpendCents: number): BudgetSummary {
  return {
    balanceCents: 0, bufferCents: 0, reservedCents: 0, reserved: [], safeToSpendCents,
    shortfallCents: 0, weekEarnedCents: 0, nextIncomeDate: "2026-01-01", avgWeeklyIncomeCents: 0,
  };
}

describe("fillPct — pure", () => {
  it("is null for an open-ended goal (no target)", () => {
    expect(fillPct(50000, null)).toBeNull();
    expect(fillPct(50000, undefined)).toBeNull();
  });
  it("computes a fraction for a targeted goal", () => {
    expect(fillPct(25000, 100000)).toBe(0.25);
  });
  it("clamps at 1 even if somehow over-funded", () => {
    expect(fillPct(150000, 100000)).toBe(1);
  });
  it("never divides by a zero or negative target", () => {
    expect(fillPct(5000, 0)).toBeNull();
    expect(fillPct(5000, -100)).toBeNull();
  });
});

describe("goalState — pure", () => {
  it("open-ended goals are always goal_filling, never goal_reached", () => {
    expect(goalState(10_000_000, null)).toBe("goal_filling");
  });
  it("flips to goal_reached exactly at 100% of target", () => {
    expect(goalState(99999, 100000)).toBe("goal_filling");
    expect(goalState(100000, 100000)).toBe("goal_reached");
  });
});

describe("deployableCents / reconciliationStatus — pure", () => {
  it("subtracts allocated from safe-to-spend", () => {
    expect(deployableCents(150000, 100000)).toBe(50000);
  });
  it("goes negative when allocations exceed safe-to-spend, and is flagged over_committed", () => {
    const d = deployableCents(70000, 100000);
    expect(d).toBe(-30000);
    expect(reconciliationStatus(d)).toBe("over_committed");
  });
  it("is 'ok' at exactly zero deployable", () => {
    expect(reconciliationStatus(0)).toBe("ok");
  });
});

describe("getWealthSummary — composition against a real (in-memory) DB", () => {
  let handle: DbHandle;
  beforeEach(() => { handle = createDb(":memory:"); });
  afterEach(() => { handle.sqlite.close(); });

  it("assembles buckets, goals with computed totals/fillPct, and space-wide allocatedCents/deployable", () => {
    const buckets = new FinBucketRepo(handle, "s1");
    const goals = new FinGoalRepo(handle, "s1");
    const allocations = new FinAllocationRepo(handle, "s1");

    const trucking = buckets.create({ name: "Trucking" });
    const g1 = goals.create({ bucketId: trucking.id, name: "First Truck", targetCents: 100000 });
    const g2 = goals.create({ bucketId: trucking.id, name: "General investing" }); // open-ended
    allocations.create({ goalId: g1.id, amountCents: 30000 });
    allocations.create({ goalId: g2.id, amountCents: 5000 });

    const summary = getWealthSummary(handle, "s1", budget(50000));
    expect(summary.buckets).toHaveLength(1);
    expect(summary.goals).toHaveLength(2);
    const g1out = summary.goals.find((g) => g.id === g1.id)!;
    expect(g1out.totalCents).toBe(30000);
    expect(g1out.fillPct).toBe(0.3);
    expect(g1out.state).toBe("goal_filling");
    const g2out = summary.goals.find((g) => g.id === g2.id)!;
    expect(g2out.fillPct).toBeNull();
    expect(summary.allocatedCents).toBe(35000);
    expect(summary.deployableCents).toBe(15000);
    expect(summary.reconciliation).toBe("ok");
  });

  it("flags over_committed when allocations exceed the given safe-to-spend", () => {
    const buckets = new FinBucketRepo(handle, "s1");
    const goals = new FinGoalRepo(handle, "s1");
    const allocations = new FinAllocationRepo(handle, "s1");
    const b = buckets.create({ name: "Emergency" });
    const g = goals.create({ bucketId: b.id, name: "Emergency Fund", targetCents: 1_000_000 });
    allocations.create({ goalId: g.id, amountCents: 100000 });

    const summary = getWealthSummary(handle, "s1", budget(70000));
    expect(summary.deployableCents).toBe(-30000);
    expect(summary.reconciliation).toBe("over_committed");
  });

  it("excludes archived goals and buckets from the summary", () => {
    const buckets = new FinBucketRepo(handle, "s1");
    const goals = new FinGoalRepo(handle, "s1");
    const allocations = new FinAllocationRepo(handle, "s1");
    const b = buckets.create({ name: "Old bucket" });
    const g = goals.create({ bucketId: b.id, name: "Old goal", targetCents: 1000 });
    allocations.create({ goalId: g.id, amountCents: 500 });
    goals.archive(g.id);
    buckets.archive(b.id);

    const summary = getWealthSummary(handle, "s1", budget(0));
    expect(summary.buckets).toHaveLength(0);
    expect(summary.goals).toHaveLength(0);
    expect(summary.allocatedCents).toBe(0);
  });

  it("never leaks another space's buckets/goals/allocations into the summary", () => {
    const buckets = new FinBucketRepo(handle, "alice");
    const goals = new FinGoalRepo(handle, "alice");
    const allocations = new FinAllocationRepo(handle, "alice");
    const b = buckets.create({ name: "Trucking" });
    const g = goals.create({ bucketId: b.id, name: "First Truck", targetCents: 100000 });
    allocations.create({ goalId: g.id, amountCents: 40000 });

    const bobSummary = getWealthSummary(handle, "bob", budget(50000));
    expect(bobSummary.buckets).toHaveLength(0);
    expect(bobSummary.goals).toHaveLength(0);
    expect(bobSummary.allocatedCents).toBe(0);
    expect(bobSummary.deployableCents).toBe(50000);
  });
});

describe("AC#3 regression — Wealth's existence never changes BudgetSummary", () => {
  let handle: DbHandle;
  beforeEach(() => { handle = createDb(":memory:"); });
  afterEach(() => { handle.sqlite.close(); });

  it("computeBudget()'s output (via getBudgetSummary) is byte-for-byte identical with and without Wealth data present", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    new FinAccountRepo(handle, "s1").setBalance(200000);
    const before = getBudgetSummary(handle, "s1", now);

    // Add buckets, goals, and allocations — Money must not notice or react.
    const buckets = new FinBucketRepo(handle, "s1");
    const goals = new FinGoalRepo(handle, "s1");
    const allocations = new FinAllocationRepo(handle, "s1");
    const b = buckets.create({ name: "Trucking" });
    const g = goals.create({ bucketId: b.id, name: "First Truck", targetCents: 1_500_000 });
    allocations.create({ goalId: g.id, amountCents: 100000 });

    const after = getBudgetSummary(handle, "s1", now);
    expect(after).toEqual(before);
  });
});
