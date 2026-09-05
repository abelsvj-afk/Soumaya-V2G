import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import type { ToolContext } from "../agent/tools/types.js";
import { orphanTool } from "../agent/tools/orphan.js";
import { InteractionPreferencesRepo } from "../repositories/interactionPreferences.repo.js";

/**
 * Phase U — orphan communication pilot (docs/specs/soumaya-proactive-communication-migration-wave2.md).
 * detect()'s selection query (importance/age ranking) is UNCHANGED — these tests exercise run()'s
 * communication-aware message construction, now restoring the age/importance magnitude detect()
 * already used to CHOOSE the orphan but previously discarded before building the message.
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

function makeOrphan(spaceId: string, label: string, daysAgo: number, importance: number): number {
  const createdAt = new Date(NOW - daysAgo * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  const info = handle.sqlite
    .prepare(`INSERT INTO nodes (space_id, label, type, content, importance, created_at) VALUES (?, ?, 'knowledge', ?, ?, ?)`)
    .run(spaceId, label, label, importance, createdAt);
  return Number(info.lastInsertRowid);
}

describe("orphan communication pilot", () => {
  it("1. a recent, unremarkable orphan matches the original baseline wording exactly", async () => {
    const id = makeOrphan("s1", "A stray thought", 3, 0.4);
    const res = await orphanTool.run(tc(), { nodeId: id });
    expect(res.message).toBe('🌟 One memory is drifting unconnected: "A stray thought". Want to link it into your galaxy?');
  });

  it("2. a long-drifting orphan (>= 14 days) surfaces the age that was previously computed but discarded", async () => {
    const id = makeOrphan("s1", "Old idea", 20, 0.4);
    const res = await orphanTool.run(tc(), { nodeId: id });
    expect(res.message).toMatch(/gone 20 days without a single connection/);
  });

  it("3. a significant (importance >= 0.7) orphan names that it seems to matter", async () => {
    const id = makeOrphan("s1", "Important realization", 3, 0.85);
    const res = await orphanTool.run(tc(), { nodeId: id });
    expect(res.message).toMatch(/this one seems to matter/);
  });

  it("4. old AND significant combines both clauses into one sentence, not two separate messages", async () => {
    const id = makeOrphan("s1", "Big forgotten idea", 30, 0.9);
    const res = await orphanTool.run(tc(), { nodeId: id });
    expect(res.message).toMatch(/this one seems to matter, and it's gone 30 days/);
  });

  it("5. learned 'concise' verbosity preference wins outright over any magnitude clause", async () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.6, 3, new Date().toISOString());
    const id = makeOrphan("s1", "Big forgotten idea", 30, 0.9);
    const res = await orphanTool.run(tc(), { nodeId: id });
    expect(res.message).toBe('🌟 Unlinked: "Big forgotten idea".');
  });

  it("6. a recent orphan nudge acknowledges the repeat without changing the daily cap", async () => {
    handle.sqlite
      .prepare(`INSERT INTO agent_logs (space_id, action, description, targets, created_at) VALUES ('s1', 'tool:surface_orphan', 'earlier', '[]', ?)`)
      .run(new Date(NOW - 86_400_000).toISOString());
    const id = makeOrphan("s1", "Another stray", 3, 0.4);
    const res = await orphanTool.run(tc(), { nodeId: id });
    expect(res.message).toMatch(/^🌟 Another one drifting/);
  });

  it("7. absent preference/repetition data behaves like a fresh space (no throw, default wording)", async () => {
    const id = makeOrphan("s1", "A stray thought", 3, 0.4);
    const res = await orphanTool.run(tc(), { nodeId: id });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/A stray thought/);
  });

  it("8. authenticated space isolation — another space's preference never leaks into this orphan nudge", async () => {
    new InteractionPreferencesRepo(handle, "other-space").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    const id = makeOrphan("s1", "A stray thought", 3, 0.4);
    const res = await orphanTool.run(tc("s1"), { nodeId: id });
    expect(res.message).toBe('🌟 One memory is drifting unconnected: "A stray thought". Want to link it into your galaxy?');
  });

  it("9. detect()'s selection query is completely unaffected by any communication context", () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    makeOrphan("s1", "Too fresh to count", 0, 0.9); // under MIN_AGE_MS — must not qualify
    const oldId = makeOrphan("s1", "Qualifies", 5, 0.4);
    const invocations = orphanTool.detect(tc());
    expect(invocations).toHaveLength(1);
    expect(invocations[0]!.args.nodeId).toBe(oldId);
  });
});
