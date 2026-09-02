import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { FinAccountRepo } from "../repositories/finAccount.repo.js";
import { FinBillRepo } from "../repositories/finBill.repo.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { FinBucketRepo } from "../repositories/finBucket.repo.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { FinAllocationRepo } from "../repositories/finAllocation.repo.js";
import { moneySky } from "../finance/sky.js";

/** Stage 4 — bills become stars with a state (cooling=blue) + an on-focus glyph. */

let handle: DbHandle;
beforeEach(() => { handle = createDb(":memory:"); });
afterEach(() => { handle.sqlite.close(); });
const NOW = new Date("2026-01-10T00:00:00Z");

function cadence() {
  const inc = new FinIncomeRepo(handle, "s");
  inc.create({ date: "2026-01-01", netCents: 1000 });
  inc.create({ date: "2026-01-10", netCents: 1000 }); // ~monthly-ish horizon via median gap
}

describe("moneySky", () => {
  it("is empty with no bills", () => {
    expect(moneySky(handle, "s", NOW)).toHaveLength(0);
  });

  it("a comfortably-funded bill due soon is 'approaching'", () => {
    new FinAccountRepo(handle, "s").setBalance(500000);
    cadence();
    new FinBillRepo(handle, "s").create({ name: "Phone", amountCents: 7000, frequency: "monthly", anchorDate: "2026-01-14" });
    const star = moneySky(handle, "s", NOW).find((x) => x.label === "Phone")!;
    expect(star.state).toBe("approaching");
    expect(star.glyph).toBe("◐");
    expect(star.kind).toBe("bill");
  });

  it("a bill you can't cover cools to blue (state 'cooling')", () => {
    new FinAccountRepo(handle, "s").setBalance(3000); // < the bill
    cadence();
    new FinBillRepo(handle, "s").create({ name: "Insurance", amountCents: 25000, frequency: "monthly", anchorDate: "2026-01-14" });
    const star = moneySky(handle, "s", NOW).find((x) => x.label === "Insurance")!;
    expect(star.state).toBe("cooling");
    expect(star.glyph).toBe("❄");
    expect(star.intensity).toBe(1);
  });

  it("a past-due unpaid bill is 'overdue'", () => {
    new FinAccountRepo(handle, "s").setBalance(500000);
    cadence();
    new FinBillRepo(handle, "s").create({ name: "Rent", amountCents: 60000, frequency: "monthly", anchorDate: "2026-01-05" }); // before now
    const star = moneySky(handle, "s", NOW).find((x) => x.label === "Rent")!;
    expect(star.state).toBe("overdue");
    expect(star.glyph).toBe("!");
  });

  it("one star per bill (nearest occurrence)", () => {
    new FinAccountRepo(handle, "s").setBalance(500000);
    cadence();
    new FinBillRepo(handle, "s").create({ name: "Weekly", amountCents: 1000, frequency: "weekly", anchorDate: "2026-01-12" });
    const stars = moneySky(handle, "s", NOW).filter((x) => x.label === "Weekly");
    expect(stars).toHaveLength(1);
  });
});

describe("moneySky — Wealth goals (docs/specs/wealth-goals-allocation.md §11)", () => {
  it("emits a kind:'goal' star for an active goal, progress-driven not date-driven", () => {
    const bucket = new FinBucketRepo(handle, "s").create({ name: "Trucking" });
    const goal = new FinGoalRepo(handle, "s").create({ bucketId: bucket.id, name: "First Truck", targetCents: 100000 });
    new FinAllocationRepo(handle, "s").create({ goalId: goal.id, amountCents: 25000 });

    const star = moneySky(handle, "s", NOW).find((x) => x.kind === "goal")!;
    expect(star).toBeDefined();
    expect(star.label).toBe("First Truck");
    expect(star.amountCents).toBe(25000);
    expect(star.fillPct).toBe(0.25);
    expect(star.state).toBe("goal_filling");
    expect(star.glyph).toBe("◔");
  });

  it("flips to goal_reached exactly once fill reaches 100%, with the reached glyph", () => {
    const bucket = new FinBucketRepo(handle, "s").create({ name: "Emergency" });
    const goal = new FinGoalRepo(handle, "s").create({ bucketId: bucket.id, name: "Emergency Fund", targetCents: 100000 });
    new FinAllocationRepo(handle, "s").create({ goalId: goal.id, amountCents: 100000 });

    const star = moneySky(handle, "s", NOW).find((x) => x.kind === "goal")!;
    expect(star.state).toBe("goal_reached");
    expect(star.glyph).toBe("✦");
    expect(star.intensity).toBe(1);
  });

  it("an open-ended goal (no target) always renders goal_filling with no fillPct", () => {
    const bucket = new FinBucketRepo(handle, "s").create({ name: "Investing" });
    const goal = new FinGoalRepo(handle, "s").create({ bucketId: bucket.id, name: "General investing" });
    new FinAllocationRepo(handle, "s").create({ goalId: goal.id, amountCents: 10_000_000 }); // huge — still never "reached"

    const star = moneySky(handle, "s", NOW).find((x) => x.kind === "goal")!;
    expect(star.state).toBe("goal_filling");
    expect(star.fillPct).toBeUndefined();
  });

  it("excludes an archived goal from the sky entirely", () => {
    const bucket = new FinBucketRepo(handle, "s").create({ name: "Old" });
    const goal = new FinGoalRepo(handle, "s").create({ bucketId: bucket.id, name: "Old goal", targetCents: 1000 });
    new FinGoalRepo(handle, "s").archive(goal.id);

    expect(moneySky(handle, "s", NOW).some((x) => x.kind === "goal")).toBe(false);
  });

  it("bill stars and goal stars coexist without interfering with each other", () => {
    new FinAccountRepo(handle, "s").setBalance(500000);
    cadence();
    new FinBillRepo(handle, "s").create({ name: "Phone", amountCents: 7000, frequency: "monthly", anchorDate: "2026-01-14" });
    const bucket = new FinBucketRepo(handle, "s").create({ name: "Trucking" });
    const goal = new FinGoalRepo(handle, "s").create({ bucketId: bucket.id, name: "First Truck", targetCents: 100000 });
    new FinAllocationRepo(handle, "s").create({ goalId: goal.id, amountCents: 25000 });

    const stars = moneySky(handle, "s", NOW);
    expect(stars.find((x) => x.kind === "bill" && x.label === "Phone")).toBeDefined();
    expect(stars.find((x) => x.kind === "goal" && x.label === "First Truck")).toBeDefined();
  });

  it("never leaks another space's goals into the sky", () => {
    const bucket = new FinBucketRepo(handle, "alice").create({ name: "Trucking" });
    const goal = new FinGoalRepo(handle, "alice").create({ bucketId: bucket.id, name: "First Truck", targetCents: 100000 });
    new FinAllocationRepo(handle, "alice").create({ goalId: goal.id, amountCents: 25000 });

    expect(moneySky(handle, "bob", NOW).some((x) => x.kind === "goal")).toBe(false);
  });
});
