import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import type { LlmProvider } from "../llm/adapter.js";
import { UsageTracker } from "../usage.js";
import type { ToolContext } from "../agent/tools/types.js";
import { weeklyReviewTool } from "../agent/tools/weeklyReview.js";
import { InteractionPreferencesRepo } from "../repositories/interactionPreferences.repo.js";
import { setSpaceSoul } from "../identity.js";

/**
 * Phase V — weekly_review LLM communication integration
 * (docs/specs/soumaya-weekly-review-communication-integration.md). Unlike every other
 * pilot (billRisk/check_in/daily_digest/reminder/orphan/review_nudge/finance_freshness),
 * weekly_review's "communication" step is ALREADY an LLM call (`generateDailyLog`), not
 * a deterministic template. These tests use a fake LLM provider that captures the exact
 * arguments `run()` passes to it, proving CommunicationContext reaches the SAME existing
 * call rather than asserting on literal LLM-generated prose (which a real provider would
 * produce non-deterministically).
 */

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const NOW = Date.parse("2026-01-10T00:00:00Z");

function fakeLlm(generateDailyLog = vi.fn(async (_n: unknown, _a: unknown, _p?: string, _s?: string) => "a fake voiced reflection")): LlmProvider {
  return {
    available: true,
    answer: vi.fn(),
    extract: vi.fn(),
    linkScore: vi.fn(),
    summarizeSector: vi.fn(),
    generateDailyLog,
  } as unknown as LlmProvider;
}

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

const tc = (llm: LlmProvider, spaceId = "s1", now = NOW): ToolContext => {
  ctx = { handle, embeddings, llm, usage: new UsageTracker(handle) } as AppContext;
  return { ctx, spaceId, now, notify: async () => {} };
};

function makeMemory(spaceId: string, label: string, daysAgo: number, opts: { emotionalWeight?: number; importance?: number } = {}): void {
  const createdAt = new Date(NOW - daysAgo * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  handle.sqlite
    .prepare(
      `INSERT INTO nodes (space_id, label, type, content, emotional_weight, importance, created_at) VALUES (?, ?, 'knowledge', ?, ?, ?, ?)`,
    )
    .run(spaceId, label, label, opts.emotionalWeight ?? 0, opts.importance ?? 0.4, createdAt);
}

function seedWeek(spaceId: string, n = 5): void {
  for (let i = 0; i < n; i++) makeMemory(spaceId, `memory ${i}`, i);
}

describe("weekly_review LLM communication integration", () => {
  it("1. identity: Soumaya's soul reaches generateDailyLog's soul parameter (previously always undefined)", async () => {
    setSpaceSoul(handle.sqlite, "s1", "A warm, curious companion.");
    seedWeek("s1");
    const spy = vi.fn(async (_n: unknown, _a: unknown, _p?: string, _s?: string) => "voiced");
    await weeklyReviewTool.run(tc(fakeLlm(spy)), {});
    expect(spy).toHaveBeenCalledTimes(1);
    const [, , , soul] = spy.mock.calls[0]!;
    expect(soul).toBe("A warm, curious companion.");
  });

  it("2. preferences: a learned 'concise' preference reaches the persona argument", async () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.6, 3, new Date().toISOString());
    seedWeek("s1");
    const spy = vi.fn(async (_n: unknown, _a: unknown, _p?: string, _s?: string) => "voiced");
    await weeklyReviewTool.run(tc(fakeLlm(spy)), {});
    const [, , persona] = spy.mock.calls[0]!;
    expect(persona).toContain("verbosity=concise");
  });

  it("3. neutral user: no preference evidence produces a persona with no preference clause", async () => {
    seedWeek("s1");
    const spy = vi.fn(async (_n: unknown, _a: unknown, _p?: string, _s?: string) => "voiced");
    await weeklyReviewTool.run(tc(fakeLlm(spy)), {});
    const [, , persona] = spy.mock.calls[0]!;
    expect(persona === undefined || !String(persona).includes("Learned communication preferences")).toBe(true);
  });

  it("4. emotional context: a real recurring pattern adds a gentle-tone instruction to actions, without naming the pattern", async () => {
    for (let i = 0; i < 10; i++) makeMemory("s1", `heavy ${i}`, i, { emotionalWeight: -0.6 });
    const spy = vi.fn(async (_n: unknown, _a: unknown, _p?: string, _s?: string) => "voiced");
    await weeklyReviewTool.run(tc(fakeLlm(spy)), {});
    const [, actions] = spy.mock.calls[0]!;
    const joined = (actions as string[]).join(" ");
    expect(joined).toMatch(/lead gently/i);
    expect(joined.toLowerCase()).not.toMatch(/stress cycle|burnout|downswing/);
  });

  it("5. no relevant emotional context: actions carry no gentle-tone instruction", async () => {
    seedWeek("s1"); // ordinary, non-heavy week
    const spy = vi.fn(async (_n: unknown, _a: unknown, _p?: string, _s?: string) => "voiced");
    await weeklyReviewTool.run(tc(fakeLlm(spy)), {});
    const [, actions] = spy.mock.calls[0]!;
    expect((actions as string[]).join(" ")).not.toMatch(/lead gently/i);
  });

  it("6. intelligence preservation: the week's actual memory content (forVoice) is unaffected by any communication context", async () => {
    setSpaceSoul(handle.sqlite, "s1", "Some soul");
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.6, 3, new Date().toISOString());
    seedWeek("s1", 4);
    const spy = vi.fn(async (_n: unknown, _a: unknown, _p?: string, _s?: string) => "voiced");
    await weeklyReviewTool.run(tc(fakeLlm(spy)), {});
    const [forVoice] = spy.mock.calls[0]!;
    expect(forVoice).toHaveLength(4);
    expect((forVoice as { label: string }[]).map((m) => m.label).sort()).toEqual(
      ["memory 0", "memory 1", "memory 2", "memory 3"].sort(),
    );
  });

  it("7. no duplicate/new LLM calls: exactly one generateDailyLog call per run(), regardless of context richness", async () => {
    setSpaceSoul(handle.sqlite, "s1", "Some soul");
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.6, 3, new Date().toISOString());
    for (let i = 0; i < 10; i++) makeMemory("s1", `heavy ${i}`, i, { emotionalWeight: -0.6 });
    const spy = vi.fn(async (_n: unknown, _a: unknown, _p?: string, _s?: string) => "voiced");
    await weeklyReviewTool.run(tc(fakeLlm(spy)), {});
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("8. LLM failure: existing heuristic fallback remains authoritative, no crash — and by construction (buildCommunicationContext is called INSIDE this same try block, before the LLM call), a CommunicationContext failure would be caught identically, never breaking the proactive function", async () => {
    setSpaceSoul(handle.sqlite, "s1", "Some soul"); // context IS built successfully here, then the LLM call fails
    seedWeek("s1");
    const spy = vi.fn(async (_n: unknown, _a: unknown, _p?: string, _s?: string) => {
      throw new Error("provider down");
    });
    const res = await weeklyReviewTool.run(tc(fakeLlm(spy)), {});
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/Looking back on your week/);
  });

  it("9. space isolation: another space's soul/preferences never leak into this review", async () => {
    setSpaceSoul(handle.sqlite, "other-space", "A totally different soul.");
    new InteractionPreferencesRepo(handle, "other-space").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    seedWeek("s1");
    const spy = vi.fn(async (_n: unknown, _a: unknown, _p?: string, _s?: string) => "voiced");
    await weeklyReviewTool.run(tc(fakeLlm(spy), "s1"), {});
    const [, , persona, soul] = spy.mock.calls[0]!;
    expect(soul).not.toBe("A totally different soul.");
    expect(persona === undefined || !String(persona).includes("concise")).toBe(true);
  });

  it("10. offline/heuristic path (no cloud LLM available) never touches CommunicationContext or generateDailyLog", async () => {
    seedWeek("s1");
    const spy = vi.fn(async (_n: unknown, _a: unknown, _p?: string, _s?: string) => "voiced");
    const offlineLlm = { ...fakeLlm(spy), available: false } as LlmProvider;
    const res = await weeklyReviewTool.run(tc(offlineLlm), {});
    expect(spy).not.toHaveBeenCalled();
    expect(res.message).toMatch(/Looking back on your week/);
  });

  it("11. detect()'s rate-limit/minimum-memories logic is completely unaffected by any communication context", () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    seedWeek("s1", 2); // below MIN_MEMORIES
    expect(weeklyReviewTool.detect(tc(fakeLlm()))).toHaveLength(0);
    seedWeek("s1", 5); // now enough
    expect(weeklyReviewTool.detect(tc(fakeLlm()))).toHaveLength(1);
  });
});
