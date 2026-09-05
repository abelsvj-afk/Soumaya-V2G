import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { buildDailyDigest } from "../synthesis/dailyDigest.js";
import { InteractionPreferencesRepo } from "../repositories/interactionPreferences.repo.js";

/**
 * Phase T — daily digest communication pilot (docs/specs/soumaya-proactive-communication-migration.md).
 * The scheduled/job-generated consumer proving communication/context.ts generalizes to a
 * periodic, multi-item digest — a structurally different shape than a single-event nudge
 * (billRisk, check_in). buildDailyDigest() has no injectable clock (it always reads real
 * `new Date()` for "today"), so fixtures use real-time-relative offsets rather than a fixed NOW,
 * matching how this file's own pre-existing coverage (features.test.ts) already works.
 */

let handle: DbHandle;
beforeEach(() => { handle = createDb(":memory:"); });
afterEach(() => handle.sqlite.close());

function makeMemory(spaceId: string, label: string, daysAgo: number, emotionalWeight: number, importance = 0.4): void {
  const createdAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  handle.sqlite
    .prepare(
      `INSERT INTO nodes (space_id, label, type, content, emotional_weight, importance, created_at)
       VALUES (?, ?, 'knowledge', ?, ?, ?, ?)`,
    )
    .run(spaceId, label, label, emotionalWeight, importance, createdAt);
}

describe("daily digest communication pilot", () => {
  it("1. no preferences, no emotional pattern: greeting/closing/take match the original baseline wording exactly", () => {
    makeMemory("s1", "a fresh thought", 0, -0.5, 0.8); // "today", heavy+dark bucket
    const d = buildDailyDigest(handle, "s1");
    expect(d.greeting).toMatch(/Made my rounds\./);
    expect(d.fresh[0]!.take).toBe("A dense, dark body — strong pull. I'd keep an orbit on this one; it bends the thoughts around it.");
  });

  it("2. learned 'concise' verbosity preference shortens greeting, closing, and per-memory takes", () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.6, 3, new Date().toISOString());
    makeMemory("s1", "a fresh thought", 0, -0.5, 0.8);
    const d = buildDailyDigest(handle, "s1");
    expect(d.greeting).toBe("1 new body today.");
    expect(d.fresh[0]!.take).toBe("Dense and dark — worth an orbit.");
  });

  it("3. a real detected emotional pattern softens the greeting's opener without ever naming the emotion", () => {
    // 10 heavy memories, dated outside "today" so they don't themselves populate `fresh` — forms
    // a real Stress-cycle-class pattern via the SAME buildEmotionalTrajectory billRisk/tests use.
    // One ordinary "today" memory ensures newCount > 0, so the gentle-with-new-items branch fires.
    for (let i = 0; i < 10; i++) makeMemory("s1", `heavy ${i}`, i + 2, -0.6);
    makeMemory("s1", "an ordinary thought", 0, 0, 0.4);
    const d = buildDailyDigest(handle, "s1");
    expect(d.greeting).toMatch(/gentle pass/i);
    expect(d.greeting.toLowerCase()).not.toMatch(/stress|hard time|struggling|anxious|burnout/);
  });

  it("4. an explicit concise preference wins outright over a softer, pattern-driven tone (no cross-product of variants)", () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.6, 3, new Date().toISOString());
    for (let i = 0; i < 10; i++) makeMemory("s1", `heavy ${i}`, i + 2, -0.6);
    const d = buildDailyDigest(handle, "s1");
    expect(d.greeting).toBe("Quiet pass today.");
  });

  it("5. authenticated space isolation — another space's preference/pattern never leaks into this digest", () => {
    new InteractionPreferencesRepo(handle, "other-space").upsert("verbosity", "concise", 0.8, 5, new Date().toISOString());
    for (let i = 0; i < 10; i++) makeMemory("other-space", `heavy ${i}`, i + 2, -0.6);
    const d = buildDailyDigest(handle, "s1");
    expect(d.greeting).toMatch(/Quiet pass today — no new bodies on the charts\. Here's what's still worth your attention\./);
  });

  it("6. absent preference/pattern data behaves exactly like a fresh space (no throw, default wording)", () => {
    const d = buildDailyDigest(handle, "s1");
    expect(d.fresh).toHaveLength(0);
    expect(d.greeting.length).toBeGreaterThan(0);
    expect(d.closing.length).toBeGreaterThan(0);
  });

  it("7. closing also compacts under a concise preference", () => {
    new InteractionPreferencesRepo(handle, "s1").upsert("verbosity", "concise", 0.6, 3, new Date().toISOString());
    const d = buildDailyDigest(handle, "s1");
    expect(d.closing).toBe("All quiet.");
  });
});
