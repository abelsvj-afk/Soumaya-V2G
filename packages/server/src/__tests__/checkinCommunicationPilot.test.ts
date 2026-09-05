import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import type { ToolContext } from "../agent/tools/types.js";
import { checkinTool } from "../agent/tools/checkin.js";
import { InteractionPreferencesRepo } from "../repositories/interactionPreferences.repo.js";

/**
 * Phase T — check_in communication pilot (docs/specs/soumaya-proactive-communication-migration.md).
 * The non-financial consumer proving communication/context.ts generalizes beyond billRisk. Mirrors
 * billRiskCommunicationPilot.test.ts's own scenario shape: detect() is UNCHANGED (covered
 * separately by run() calls with fixed args, same as billRisk.test.ts's own pattern), these tests
 * cover run()'s communication-aware message construction.
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

function makeMemory(spaceId: string, label: string, daysAgo: number, emotionalWeight: number): void {
  const createdAt = new Date(NOW - daysAgo * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  handle.sqlite
    .prepare(`INSERT INTO nodes (space_id, label, type, content, emotional_weight, created_at) VALUES (?, ?, 'knowledge', ?, ?, ?)`)
    .run(spaceId, label, label, emotionalWeight, createdAt);
}

describe("check_in communication pilot", () => {
  it("1. ordinary heavy check-in — no preferences, no repetition: matches the original baseline wording", async () => {
    const res = await checkinTool.run(tc(), { kind: "heavy", text: "" });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/no pressure/);
  });

  it("2. learned 'concise' verbosity preference gets the short form", async () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.6, 3, new Date().toISOString());
    const res = await checkinTool.run(tc(), { kind: "heavy", text: "" });
    expect(res.message!.length).toBeLessThan(40);
  });

  it("3. a DIFFERENT preference (directness) gets different wording than concise, and than the default", async () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("directness", "very direct", 0.6, 3, new Date().toISOString());
    const res = await checkinTool.run(tc(), { kind: "heavy", text: "" });
    expect(res.message).not.toMatch(/no pressure/);
    expect(res.message).toMatch(/Want to talk it through\?/);
  });

  it("4. repeated check-in (fired within the last week) acknowledges repetition instead of re-explaining", async () => {
    handle.sqlite
      .prepare(`INSERT INTO agent_logs (space_id, action, description, targets, created_at) VALUES ('s1', 'tool:check_in', 'earlier check-in', '[]', ?)`)
      .run(new Date(NOW - 2 * 86_400_000).toISOString());
    const res = await checkinTool.run(tc(), { kind: "heavy", text: "" });
    expect(res.message).toMatch(/Still a heavy stretch/);
  });

  it("5. contradiction kind, no preferences: matches the original baseline wording", async () => {
    const res = await checkinTool.run(tc(), { kind: "contradiction", text: "loves solitude vs. hates being alone" });
    expect(res.message).toMatch(/Want to reconcile them together\?/);
    expect(res.message).toMatch(/loves solitude vs\. hates being alone/);
  });

  it("6. contradiction kind + concise preference: shorter form, same underlying text preserved verbatim", async () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.6, 3, new Date().toISOString());
    const res = await checkinTool.run(tc(), { kind: "contradiction", text: "loves solitude vs. hates being alone" });
    expect(res.message).toMatch(/loves solitude vs\. hates being alone/);
    expect(res.message).not.toMatch(/Want to reconcile them together\?/);
  });

  it("7. contradiction kind + directness preference: different wording than the default", async () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("directness", "very direct", 0.6, 3, new Date().toISOString());
    const res = await checkinTool.run(tc(), { kind: "contradiction", text: "loves solitude vs. hates being alone" });
    expect(res.message).toMatch(/Contradiction:/);
  });

  it("8. absent preference data behaves exactly like a fresh space (no throw, default wording)", async () => {
    const res = await checkinTool.run(tc(), { kind: "heavy", text: "" });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/heavy/);
  });

  it("9. authenticated space isolation — another space's learned preference never leaks into this one's check-in", async () => {
    new InteractionPreferencesRepo(handle, "other-space").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    const res = await checkinTool.run(tc("s1"), { kind: "heavy", text: "" });
    expect(res.message).toMatch(/no pressure/);
  });

  it("10. detect()'s own heaviness/contradiction reasoning is completely unaffected by any communication context", () => {
    // Same shape as billRiskCommunicationPilot.test.ts's own detect()-unaffected case: seed
    // preference data that only run()'s message construction should ever consult, then confirm
    // detect() still fires (or doesn't) purely off its own emotional-weight math, unchanged.
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    for (let i = 0; i < 6; i++) makeMemory("s1", `hard day ${i}`, i + 1, -0.6); // not "today" — real signal
    const invocations = checkinTool.detect(tc());
    expect(invocations).toHaveLength(1);
    expect(invocations[0]!.args.kind).toBe("heavy");
  });
});
