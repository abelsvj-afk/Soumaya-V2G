import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import type { ToolContext } from "../agent/tools/types.js";
import { financeFreshnessTool } from "../agent/tools/financeFreshness.js";
import { InteractionPreferencesRepo } from "../repositories/interactionPreferences.repo.js";

/**
 * Phase U — finance_freshness communication pilot
 * (docs/specs/soumaya-proactive-communication-migration-wave2.md). detect()'s staleness
 * thresholds/math are UNCHANGED (already covered by financeFreshness.test.ts) — these tests
 * cover run()'s communication-aware message construction, including the two real pre-existing
 * gaps closed here: the assets-only branch now surfaces `assetDays` (previously discarded
 * entirely), and a never-snapshotted asset (assetDays===0, a placeholder) reads differently
 * from one snapshotted 31 days ago.
 */

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const NOW = Date.parse("2026-03-15T00:00:00Z");

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

const tc = (spaceId = "s1", now = NOW): ToolContext => ({ ctx, spaceId, now, notify: async () => {} });

describe("finance_freshness communication pilot", () => {
  it("1. income-only stale, no preferences: matches the original baseline wording exactly (already used incomeDays correctly)", async () => {
    const res = await financeFreshnessTool.run(tc(), { incomeStale: true, assetStale: false, incomeDays: 25, assetDays: 0 });
    expect(res.message).toBe(
      "📈 It's been 25 days since your last income entry — got a pay stub to add? Keeping this current is what makes your income line mean something.",
    );
  });

  it("2. assets-only stale, genuinely snapshotted-but-old: assetDays magnitude is now restored (previously always discarded)", async () => {
    const res = await financeFreshnessTool.run(tc(), { incomeStale: false, assetStale: true, incomeDays: 0, assetDays: 45 });
    expect(res.message).toMatch(/haven't been updated in 45 days/);
  });

  it("3. assets-only stale, NEVER snapshotted (assetDays placeholder 0): reads differently from a genuinely-45-day-old snapshot", async () => {
    const res = await financeFreshnessTool.run(tc(), { incomeStale: false, assetStale: true, incomeDays: 0, assetDays: 0 });
    expect(res.message).toMatch(/never been snapshotted/);
    expect(res.message).not.toMatch(/haven't been updated in 0 days/);
  });

  it("4. combined stale: assetDays magnitude reaches the combined message too", async () => {
    const res = await financeFreshnessTool.run(tc(), { incomeStale: true, assetStale: true, incomeDays: 30, assetDays: 40 });
    expect(res.message).toMatch(/income hasn't been logged in 30 days/);
    expect(res.message).toMatch(/haven't been updated in 40 days/);
  });

  it("5. learned 'concise' verbosity preference compacts the message and still carries both magnitudes", async () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.6, 3, new Date().toISOString());
    const res = await financeFreshnessTool.run(tc(), { incomeStale: true, assetStale: true, incomeDays: 30, assetDays: 40 });
    expect(res.message).toBe("📈 income 30d stale, assets 40d stale.");
  });

  it("6. a recurring nudge (fired within the last 21 days) acknowledges it without changing the weekly cadence cap", async () => {
    handle.sqlite
      .prepare(`INSERT INTO agent_logs (space_id, action, description, targets, created_at) VALUES ('s1', 'tool:finance_freshness', 'earlier', '[]', ?)`)
      .run(new Date(NOW - 10 * 86_400_000).toISOString());
    const res = await financeFreshnessTool.run(tc(), { incomeStale: true, assetStale: false, incomeDays: 25, assetDays: 0 });
    expect(res.message).toMatch(/^📈 Still nothing new/);
  });

  it("7. absent preference/repetition data behaves like a fresh space (no throw, default wording)", async () => {
    const res = await financeFreshnessTool.run(tc(), { incomeStale: true, assetStale: false, incomeDays: 25, assetDays: 0 });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/25 days/);
  });

  it("8. authenticated space isolation — another space's preference never leaks into this nudge", async () => {
    new InteractionPreferencesRepo(handle, "other-space").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    const res = await financeFreshnessTool.run(tc("s1"), { incomeStale: true, assetStale: false, incomeDays: 25, assetDays: 0 });
    expect(res.message).toBe(
      "📈 It's been 25 days since your last income entry — got a pay stub to add? Keeping this current is what makes your income line mean something.",
    );
  });
});
