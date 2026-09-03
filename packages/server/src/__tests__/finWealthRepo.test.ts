import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { FinBucketRepo } from "../repositories/finBucket.repo.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { FinAllocationRepo } from "../repositories/finAllocation.repo.js";

/** Wealth (docs/specs/wealth-goals-allocation.md) — repos against a real (in-memory) DB. */

let handle: DbHandle;
beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => {
  handle.sqlite.close();
});

describe("FinBucketRepo", () => {
  it("creates, lists (excluding archived by default), updates, and archives a bucket", () => {
    const buckets = new FinBucketRepo(handle, "s1");
    const b = buckets.create({ name: "Trucking", category: "business" });
    expect(b.category).toBe("business");
    expect(buckets.list()).toHaveLength(1);

    buckets.update(b.id, { name: "Trucking Fund" });
    expect(buckets.get(b.id)?.name).toBe("Trucking Fund");

    expect(buckets.archive(b.id)).toBe(true);
    expect(buckets.list()).toHaveLength(0);
    expect(buckets.list(true)).toHaveLength(1);
  });

  it("defaults an unspecified category to 'other'", () => {
    const buckets = new FinBucketRepo(handle, "s1");
    const b = buckets.create({ name: "Misc" });
    expect(b.category).toBe("other");
  });
});

describe("FinGoalRepo", () => {
  it("creates a goal inside a bucket and narrows list() by bucketId", () => {
    const buckets = new FinBucketRepo(handle, "s1");
    const goals = new FinGoalRepo(handle, "s1");
    const trucking = buckets.create({ name: "Trucking" });
    const retirement = buckets.create({ name: "Retirement" });

    goals.create({ bucketId: trucking.id, name: "First Truck", targetCents: 1_500_000 });
    goals.create({ bucketId: retirement.id, name: "2026 Roth" });

    expect(goals.list({ bucketId: trucking.id })).toHaveLength(1);
    expect(goals.list()).toHaveLength(2);
  });

  it("supports an open-ended goal (no target)", () => {
    const buckets = new FinBucketRepo(handle, "s1");
    const goals = new FinGoalRepo(handle, "s1");
    const b = buckets.create({ name: "Investing" });
    const g = goals.create({ bucketId: b.id, name: "General investing" });
    expect(g.targetCents).toBeNull();
  });

  it("archives a goal so it drops out of the default list", () => {
    const buckets = new FinBucketRepo(handle, "s1");
    const goals = new FinGoalRepo(handle, "s1");
    const b = buckets.create({ name: "Emergency" });
    const g = goals.create({ bucketId: b.id, name: "Emergency Fund", targetCents: 1_000_000 });
    goals.archive(g.id);
    expect(goals.list()).toHaveLength(0);
    expect(goals.list({ includeArchived: true })).toHaveLength(1);
  });

  // Life Vision (docs/specs/life-vision.md, C3.2) — repository-level round-trip of
  // vision_node_id. NodesRepo isn't used here (the node's existence/kind is validated
  // at the route layer, not the repo — see financeWealthRoutes.test.ts); this suite
  // only proves the column itself persists and defaults correctly.
  it("defaults visionNodeId to null when not linked", () => {
    const buckets = new FinBucketRepo(handle, "s1");
    const goals = new FinGoalRepo(handle, "s1");
    const b = buckets.create({ name: "Misc" });
    const g = goals.create({ bucketId: b.id, name: "Unrelated goal" });
    expect(g.visionNodeId ?? null).toBeNull();
  });

  it("persists visionNodeId at creation and round-trips it through get()", () => {
    const buckets = new FinBucketRepo(handle, "s1");
    const goals = new FinGoalRepo(handle, "s1");
    const b = buckets.create({ name: "Housing" });
    const g = goals.create({ bucketId: b.id, name: "Down Payment", targetCents: 7_000_000, visionNodeId: 42 });
    expect(g.visionNodeId).toBe(42);
    expect(goals.get(g.id)?.visionNodeId).toBe(42);
  });

  it("links via update(), then unlinks by patching visionNodeId back to null", () => {
    const buckets = new FinBucketRepo(handle, "s1");
    const goals = new FinGoalRepo(handle, "s1");
    const b = buckets.create({ name: "Housing" });
    const g = goals.create({ bucketId: b.id, name: "Closing Costs" });
    expect(g.visionNodeId ?? null).toBeNull();

    const linked = goals.update(g.id, { visionNodeId: 7 });
    expect(linked?.visionNodeId).toBe(7);

    const unlinked = goals.update(g.id, { visionNodeId: null });
    expect(unlinked?.visionNodeId ?? null).toBeNull();
  });

  it("omitting visionNodeId from a patch leaves the existing link untouched", () => {
    const buckets = new FinBucketRepo(handle, "s1");
    const goals = new FinGoalRepo(handle, "s1");
    const b = buckets.create({ name: "Housing" });
    const g = goals.create({ bucketId: b.id, name: "Moving Costs", visionNodeId: 9 });

    const renamed = goals.update(g.id, { name: "Moving & Furnishing" });
    expect(renamed?.name).toBe("Moving & Furnishing");
    expect(renamed?.visionNodeId).toBe(9);
  });

  it("list({ visionNodeId }) narrows to goals linked to that Vision only", () => {
    const buckets = new FinBucketRepo(handle, "s1");
    const goals = new FinGoalRepo(handle, "s1");
    const b = buckets.create({ name: "Housing" });
    goals.create({ bucketId: b.id, name: "Down Payment", visionNodeId: 1 });
    goals.create({ bucketId: b.id, name: "Closing Costs", visionNodeId: 1 });
    goals.create({ bucketId: b.id, name: "Unrelated", visionNodeId: 2 });
    goals.create({ bucketId: b.id, name: "No vision at all" });

    expect(goals.list({ visionNodeId: 1 })).toHaveLength(2);
    expect(goals.list({ visionNodeId: 2 })).toHaveLength(1);
  });
});

describe("FinAllocationRepo — the signed ledger IS the de-allocation model", () => {
  function setup(spaceId = "s1") {
    const buckets = new FinBucketRepo(handle, spaceId);
    const goals = new FinGoalRepo(handle, spaceId);
    const allocations = new FinAllocationRepo(handle, spaceId);
    const b = buckets.create({ name: "Trucking" });
    const g = goals.create({ bucketId: b.id, name: "First Truck", targetCents: 1_500_000 });
    return { allocations, goal: g };
  }

  it("accumulates a positive total across multiple allocations", () => {
    const { allocations, goal } = setup();
    allocations.create({ goalId: goal.id, amountCents: 20000 });
    allocations.create({ goalId: goal.id, amountCents: 5000 });
    expect(allocations.totalForGoal(goal.id)).toBe(25000);
  });

  it("a withdrawal (negative amount) reduces the total and is recorded in history", () => {
    const { allocations, goal } = setup();
    allocations.create({ goalId: goal.id, amountCents: 20000 });
    const withdrawal = allocations.create({ goalId: goal.id, amountCents: -5000, note: "used for a real emergency" });
    expect(withdrawal).not.toBeNull();
    expect(allocations.totalForGoal(goal.id)).toBe(15000);
    const history = allocations.list(goal.id);
    expect(history).toHaveLength(2);
    expect(history.some((a) => a.amountCents === -5000 && a.note === "used for a real emergency")).toBe(true);
  });

  it("rejects a withdrawal that would take the goal's total below zero", () => {
    const { allocations, goal } = setup();
    allocations.create({ goalId: goal.id, amountCents: 10000 });
    const rejected = allocations.create({ goalId: goal.id, amountCents: -10001 });
    expect(rejected).toBeNull();
    // The rejected attempt must not have been recorded at all.
    expect(allocations.totalForGoal(goal.id)).toBe(10000);
    expect(allocations.list(goal.id)).toHaveLength(1);
  });

  it("an exact full withdrawal down to zero is allowed", () => {
    const { allocations, goal } = setup();
    allocations.create({ goalId: goal.id, amountCents: 10000 });
    const full = allocations.create({ goalId: goal.id, amountCents: -10000 });
    expect(full).not.toBeNull();
    expect(allocations.totalForGoal(goal.id)).toBe(0);
  });

  it("totalsByGoal batches totals for several goals in one call, avoiding an N+1", () => {
    const { allocations, goal: g1 } = setup();
    const goals = new FinGoalRepo(handle, "s1");
    const buckets = new FinBucketRepo(handle, "s1");
    const b2 = buckets.create({ name: "Retirement" });
    const g2 = goals.create({ bucketId: b2.id, name: "Roth" });
    allocations.create({ goalId: g1.id, amountCents: 30000 });
    allocations.create({ goalId: g2.id, amountCents: 7000 });

    const totals = allocations.totalsByGoal([g1.id, g2.id]);
    expect(totals.get(g1.id)).toBe(30000);
    expect(totals.get(g2.id)).toBe(7000);
  });

  it("totalsByGoal returns an empty map for an empty input without querying", () => {
    const { allocations } = setup();
    expect(allocations.totalsByGoal([])).toEqual(new Map());
  });
});

describe("Wealth — space scoping", () => {
  it("never leaks buckets, goals, or allocations across spaces", () => {
    const aliceB = new FinBucketRepo(handle, "alice");
    const bobB = new FinBucketRepo(handle, "bob");
    const aliceG = new FinGoalRepo(handle, "alice");
    const aliceA = new FinAllocationRepo(handle, "alice");
    const bobA = new FinAllocationRepo(handle, "bob");

    const bucket = aliceB.create({ name: "Trucking" });
    const goal = aliceG.create({ bucketId: bucket.id, name: "First Truck", targetCents: 1_000_000 });
    aliceA.create({ goalId: goal.id, amountCents: 5000 });

    expect(bobB.list()).toHaveLength(0);
    expect(aliceB.list()).toHaveLength(1);
    // A different space's repo can't see or total the other space's goal, even by id.
    expect(bobA.totalForGoal(goal.id)).toBe(0);
    expect(aliceA.totalForGoal(goal.id)).toBe(5000);
  });
});
