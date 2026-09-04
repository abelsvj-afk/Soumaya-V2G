import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { FinAccountRepo } from "../repositories/finAccount.repo.js";
import { FinBucketRepo } from "../repositories/finBucket.repo.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { FinAssetRepo } from "../repositories/finAsset.repo.js";
import { FinAssetSnapshotRepo } from "../repositories/finAssetSnapshot.repo.js";
import { compareTwoPeriods, incomeChange, netWorthChange, goalAllocationChange } from "./temporalChange.js";

/**
 * Period-over-period change detection (docs/specs/temporal-contextual-reasoning.md). The
 * central property under test throughout: insufficient history must NEVER be reported as a
 * fake "unchanged"/zero trend — it's a distinct, explicit `"insufficient_history"` status.
 */

let handle: DbHandle;
beforeEach(() => { handle = createDb(":memory:"); });
afterEach(() => handle.sqlite.close());

const NOW = new Date("2026-09-03T00:00:00Z");

describe("compareTwoPeriods", () => {
  it("reports increased/decreased/unchanged with a correctly-signed delta", () => {
    expect(compareTwoPeriods("money", "x", "X", 150, 100)).toMatchObject({ status: "compared", direction: "increased", deltaCents: 50 });
    expect(compareTwoPeriods("money", "x", "X", 50, 100)).toMatchObject({ status: "compared", direction: "decreased", deltaCents: -50 });
    expect(compareTwoPeriods("money", "x", "X", 100, 100)).toMatchObject({ status: "compared", direction: "unchanged", deltaCents: 0 });
  });
  it("percent is null (not Infinity/NaN) when the previous period was exactly zero", () => {
    const r = compareTwoPeriods("money", "x", "X", 500, 0) as any;
    expect(r.percent).toBeNull();
  });
  it("percent is computed correctly otherwise", () => {
    const r = compareTwoPeriods("money", "x", "X", 150, 100) as any;
    expect(r.percent).toBeCloseTo(50, 5);
  });
});

describe("incomeChange", () => {
  it("is insufficient_history with fewer than two populated months", () => {
    const income = new FinIncomeRepo(handle, "s1");
    income.create({ date: "2026-09-01", netCents: 1000 });
    const r = incomeChange(handle, "s1", NOW);
    expect(r.status).toBe("insufficient_history");
  });
  it("compares the last two populated months once there are two", () => {
    const income = new FinIncomeRepo(handle, "s1");
    income.create({ date: "2026-07-15", netCents: 100_000 });
    income.create({ date: "2026-08-15", netCents: 150_000 });
    const r = incomeChange(handle, "s1", NOW) as any;
    expect(r.status).toBe("compared");
    expect(r.direction).toBe("increased");
    expect(r.previousCents).toBe(100_000);
    expect(r.currentCents).toBe(150_000);
  });
});

describe("netWorthChange", () => {
  it("is insufficient_history when no asset snapshot has ever been logged", () => {
    new FinAccountRepo(handle, "s1").setBalance(50_000); // cash alone isn't real history
    const r = netWorthChange(handle, "s1", NOW);
    expect(r.status).toBe("insufficient_history");
  });
  it("compares once at least one snapshot exists", () => {
    const assets = new FinAssetRepo(handle, "s1");
    const snaps = new FinAssetSnapshotRepo(handle, "s1");
    const a = assets.create({ kind: "savings", label: "Savings" });
    snaps.create({ assetId: a.id, amountCents: 100_000, asOf: "2026-07-15" });
    snaps.create({ assetId: a.id, amountCents: 200_000, asOf: "2026-08-15" });
    const r = netWorthChange(handle, "s1", NOW) as any;
    expect(r.status).toBe("compared");
  });
});

describe("goalAllocationChange", () => {
  function makeGoal(spaceId: string) {
    const bucket = new FinBucketRepo(handle, spaceId).create({ name: "Fund" });
    return new FinGoalRepo(handle, spaceId).create({ bucketId: bucket.id, name: "Truck" });
  }
  const rawAllocate = (spaceId: string, goalId: number, amountCents: number, daysAgo: number) => {
    const createdAt = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
    handle.sqlite
      .prepare(`INSERT INTO fin_allocation (space_id, goal_id, amount_cents, note, created_at) VALUES (?, ?, ?, NULL, ?)`)
      .run(spaceId, goalId, amountCents, createdAt);
  };

  it("is insufficient_history with zero allocations ever", () => {
    const goal = makeGoal("s1");
    const r = goalAllocationChange(handle, "s1", { id: goal.id, name: goal.name }, NOW);
    expect(r.status).toBe("insufficient_history");
  });

  it("is insufficient_history when all activity is within the current 30-day window (no prior period)", () => {
    const goal = makeGoal("s1");
    rawAllocate("s1", goal.id, 10_000, 5);
    rawAllocate("s1", goal.id, 5_000, 20);
    const r = goalAllocationChange(handle, "s1", { id: goal.id, name: goal.name }, NOW);
    expect(r.status).toBe("insufficient_history");
  });

  it("compares trailing-30d vs. prior-30d once both periods have real activity", () => {
    const goal = makeGoal("s1");
    rawAllocate("s1", goal.id, 20_000, 10); // current window
    rawAllocate("s1", goal.id, 10_000, 45); // previous window
    const r = goalAllocationChange(handle, "s1", { id: goal.id, name: goal.name }, NOW) as any;
    expect(r.status).toBe("compared");
    expect(r.currentCents).toBe(20_000);
    expect(r.previousCents).toBe(10_000);
    expect(r.direction).toBe("increased");
  });

  it("is space-scoped", () => {
    const goal = makeGoal("s1");
    rawAllocate("s1", goal.id, 20_000, 10);
    rawAllocate("s1", goal.id, 10_000, 45);
    const r = goalAllocationChange(handle, "s2", { id: goal.id, name: goal.name }, NOW);
    expect(r.status).toBe("insufficient_history");
  });
});
