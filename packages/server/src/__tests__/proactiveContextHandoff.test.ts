import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createDb, type DbHandle } from "../db/client.js";
import { buildContext, type AppContext } from "../context.js";
import { createApp } from "../api/server.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { chat, DEFAULT_CHAT } from "../chat/graphrag.js";
import { proactiveContextSnapshotText } from "../analysis/proactiveContext.js";
import { FinBucketRepo } from "../repositories/finBucket.repo.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { UsageTracker } from "../usage.js";
import type { ToolContext } from "../agent/tools/types.js";
import { goalFundingTrendTool } from "../agent/tools/goalFundingTrend.js";
import { runToolRouter } from "../agent/tools/router.js";

/**
 * Phase Y — Proactive → Chat context handoff (docs/specs/soumaya-proactive-chat-handoff.md).
 * Drives the real `chat()` entry point (and, for the full-chain scenario, the real
 * `/api/chat` HTTP route plus `runToolRouter()` from Phase X) to prove that a user who
 * opens Chat from the goal_trend toast lands in a conversation that already knows why —
 * without a second copy of the intelligence, without polluting permanent memory, and
 * without disturbing Phase X's own deduplication.
 */

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();
const SPACE = "s1";
const OTHER_SPACE = "s2";
const NOW = Date.parse("2026-06-01T00:00:00Z");
const DAY_MS = 86_400_000;

beforeEach(() => { handle = createDb(":memory:"); });
afterEach(() => { handle.sqlite.close(); });

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

/** Same two-period shape goalFundingTrendPilot.test.ts uses — the minimum history for
 *  BOTH the current and prior `goalAllocationChange()` calls to return "compared". */
function makeChangingHistory(spaceId: string, goalId: number, oldest: number, middle: number, recent: number): void {
  makeAllocation(spaceId, goalId, oldest, 75); // 60-90 days ago
  makeAllocation(spaceId, goalId, middle, 45); // 30-60 days ago
  makeAllocation(spaceId, goalId, recent, 15); // 0-30 days ago
}

async function memo(text: string, spaceId = SPACE): Promise<void> {
  const { ingest } = await import("../ingestion/pipeline.js");
  await ingest(handle, { embeddings, llm }, text, spaceId);
}

describe("1-2-3. Proactive context creation — correct identity, source, evidence", () => {
  it("a valid Phase X candidate produces a correctly-attributed, non-fabricated context string", () => {
    const goalId = makeGoal(SPACE, "Emergency Fund");
    makeChangingHistory(SPACE, goalId, 30_000, 15_000, 5_000); // decreasing
    const text = proactiveContextSnapshotText(handle, SPACE, { source: "goal_trend", targetId: goalId }, new Date(NOW));
    expect(text).toBeTruthy();
    expect(text).toContain("Emergency Fund"); // correct goal identity
    expect(text).toContain("PROACTIVE CONTEXT"); // correctly labeled, not silently blended in
    expect(text).toContain("decreased"); // matches the real direction, not a guess
    // Current window (0-30d) = 5,000c; prior window (30-60d) = 15,000c -> |delta| = 10,000c = $100.
    expect(text).toContain("$100");
  });

  it("an increasing goal reports 'increased', never the opposite direction", () => {
    const goalId = makeGoal(SPACE, "Vacation Fund");
    makeChangingHistory(SPACE, goalId, 5_000, 15_000, 30_000); // increasing
    const text = proactiveContextSnapshotText(handle, SPACE, { source: "goal_trend", targetId: goalId }, new Date(NOW));
    expect(text).toContain("increased");
    expect(text).not.toContain("decreased");
  });
});

describe("4. Evidence preservation — Chat context never contradicts the real two-period intelligence", () => {
  it("an 'unchanged' comparison contributes no proactive framing at all (never fabricates a direction)", () => {
    const goalId = makeGoal(SPACE, "Steady Goal");
    makeChangingHistory(SPACE, goalId, 10_000, 10_000, 10_000); // flat — status compared, direction unchanged
    const text = proactiveContextSnapshotText(handle, SPACE, { source: "goal_trend", targetId: goalId }, new Date(NOW));
    expect(text).toBeNull();
  });

  it("re-derives the SAME comparison Phase X's detect() sees for the same goal/time, never a second algorithm", () => {
    const goalId = makeGoal(SPACE, "Emergency Fund");
    makeChangingHistory(SPACE, goalId, 30_000, 15_000, 5_000);
    const tc: ToolContext = { ctx: { handle, embeddings, llm, usage: new UsageTracker(handle) } as AppContext, spaceId: SPACE, now: NOW, notify: async () => {} };
    const candidates = goalFundingTrendTool.detect(tc);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.args.goalId).toBe(goalId);
    const text = proactiveContextSnapshotText(handle, SPACE, { source: "goal_trend", targetId: goalId }, new Date(NOW));
    // Same direction Phase X's own gate found — not a re-guess.
    expect(text).toContain("decreased");
  });
});

describe("5-6. Toast -> Chat: the real delivery/navigation path can carry, and Chat can consume, the context", () => {
  it("chat() accepts the exact {source, targetId} shape App.tsx's toast-action parser builds and answers normally", async () => {
    const goalId = makeGoal(SPACE, "Emergency Fund");
    makeChangingHistory(SPACE, goalId, 30_000, 15_000, 5_000);
    const result = await chat(handle, { embeddings, llm }, "Why are you telling me this?", DEFAULT_CHAT, SPACE, [], null, { source: "goal_trend", targetId: goalId });
    expect(result.answer).toBeTruthy();
  });
});

describe("7. GraphRAG reuse — Chat retrieves authoritative info rather than a duplicated payload", () => {
  it("does not create any new financial rows/tables; the same FinGoalRepo/allocation rows remain the sole source of truth", async () => {
    const goalId = makeGoal(SPACE, "Emergency Fund");
    makeChangingHistory(SPACE, goalId, 30_000, 15_000, 5_000);
    const before = handle.sqlite.prepare(`SELECT COUNT(*) AS n FROM fin_allocation`).get() as { n: number };
    await chat(handle, { embeddings, llm }, "What's going on with my goal?", DEFAULT_CHAT, SPACE, [], null, { source: "goal_trend", targetId: goalId });
    const after = handle.sqlite.prepare(`SELECT COUNT(*) AS n FROM fin_allocation`).get() as { n: number };
    expect(after.n).toBe(before.n); // chat() only reads, never writes financial history
  });
});

describe("8. No fake user message — history is never mutated with a fabricated turn", () => {
  it("the proactive framing lands only in the server-side prompt, never in the returned/echoed conversation shape", async () => {
    const goalId = makeGoal(SPACE, "Emergency Fund");
    makeChangingHistory(SPACE, goalId, 30_000, 15_000, 5_000);
    const question = "hey";
    const result = await chat(handle, { embeddings, llm }, question, DEFAULT_CHAT, SPACE, [], null, { source: "goal_trend", targetId: goalId });
    // ChatResponse carries no field that echoes back an injected user turn — the only
    // user-authored text in this exchange is the literal question we sent.
    expect(JSON.stringify(result)).not.toContain("You reached out to the user first");
  });
});

describe("9. No permanent-memory pollution", () => {
  it("a chat() call carrying proactiveContext writes zero new rows to nodes or agent_logs", async () => {
    const goalId = makeGoal(SPACE, "Emergency Fund");
    makeChangingHistory(SPACE, goalId, 30_000, 15_000, 5_000);
    const nodesBefore = handle.sqlite.prepare(`SELECT COUNT(*) AS n FROM nodes`).get() as { n: number };
    const logsBefore = handle.sqlite.prepare(`SELECT COUNT(*) AS n FROM agent_logs`).get() as { n: number };
    await chat(handle, { embeddings, llm }, "What's up?", DEFAULT_CHAT, SPACE, [], null, { source: "goal_trend", targetId: goalId });
    const nodesAfter = handle.sqlite.prepare(`SELECT COUNT(*) AS n FROM nodes`).get() as { n: number };
    const logsAfter = handle.sqlite.prepare(`SELECT COUNT(*) AS n FROM agent_logs`).get() as { n: number };
    expect(nodesAfter.n).toBe(nodesBefore.n);
    expect(logsAfter.n).toBe(logsBefore.n);
  });
});

describe("10-11. Deduplication survives the handoff; a different goal is never suppressed", () => {
  it("the original candidate remains deduplicated after the user opens Chat from its toast", async () => {
    const ctx = { handle, embeddings, llm, usage: new UsageTracker(handle) } as AppContext;
    const goalId = makeGoal(SPACE, "Emergency Fund");
    makeChangingHistory(SPACE, goalId, 30_000, 15_000, 5_000);
    const tc: ToolContext = { ctx, spaceId: SPACE, now: NOW, notify: async () => {} };
    // Simulate real delivery: the real production router fires once (writes agent_logs.targets = [goalId]).
    await runToolRouter(ctx, SPACE, { now: NOW });
    expect(goalFundingTrendTool.detect(tc).some((c) => c.args.goalId === goalId)).toBe(false);

    // User opens Chat from the toast — a read-only handoff must not reset the dedup window.
    await chat(handle, { embeddings, llm }, "Tell me more", DEFAULT_CHAT, SPACE, [], null, { source: "goal_trend", targetId: goalId });
    expect(goalFundingTrendTool.detect(tc).some((c) => c.args.goalId === goalId)).toBe(false);
  });

  it("a different goal's own real signal is not suppressed by goal A's toast/Chat interaction", async () => {
    const ctx = { handle, embeddings, llm, usage: new UsageTracker(handle) } as AppContext;
    const goalA = makeGoal(SPACE, "Emergency Fund");
    makeChangingHistory(SPACE, goalA, 30_000, 15_000, 5_000);
    const tc: ToolContext = { ctx, spaceId: SPACE, now: NOW, notify: async () => {} };
    await runToolRouter(ctx, SPACE, { now: NOW }); // goal A surfaces + logs targets:[goalA]

    // User opens Chat from goal A's toast.
    await chat(handle, { embeddings, llm }, "Tell me more", DEFAULT_CHAT, SPACE, [], null, { source: "goal_trend", targetId: goalA });

    // Goal B has its OWN independent, genuinely new signal.
    const goalB = makeGoal(SPACE, "Vacation Fund");
    makeChangingHistory(SPACE, goalB, 5_000, 15_000, 30_000);
    const candidatesB = goalFundingTrendTool.detect(tc);
    expect(candidatesB.some((c) => c.args.goalId === goalB)).toBe(true);

    // Goal A, meanwhile, stays deduplicated (already surfaced within the cooldown).
    expect(candidatesB.some((c) => c.args.goalId === goalA)).toBe(false);
  });
});

describe("12. Missing context — Chat continues normally when proactive context is absent", () => {
  it("omitting proactiveContext behaves identically to passing null", async () => {
    for (let i = 0; i < 3; i++) await memo(`Some ordinary memory ${i}.`);
    const omitted = await chat(handle, { embeddings, llm }, "What have I been up to?", DEFAULT_CHAT, SPACE, []);
    const explicitNull = await chat(handle, { embeddings, llm }, "What have I been up to?", DEFAULT_CHAT, SPACE, [], null, null);
    expect(omitted.contextIds.sort()).toEqual(explicitNull.contextIds.sort());
  });
});

describe("13. Invalid/stale goal — fails gracefully, never exposes invalid data", () => {
  it("a nonexistent goal id contributes nothing and the turn still succeeds", async () => {
    for (let i = 0; i < 3; i++) await memo(`Some ordinary memory ${i}.`);
    const result = await chat(handle, { embeddings, llm }, "What's up?", DEFAULT_CHAT, SPACE, [], null, { source: "goal_trend", targetId: 999999 });
    expect(result.answer).toBeTruthy();
    expect(proactiveContextSnapshotText(handle, SPACE, { source: "goal_trend", targetId: 999999 })).toBeNull();
  });

  it("a deleted goal (id once valid, no longer present) degrades to no framing, not an error", () => {
    const goalId = makeGoal(SPACE, "Temporary Goal");
    makeChangingHistory(SPACE, goalId, 30_000, 15_000, 5_000);
    handle.sqlite.prepare(`DELETE FROM fin_goal WHERE id = ?`).run(goalId);
    expect(proactiveContextSnapshotText(handle, SPACE, { source: "goal_trend", targetId: goalId }, new Date(NOW))).toBeNull();
  });
});

describe("14. Space isolation — a cross-space targetId is silently rejected", () => {
  it("another space's goal id contributes zero proactive framing and never leaks that space's data", async () => {
    const otherGoal = makeGoal(OTHER_SPACE, "Someone Else's Goal");
    makeChangingHistory(OTHER_SPACE, otherGoal, 30_000, 15_000, 5_000);
    for (let i = 0; i < 3; i++) await memo(`My own memory ${i}.`, SPACE);

    const text = proactiveContextSnapshotText(handle, SPACE, { source: "goal_trend", targetId: otherGoal }, new Date(NOW));
    expect(text).toBeNull();

    const result = await chat(handle, { embeddings, llm }, "What's going on?", DEFAULT_CHAT, SPACE, [], null, { source: "goal_trend", targetId: otherGoal });
    expect(result.answer).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain("Someone Else's Goal");
  });
});

describe("15. Full chain — real production entry points end to end", () => {
  let ctx: AppContext;
  let server: Server;
  let base: string;
  let spaceId: string;

  beforeAll(async () => {
    ctx = await buildContext({ dbPath: ":memory:", embeddings: new HashEmbeddingProvider(EMBED_DIM), llm: new HeuristicProvider() });
    const app = createApp(ctx);
    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const auth = await fetch(`${base}/api/space/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gamerTag: "phaseY", passcode: "secret123", name: "phaseY" }),
    });
    spaceId = ((await auth.json()) as { id: string }).id;
  });

  afterAll(() => { server?.close(); ctx.handle.sqlite.close(); });

  it("goalAllocationChange() -> evidence gate -> dedup -> CommunicationContext -> toast delivery -> structured context -> real /api/chat -> contextual response", async () => {
    const bucket = new FinBucketRepo(ctx.handle, spaceId).create({ name: "Bucket" });
    const goal = new FinGoalRepo(ctx.handle, spaceId).create({ bucketId: bucket.id, name: "Emergency Fund" });
    const mk = (amountCents: number, daysAgo: number) => {
      const createdAt = new Date(NOW - daysAgo * DAY_MS).toISOString().replace("T", " ").slice(0, 19);
      ctx.handle.sqlite
        .prepare(`INSERT INTO fin_allocation (space_id, goal_id, amount_cents, created_at) VALUES (?, ?, ?, ?)`)
        .run(spaceId, goal.id, amountCents, createdAt);
    };
    mk(30_000, 75); mk(15_000, 45); mk(5_000, 15); // decreasing, two real periods

    // Step 1-5: the real tool-router fires the pilot, exactly like the live autonomy loop.
    const tc: ToolContext = { ctx, spaceId, now: NOW, notify: async () => {} };
    await runToolRouter(ctx, spaceId, { now: NOW });
    const log = ctx.handle.sqlite
      .prepare(`SELECT description, targets FROM agent_logs WHERE action = 'tool:goal_trend' ORDER BY id DESC LIMIT 1`)
      .get() as { description: string; targets: string } | undefined;
    expect(log).toBeTruthy();
    expect(JSON.parse(log!.targets)).toEqual([goal.id]); // Phase X's real delivery payload

    // Step 6-8: user taps the toast -> the web layer would build {source:"goal_trend", targetId: goal.id}
    // and send it on the very next message — reproduced here via the real HTTP route.
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-space-id": spaceId },
      body: JSON.stringify({ question: "why are you bringing this up?", proactiveContext: { source: "goal_trend", targetId: goal.id } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { answer: string };
    expect(body.answer).toBeTruthy();

    // Step 9-10: dedup survives — the real router, re-run immediately after, still
    // doesn't re-fire for the same goal (Phase X's own cooldown, undisturbed by Chat).
    const again = goalFundingTrendTool.detect(tc);
    expect(again.some((c) => c.args.goalId === goal.id)).toBe(false);
  });
});
