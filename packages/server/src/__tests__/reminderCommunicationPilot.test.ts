import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import type { ToolContext } from "../agent/tools/types.js";
import { reminderTool } from "../agent/tools/reminder.js";
import { InteractionPreferencesRepo } from "../repositories/interactionPreferences.repo.js";

/**
 * Phase U — reminder communication pilot (docs/specs/soumaya-proactive-communication-migration-wave2.md).
 * Wave 2's first consumer. detect()'s due/grace-window logic is UNCHANGED — these tests exercise
 * run()'s communication-aware message construction, same shape as billRisk/check_in's own pilots.
 */

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const NOW = Date.parse("2026-01-10T12:00:00Z");

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

const tc = (spaceId = "s1", now = NOW): ToolContext => ({ ctx, spaceId, now, notify: async () => {} });

function makeReminder(spaceId: string, label: string, remindAtIso: string): number {
  const info = handle.sqlite
    .prepare(`INSERT INTO nodes (space_id, label, type, content, remind_at) VALUES (?, ?, 'knowledge', ?, ?)`)
    .run(spaceId, label, label, remindAtIso);
  return Number(info.lastInsertRowid);
}

describe("reminder communication pilot", () => {
  it("1. on-time, no preferences, first reminder today: matches the original baseline wording", async () => {
    const id = makeReminder("s1", "Call the dentist", new Date(NOW - 30_000).toISOString());
    const res = await reminderTool.run(tc(), { nodeId: id });
    expect(res.ok).toBe(true);
    expect(res.message).toBe('⏰ Reminder: "Call the dentist"');
  });

  it("2. learned 'concise' verbosity preference shortens it", async () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.6, 3, new Date().toISOString());
    const id = makeReminder("s1", "Call the dentist", new Date(NOW - 30_000).toISOString());
    const res = await reminderTool.run(tc(), { nodeId: id });
    expect(res.message).toBe('⏰ Call the dentist');
  });

  it("3. genuine lateness (overdue by hours) is restored into the wording instead of discarded", async () => {
    const id = makeReminder("s1", "Water the plants", new Date(NOW - 5 * 3_600_000).toISOString());
    const res = await reminderTool.run(tc(), { nodeId: id });
    expect(res.message).toMatch(/Running a little behind/);
    expect(res.message).toMatch(/5h overdue/);
  });

  it("4. overdue-by-days uses a day unit, not a huge hour count", async () => {
    const id = makeReminder("s1", "Renew passport", new Date(NOW - 2 * 86_400_000).toISOString());
    const res = await reminderTool.run(tc(), { nodeId: id });
    expect(res.message).toMatch(/2d overdue/);
  });

  it("5. a same-day repeat (another reminder already fired today) acknowledges it without changing when THIS one fires", async () => {
    handle.sqlite
      .prepare(`INSERT INTO agent_logs (space_id, action, description, targets, created_at) VALUES ('s1', 'tool:fire_reminder', 'earlier', '[]', ?)`)
      .run(new Date(NOW - 3_600_000).toISOString());
    const id = makeReminder("s1", "Buy milk", new Date(NOW - 30_000).toISOString());
    const res = await reminderTool.run(tc(), { nodeId: id });
    expect(res.message).toBe('⏰ Another one: "Buy milk"');
  });

  it("6. absent preference/repetition data behaves like a fresh space (no throw, default wording)", async () => {
    const id = makeReminder("s1", "Feed the cat", new Date(NOW - 30_000).toISOString());
    const res = await reminderTool.run(tc(), { nodeId: id });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/Feed the cat/);
  });

  it("7. authenticated space isolation — another space's preference never leaks into this reminder", async () => {
    new InteractionPreferencesRepo(handle, "other-space").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    const id = makeReminder("s1", "Call the dentist", new Date(NOW - 30_000).toISOString());
    const res = await reminderTool.run(tc("s1"), { nodeId: id });
    expect(res.message).toBe('⏰ Reminder: "Call the dentist"');
  });

  it("8. detect()'s due/grace-window logic is completely unaffected by any communication context", () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    makeReminder("s1", "Not due yet", new Date(NOW + 3_600_000).toISOString()); // future — must not fire
    makeReminder("s1", "Due now", new Date(NOW - 30_000).toISOString());
    const invocations = reminderTool.detect(tc());
    expect(invocations).toHaveLength(1);
  });

  it("9. a stale (>3d overdue) reminder is still silently retired, not communicated — GRACE_MS untouched", async () => {
    const id = makeReminder("s1", "Long forgotten", new Date(NOW - 4 * 86_400_000).toISOString());
    const res = await reminderTool.run(tc(), { nodeId: id });
    expect(res.ok).toBe(true);
    expect(res.message).toBeUndefined();
    expect(res.summary).toMatch(/retired stale reminder/);
  });
});
