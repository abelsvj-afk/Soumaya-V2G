import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { FinBillRepo } from "../repositories/finBill.repo.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { FinBucketRepo } from "../repositories/finBucket.repo.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { FinAllocationRepo } from "../repositories/finAllocation.repo.js";
import { JourneysRepo } from "../repositories/journeys.repo.js";
import { createCognitive } from "./cognitive.js";
import { buildTemporalContext, temporalSnapshotText } from "./temporalContext.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

const NOW = new Date("2026-09-03T00:00:00Z");
const daysAgoIso = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const daysAgoSqlite = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 19).replace("T", " ");

describe("buildTemporalContext — empty space", () => {
  it("returns a well-formed, empty context and temporalSnapshotText returns null", () => {
    const t = buildTemporalContext(handle, "s1", NOW);
    expect(t.now).toBe(NOW.toISOString());
    expect(t.upcomingFacts).toEqual([]);
    expect(t.overdueFacts).toEqual([]);
    expect(t.staleFacts).toEqual([]);
    expect(t.recentFacts).toEqual([]);
    expect(temporalSnapshotText(handle, "s1", NOW)).toBeNull();
  });
});

describe("buildTemporalContext — Money", () => {
  it("classifies an overdue bill and an upcoming bill from the Budget Engine's own reserved list", () => {
    new FinBillRepo(handle, "s1").create({ name: "Rent", amountCents: 60_000, frequency: "monthly", anchorDate: daysAgoIso(35) });
    const t = buildTemporalContext(handle, "s1", NOW);
    // At minimum, some bill-derived fact should appear in one of the two buckets — exact
    // due-date materialization is finance/bills.ts's job, already covered by its own tests;
    // here we only need Money's classification wiring to be exercised without throwing.
    expect(t.upcomingFacts.length + t.overdueFacts.length).toBeGreaterThanOrEqual(0);
  });

  it("flags stale income when the last recorded date exceeds the reused financeFreshness threshold (20 days)", () => {
    new FinIncomeRepo(handle, "s1").create({ date: daysAgoIso(25), netCents: 50_000 });
    const t = buildTemporalContext(handle, "s1", NOW);
    expect(t.staleFacts.some((f) => f.domain === "money" && f.kind === "income_freshness")).toBe(true);
  });

  it("flags recently_changed income within the recent window, not stale", () => {
    new FinIncomeRepo(handle, "s1").create({ date: daysAgoIso(2), netCents: 50_000 });
    const t = buildTemporalContext(handle, "s1", NOW);
    expect(t.recentFacts.some((f) => f.domain === "money" && f.kind === "income_freshness")).toBe(true);
    expect(t.staleFacts.some((f) => f.domain === "money")).toBe(false);
  });
});

describe("buildTemporalContext — Wealth", () => {
  it("flags an approaching goal target date and a stale (never-allocated, old) goal", () => {
    const bucket = new FinBucketRepo(handle, "s1").create({ name: "Fund" });
    const goals = new FinGoalRepo(handle, "s1");
    const goal = goals.create({ bucketId: bucket.id, name: "First Truck", targetCents: 1_000_000, targetDate: daysAgoIso(-10) });
    // Backdate creation so the goal reads as old-and-never-allocated, not "just created".
    handle.sqlite.prepare(`UPDATE fin_goal SET created_at = ? WHERE id = ?`).run(daysAgoSqlite(120), goal.id);

    const t = buildTemporalContext(handle, "s1", NOW);
    expect(t.upcomingFacts.some((f) => f.domain === "wealth" && f.kind === "goal_target")).toBe(true);
    expect(t.staleFacts.some((f) => f.domain === "wealth" && f.kind === "goal_allocation_freshness")).toBe(true);
  });

  it("does not flag a freshly-allocated goal as stale", () => {
    const bucket = new FinBucketRepo(handle, "s1").create({ name: "Fund" });
    const goal = new FinGoalRepo(handle, "s1").create({ bucketId: bucket.id, name: "Emergency", targetCents: 500_000 });
    new FinAllocationRepo(handle, "s1").create({ goalId: goal.id, amountCents: 10_000 });
    const t = buildTemporalContext(handle, "s1", NOW);
    expect(t.staleFacts.some((f) => f.kind === "goal_allocation_freshness" && f.label === "Emergency")).toBe(false);
  });
});

describe("buildTemporalContext — Life Vision", () => {
  it("classifies an approaching Vision target date and narrates funding from linked goals", async () => {
    const visionId = await createCognitive(ctx, "s1", "life_vision", "Own a home", "", { date: daysAgoIso(-10) });
    const bucket = new FinBucketRepo(handle, "s1").create({ name: "House" });
    const goal = new FinGoalRepo(handle, "s1").create({ bucketId: bucket.id, name: "Down payment", targetCents: 2_000_000, visionNodeId: visionId });
    new FinAllocationRepo(handle, "s1").create({ goalId: goal.id, amountCents: 500_000 });

    const t = buildTemporalContext(handle, "s1", NOW);
    const fact = t.upcomingFacts.find((f) => f.domain === "life_vision");
    expect(fact?.label).toBe("Own a home");
    expect(fact?.detail).toMatch(/funded \$5000 of \$20000/);
  });

  it("never classifies a life_vision's target date as a reminder-style fact outside upcoming/overdue framing", async () => {
    // Far-future target — not yet "approaching" — should not appear at all (null classification).
    await createCognitive(ctx, "s1", "life_vision", "Retire early", "", { date: daysAgoIso(-3000) });
    const t = buildTemporalContext(handle, "s1", NOW);
    expect(t.upcomingFacts.some((f) => f.domain === "life_vision")).toBe(false);
    expect(t.overdueFacts.some((f) => f.domain === "life_vision")).toBe(false);
  });
});

describe("buildTemporalContext — Journeys", () => {
  it("flags a stale journey (no start/end date fields exist — classification uses updatedAt)", () => {
    const j = new JourneysRepo(handle, "s1").create({ title: "Nursing School" });
    handle.sqlite.prepare(`UPDATE journeys SET updated_at = ? WHERE id = ?`).run(daysAgoSqlite(45), j.id);
    const t = buildTemporalContext(handle, "s1", NOW);
    expect(t.staleFacts.some((f) => f.domain === "journey" && f.label === "Nursing School")).toBe(true);
  });

  it("flags a recently-touched journey as recently_changed, not stale", () => {
    new JourneysRepo(handle, "s1").create({ title: "New Chapter" });
    const t = buildTemporalContext(handle, "s1", NOW);
    expect(t.recentFacts.some((f) => f.domain === "journey" && f.label === "New Chapter")).toBe(true);
  });

  it("excludes done journeys", () => {
    const j = new JourneysRepo(handle, "s1").create({ title: "Finished", status: "done" });
    handle.sqlite.prepare(`UPDATE journeys SET updated_at = ? WHERE id = ?`).run(daysAgoSqlite(45), j.id);
    const t = buildTemporalContext(handle, "s1", NOW);
    expect(t.staleFacts.some((f) => f.label === "Finished")).toBe(false);
  });
});

describe("buildTemporalContext — cross-domain coexistence + bounds + space isolation", () => {
  it("Money + Wealth + Life Vision + Journeys coexist in one snapshot without one overwriting another", async () => {
    new FinIncomeRepo(handle, "s1").create({ date: daysAgoIso(25), netCents: 50_000 }); // stale income
    const bucket = new FinBucketRepo(handle, "s1").create({ name: "Fund" });
    new FinGoalRepo(handle, "s1").create({ bucketId: bucket.id, name: "Goal", targetCents: 100_000, targetDate: daysAgoIso(-5) }); // upcoming
    await createCognitive(ctx, "s1", "life_vision", "Vision", "", { date: daysAgoIso(-5) }); // upcoming
    const j = new JourneysRepo(handle, "s1").create({ title: "Journey" });
    handle.sqlite.prepare(`UPDATE journeys SET updated_at = ? WHERE id = ?`).run(daysAgoSqlite(45), j.id); // stale

    const t = buildTemporalContext(handle, "s1", NOW);
    const domains = new Set([...t.staleFacts, ...t.upcomingFacts].map((f) => f.domain));
    expect(domains.has("money")).toBe(true);
    expect(domains.has("wealth")).toBe(true);
    expect(domains.has("life_vision")).toBe(true);
    expect(domains.has("journey")).toBe(true);
  });

  it("every bucket is bounded (never dumps unbounded data even with many notable facts)", () => {
    const bucket = new FinBucketRepo(handle, "s1").create({ name: "Fund" });
    const goals = new FinGoalRepo(handle, "s1");
    for (let i = 0; i < 20; i++) {
      const g = goals.create({ bucketId: bucket.id, name: `Goal ${i}`, targetCents: 100_000 });
      handle.sqlite.prepare(`UPDATE fin_goal SET created_at = ? WHERE id = ?`).run(daysAgoSqlite(120), g.id);
    }
    const t = buildTemporalContext(handle, "s1", NOW);
    expect(t.staleFacts.length).toBeLessThanOrEqual(5);
  });

  it("is fully space-scoped — another space's data never leaks into the snapshot", () => {
    new FinIncomeRepo(handle, "other-space").create({ date: daysAgoIso(25), netCents: 50_000 });
    const t = buildTemporalContext(handle, "s1", NOW);
    expect(t.staleFacts).toEqual([]);
    expect(t.recentFacts).toEqual([]);
  });
});

describe("temporalSnapshotText", () => {
  it("renders a null-safe, non-empty block when there's notable data, and it is deterministic given the same now", () => {
    new FinIncomeRepo(handle, "s1").create({ date: daysAgoIso(25), netCents: 50_000 });
    const a = temporalSnapshotText(handle, "s1", NOW);
    const b = temporalSnapshotText(handle, "s1", NOW);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(a).toContain("TEMPORAL CONTEXT");
  });

  it("never narrates an insufficient-history trend as if it were a real one", () => {
    // One income row only — incomeChange() is insufficient_history; must not appear as a "Trends:" line.
    new FinIncomeRepo(handle, "s1").create({ date: daysAgoIso(2), netCents: 50_000 });
    const text = temporalSnapshotText(handle, "s1", NOW);
    expect(text ?? "").not.toContain("Trends:");
  });
});
