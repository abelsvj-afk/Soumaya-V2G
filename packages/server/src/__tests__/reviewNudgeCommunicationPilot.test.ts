import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import type { ToolContext } from "../agent/tools/types.js";
import { reviewNudgeTool } from "../agent/tools/reviewNudge.js";
import { InteractionPreferencesRepo } from "../repositories/interactionPreferences.repo.js";

/**
 * Phase U — review_nudge communication pilot (docs/specs/soumaya-proactive-communication-migration-wave2.md).
 * detect()'s dueForReview() ranking is UNCHANGED — these tests exercise run()'s communication-aware
 * message construction, now explaining WHY a recall was worth asking for (faded, never-reviewed,
 * or significant) instead of a single fixed sentence regardless of the underlying evidence.
 */

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const NOW = Date.parse("2026-01-10T00:00:00Z");

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

const tc = (spaceId = "s1", now = NOW): ToolContext => ({ ctx, spaceId, now, notify: async () => {} });

function makeReviewable(
  spaceId: string,
  label: string,
  opts: { importance?: number; reviewCount?: number; lastReviewedDaysAgo?: number; intervalDays?: number; createdDaysAgo?: number } = {},
): number {
  const createdAt = new Date(NOW - (opts.createdDaysAgo ?? 30) * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  const lastReviewedAt = opts.lastReviewedDaysAgo != null ? new Date(NOW - opts.lastReviewedDaysAgo * 86_400_000).toISOString().replace("T", " ").slice(0, 19) : null;
  const info = handle.sqlite
    .prepare(
      `INSERT INTO nodes (space_id, label, type, content, importance, created_at, review_count, last_reviewed_at, review_interval_days)
       VALUES (?, ?, 'knowledge', ?, ?, ?, ?, ?, ?)`,
    )
    .run(spaceId, label, label, opts.importance ?? 0.4, createdAt, opts.reviewCount ?? 0, lastReviewedAt, opts.intervalDays ?? 1);
  return Number(info.lastInsertRowid);
}

describe("review_nudge communication pilot", () => {
  it("1. a returning, moderately-due, unremarkable memory matches the original baseline wording exactly", async () => {
    // reviewCount > 0 (returning), strength moderate (reviewed recently relative to a long interval),
    // importance below the 'significant' bar — the one combination with no reason clause.
    const id = makeReviewable("s1", "A settled fact", { reviewCount: 3, lastReviewedDaysAgo: 1, intervalDays: 10, importance: 0.4 });
    const res = await reviewNudgeTool.run(tc(), { nodeId: id });
    expect(res.message).toBe('🧠 Do you still remember what you noted about "A settled fact"? Take a moment to recall it — then open it to refresh.');
  });

  it("2. a genuinely faded memory (strength near the floor) explains why, without inventing a diagnosis", async () => {
    const id = makeReviewable("s1", "Faded memory", { reviewCount: 2, lastReviewedDaysAgo: 20, intervalDays: 2, importance: 0.4 });
    const res = await reviewNudgeTool.run(tc(), { nodeId: id });
    expect(res.message).toMatch(/faded quite a bit/);
  });

  it("3. a never-reviewed memory (first-ever nudge) says so, distinct from a genuinely faded one", async () => {
    // A long interval keeps computed strength above the 'faded' floor despite never having
    // been reviewed, so this exercises the reviewCount===0 branch specifically, not strength.
    const id = makeReviewable("s1", "Never reviewed", { reviewCount: 0, importance: 0.4, createdDaysAgo: 10, intervalDays: 30 });
    const res = await reviewNudgeTool.run(tc(), { nodeId: id });
    expect(res.message).toMatch(/haven't circled back to it yet/);
  });

  it("4. a significant memory that's neither faded nor first-time names that it matters", async () => {
    const id = makeReviewable("s1", "Important recurring note", { reviewCount: 3, lastReviewedDaysAgo: 1, intervalDays: 10, importance: 0.85 });
    const res = await reviewNudgeTool.run(tc(), { nodeId: id });
    expect(res.message).toMatch(/clearly matters to you/);
  });

  it("5. learned 'concise' verbosity preference wins outright over any reason clause", async () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.6, 3, new Date().toISOString());
    const id = makeReviewable("s1", "Faded memory", { reviewCount: 2, lastReviewedDaysAgo: 20, intervalDays: 2 });
    const res = await reviewNudgeTool.run(tc(), { nodeId: id });
    expect(res.message).toBe('🧠 Recall check: "Faded memory"?');
  });

  it("6. absent preference data behaves like a fresh space (no throw, default wording)", async () => {
    const id = makeReviewable("s1", "A settled fact", { reviewCount: 3, lastReviewedDaysAgo: 1, intervalDays: 10 });
    const res = await reviewNudgeTool.run(tc(), { nodeId: id });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/A settled fact/);
  });

  it("7. authenticated space isolation — another space's preference never leaks into this nudge", async () => {
    new InteractionPreferencesRepo(handle, "other-space").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    const id = makeReviewable("s1", "A settled fact", { reviewCount: 3, lastReviewedDaysAgo: 1, intervalDays: 10 });
    const res = await reviewNudgeTool.run(tc("s1"), { nodeId: id });
    expect(res.message).toBe('🧠 Do you still remember what you noted about "A settled fact"? Take a moment to recall it — then open it to refresh.');
  });

  it("8. detect()'s dueForReview() ranking is completely unaffected by any communication context", () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    const id = makeReviewable("s1", "Due for review", { reviewCount: 0, createdDaysAgo: 10 });
    const invocations = reviewNudgeTool.detect(tc());
    expect(invocations).toHaveLength(1);
    expect(invocations[0]!.args.nodeId).toBe(id);
  });
});
