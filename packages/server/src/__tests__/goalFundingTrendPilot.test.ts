import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import type { ToolContext } from "../agent/tools/types.js";
import { goalFundingTrendTool } from "../agent/tools/goalFundingTrend.js";
import { runToolRouter } from "../agent/tools/router.js";
import { FinBucketRepo } from "../repositories/finBucket.repo.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { InteractionPreferencesRepo } from "../repositories/interactionPreferences.repo.js";
import { setSpaceSoul } from "../identity.js";

/**
 * Phase X — the goal-allocation proactive conversation pilot
 * (docs/specs/soumaya-goal-trend-proactive-pilot.md). Proves the full chain Phase W
 * identified: goalAllocationChange() [reused, unchanged] -> two-consecutive-period
 * evidence gate -> per-goal deduplication (agent_logs.targets) -> CommunicationContext
 * -> deterministic communication -> the existing toast/agent_logs delivery path.
 */

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const NOW = Date.parse("2026-06-01T00:00:00Z");
const DAY_MS = 86_400_000;

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

const tc = (spaceId = "s1", now = NOW): ToolContext => ({ ctx, spaceId, now, notify: async () => {} });

function makeGoal(spaceId: string, name: string): number {
  const bucket = new FinBucketRepo(handle, spaceId).create({ name: "Test Bucket" });
  const goal = new FinGoalRepo(handle, spaceId).create({ bucketId: bucket.id, name });
  return goal.id;
}

function makeAllocation(spaceId: string, goalId: number, amountCents: number, daysAgo: number): void {
  const createdAt = new Date(NOW - daysAgo * DAY_MS).toISOString().replace("T", " ").slice(0, 19);
  handle.sqlite
    .prepare(`INSERT INTO fin_allocation (space_id, goal_id, amount_cents, created_at) VALUES (?, ?, ?, ?)`)
    .run(spaceId, goalId, amountCents, createdAt);
}

/** Three 30-day buckets of decreasing (or increasing) allocation, spanning back 75+
 *  days — the minimum shape `goalAllocationChange()` needs for BOTH the current-period
 *  and prior-period calls to return `"compared"` (not `"insufficient_history"`). */
function makeDecreasingHistory(spaceId: string, goalId: number, oldest: number, middle: number, recent: number): void {
  makeAllocation(spaceId, goalId, oldest, 75); // 60-90 days ago
  makeAllocation(spaceId, goalId, middle, 45); // 30-60 days ago
  makeAllocation(spaceId, goalId, recent, 15); // 0-30 days ago
}

function makeHeavyEmotionalHistory(spaceId: string): void {
  for (let i = 0; i < 10; i++) {
    const createdAt = new Date(NOW - i * DAY_MS).toISOString().replace("T", " ").slice(0, 19);
    handle.sqlite
      .prepare(`INSERT INTO nodes (space_id, label, type, content, emotional_weight, created_at) VALUES (?, ?, 'knowledge', ?, ?, ?)`)
      .run(spaceId, `heavy ${i}`, `heavy ${i}`, -0.6, createdAt);
  }
}

describe("goal funding trend pilot — detect() evidence gate", () => {
  it("1. insufficient history (only one valid period): no proactive candidate", () => {
    const goalId = makeGoal("s1", "Emergency Fund");
    makeAllocation("s1", goalId, 5_000, 10); // only within the current 30-day window
    expect(goalFundingTrendTool.detect(tc())).toEqual([]);
  });

  it("2. a meaningful change occurring only ONCE (no real prior-period comparison): no candidate", () => {
    const goalId = makeGoal("s1", "Emergency Fund");
    makeAllocation("s1", goalId, 15_000, 45); // 30-60 days ago
    makeAllocation("s1", goalId, 5_000, 10); // 0-30 days ago — real current-period decrease
    // No allocation older than 60 days -> the PRIOR-period call has no genuine
    // before-that period to compare against -> insufficient_history for that call.
    expect(goalFundingTrendTool.detect(tc())).toEqual([]);
  });

  it("3. two consecutive periods of meaningful decrease: proactive candidate eligible", () => {
    const goalId = makeGoal("s1", "Emergency Fund");
    makeDecreasingHistory("s1", goalId, 30_000, 15_000, 5_000);
    const inv = goalFundingTrendTool.detect(tc());
    expect(inv).toHaveLength(1);
    expect(inv[0]!.args.goalId).toBe(goalId);
    expect(inv[0]!.args.direction).toBe("decreased");
  });

  it("a swing under the meaningful-magnitude threshold does not qualify", () => {
    const goalId = makeGoal("s1", "Emergency Fund");
    makeDecreasingHistory("s1", goalId, 10_100, 10_050, 10_000); // tiny, real but trivial deltas
    expect(goalFundingTrendTool.detect(tc())).toEqual([]);
  });

  it("an 'unchanged' direction never qualifies even with real history", () => {
    const goalId = makeGoal("s1", "Emergency Fund");
    makeDecreasingHistory("s1", goalId, 10_000, 10_000, 10_000);
    expect(goalFundingTrendTool.detect(tc())).toEqual([]);
  });

  it("an increasing trend across two consecutive periods is also eligible (direction-agnostic gate)", () => {
    const goalId = makeGoal("s1", "Emergency Fund");
    makeDecreasingHistory("s1", goalId, 5_000, 15_000, 30_000); // increasing
    const inv = goalFundingTrendTool.detect(tc());
    expect(inv).toHaveLength(1);
    expect(inv[0]!.args.direction).toBe("increased");
  });
});

describe("goal funding trend pilot — communication (direction, magnitude, identity)", () => {
  it("4. direction is preserved into the communicated message", async () => {
    const res = await goalFundingTrendTool.run(tc(), { goalId: 1, goalName: "Emergency Fund", direction: "decreased", deltaCents: -10_000 });
    expect(res.message).toMatch(/less toward/);
  });

  it("4b. an increased direction is communicated distinctly from a decrease", async () => {
    const res = await goalFundingTrendTool.run(tc(), { goalId: 1, goalName: "Emergency Fund", direction: "increased", deltaCents: 10_000 });
    expect(res.message).toMatch(/more toward/);
  });

  it("5. meaningful magnitude reaches the communication layer", async () => {
    const res = await goalFundingTrendTool.run(tc(), { goalId: 1, goalName: "Emergency Fund", direction: "decreased", deltaCents: -10_000 });
    expect(res.message).toMatch(/\$100/);
  });

  it("6. the correct goal identity is attached to the result (for delivery/dedup)", async () => {
    const res = await goalFundingTrendTool.run(tc(), { goalId: 42, goalName: "Vacation Fund", direction: "decreased", deltaCents: -5_000 });
    expect(res.message).toContain("Vacation Fund");
    expect(res.targets).toEqual([42]);
  });
});

describe("goal funding trend pilot — deduplication", () => {
  it("7. the same goal already surfaced recently does not fire again", () => {
    const goalId = makeGoal("s1", "Emergency Fund");
    makeDecreasingHistory("s1", goalId, 30_000, 15_000, 5_000);
    handle.sqlite
      .prepare(`INSERT INTO agent_logs (space_id, action, description, targets, created_at) VALUES ('s1', 'tool:goal_trend', 'earlier nudge', ?, ?)`)
      .run(JSON.stringify([goalId]), new Date(NOW - 5 * DAY_MS).toISOString());
    expect(goalFundingTrendTool.detect(tc())).toEqual([]);
  });

  it("8. a different goal with its own real signal is NOT suppressed by goal A's recent surfacing", () => {
    const goalA = makeGoal("s1", "Emergency Fund");
    makeDecreasingHistory("s1", goalA, 30_000, 15_000, 5_000);
    handle.sqlite
      .prepare(`INSERT INTO agent_logs (space_id, action, description, targets, created_at) VALUES ('s1', 'tool:goal_trend', 'earlier nudge', ?, ?)`)
      .run(JSON.stringify([goalA]), new Date(NOW - 5 * DAY_MS).toISOString());

    const goalB = makeGoal("s1", "Vacation Fund");
    makeDecreasingHistory("s1", goalB, 40_000, 20_000, 8_000);

    const inv = goalFundingTrendTool.detect(tc());
    expect(inv).toHaveLength(1);
    expect(inv[0]!.args.goalId).toBe(goalB);
  });

  it("the same goal becomes eligible again after the cooldown window passes", () => {
    const goalId = makeGoal("s1", "Emergency Fund");
    makeDecreasingHistory("s1", goalId, 30_000, 15_000, 5_000);
    handle.sqlite
      .prepare(`INSERT INTO agent_logs (space_id, action, description, targets, created_at) VALUES ('s1', 'tool:goal_trend', 'earlier nudge', ?, ?)`)
      .run(JSON.stringify([goalId]), new Date(NOW - 40 * DAY_MS).toISOString()); // outside the 30-day cooldown
    expect(goalFundingTrendTool.detect(tc())).toHaveLength(1);
  });
});

describe("goal funding trend pilot — emotional patterns never trigger, only soften tone", () => {
  it("9. a recurring emotional pattern with NO goal-allocation signal produces no proactive candidate", () => {
    makeHeavyEmotionalHistory("s1");
    // No fin_goal/fin_allocation activity at all.
    expect(goalFundingTrendTool.detect(tc())).toEqual([]);
  });

  it("a real recurring pattern softens the opener without ever naming the emotion", async () => {
    makeHeavyEmotionalHistory("s1");
    const res = await goalFundingTrendTool.run(tc(), { goalId: 1, goalName: "Emergency Fund", direction: "decreased", deltaCents: -10_000 });
    expect(res.message).toMatch(/No pressure/);
    expect(res.message!.toLowerCase()).not.toMatch(/stress|burnout|downswing/);
  });
});

describe("goal funding trend pilot — CommunicationContext integration", () => {
  it("10a. a learned 'concise' preference reaches the message", async () => {
    const defaultRes = await goalFundingTrendTool.run(tc(), { goalId: 1, goalName: "Emergency Fund", direction: "decreased", deltaCents: -10_000 });
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.6, 3, new Date().toISOString());
    const res = await goalFundingTrendTool.run(tc(), { goalId: 1, goalName: "Emergency Fund", direction: "decreased", deltaCents: -10_000 });
    // Isolate the preference's effect precisely rather than asserting an absolute
    // length bound: concise must be materially shorter than the non-concise default
    // for the identical underlying event.
    expect(res.message!.length).toBeLessThan(defaultRes.message!.length);
  });

  it("10b. a learned 'directness' preference produces different wording than the default", async () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("directness", "very direct", 0.6, 3, new Date().toISOString());
    const res = await goalFundingTrendTool.run(tc(), { goalId: 1, goalName: "Emergency Fund", direction: "decreased", deltaCents: -10_000 });
    expect(res.message).not.toMatch(/just flagging it/);
  });

  it("10c. a space-level soul override does not break the pilot (full CommunicationContext is read successfully)", async () => {
    setSpaceSoul(handle.sqlite, "s1", "A warm, curious companion.");
    const res = await goalFundingTrendTool.run(tc(), { goalId: 1, goalName: "Emergency Fund", direction: "decreased", deltaCents: -10_000 });
    expect(res.ok).toBe(true);
    expect(res.message).toBeTruthy();
  });

  it("no preference evidence produces the sensible neutral default", async () => {
    const res = await goalFundingTrendTool.run(tc(), { goalId: 1, goalName: "Emergency Fund", direction: "decreased", deltaCents: -10_000 });
    expect(res.message).toMatch(/I noticed you've been putting less toward "Emergency Fund"/);
  });
});

describe("goal funding trend pilot — space isolation", () => {
  it("11. another space's goal/allocation data never produces a candidate for this space", () => {
    const otherGoal = makeGoal("other-space", "Emergency Fund");
    makeDecreasingHistory("other-space", otherGoal, 30_000, 15_000, 5_000);
    expect(goalFundingTrendTool.detect(tc("s1"))).toEqual([]);
  });

  it("another space's preference/soul never leaks into this space's message", async () => {
    new InteractionPreferencesRepo(handle, "other-space").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    const res = await goalFundingTrendTool.run(tc("s1"), { goalId: 1, goalName: "Emergency Fund", direction: "decreased", deltaCents: -10_000 });
    expect(res.message).toMatch(/I noticed you've been putting less toward/);
  });
});

describe("goal funding trend pilot — the full chain, through the real production router", () => {
  it("15. goalAllocationChange() -> evidence gate -> eligibility -> CommunicationContext -> communication -> agent_logs + toast delivery, end to end", async () => {
    const goalId = makeGoal("s1", "Emergency Fund");
    makeDecreasingHistory("s1", goalId, 30_000, 15_000, 5_000);

    let delivered = "";
    const results = await runToolRouter(ctx, "s1", {
      now: NOW,
      notify: async (_spaceId, text) => { delivered = text; },
    });

    const goalResult = results.find((r) => r.summary.includes("goal funding trend"));
    expect(goalResult).toBeTruthy();
    expect(goalResult!.delivered).toBe(true);
    expect(delivered).toMatch(/Emergency Fund/);

    // The real delivery/logging path: agent_logs now carries the goal id in `targets`,
    // not the old hardcoded '[]' — proving the dedup mechanism is wired end to end.
    const row = handle.sqlite
      .prepare(`SELECT description, targets FROM agent_logs WHERE space_id = 's1' AND action = 'tool:goal_trend' ORDER BY id DESC LIMIT 1`)
      .get() as { description: string; targets: string };
    expect(row.description).toMatch(/Emergency Fund/);
    expect(JSON.parse(row.targets)).toEqual([goalId]);

    // Running the router again immediately must NOT re-fire for the same goal (the
    // dedup this same chain just wrote is honored on the very next tick).
    const secondRun = await runToolRouter(ctx, "s1", { now: NOW + 60_000 });
    expect(secondRun.some((r) => r.summary.includes("goal funding trend"))).toBe(false);
  });

  it("12. a pre-existing tool that never sets `targets` (check_in) still logs '[]' through the SAME real router — router.ts's change is additive only", async () => {
    // No fin_goal/fin_allocation data at all, so goal_trend can't fire this tick;
    // check_in's own heavy-mean signal (5 recent heavy memories) fires instead.
    for (let i = 0; i < 5; i++) {
      const createdAt = new Date(NOW - i * DAY_MS).toISOString().replace("T", " ").slice(0, 19);
      handle.sqlite
        .prepare(`INSERT INTO nodes (space_id, label, type, content, emotional_weight, created_at) VALUES (?, ?, 'knowledge', ?, ?, ?)`)
        .run("s1", `heavy ${i}`, `heavy ${i}`, -0.6, createdAt);
    }
    const results = await runToolRouter(ctx, "s1", { now: NOW });
    expect(results.some((r) => r.summary.startsWith("checked in"))).toBe(true);
    const row = handle.sqlite
      .prepare(`SELECT targets FROM agent_logs WHERE space_id = 's1' AND action = 'tool:check_in' ORDER BY id DESC LIMIT 1`)
      .get() as { targets: string };
    expect(row.targets).toBe("[]");
  });
});
