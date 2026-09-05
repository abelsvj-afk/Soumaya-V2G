import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { buildCommunicationContext, recentActionCount } from "../communication/context.js";
import { InteractionPreferencesRepo } from "../repositories/interactionPreferences.repo.js";
import { setSpaceSoul } from "../identity.js";

/**
 * Phase S — the shared communication boundary (docs/specs/soumaya-shared-communication.md).
 * Tests the ARCHITECTURAL CONTRACT (space scoping, no mutation, no LLM dependency, correct
 * reuse of already-locked functions), not exact generated prose, per the phase's own guidance.
 */

let handle: DbHandle;
beforeEach(() => { handle = createDb(":memory:"); });
afterEach(() => handle.sqlite.close());

function makeMemory(spaceId: string, label: string, daysAgo: number, emotionalWeight?: number): number {
  const createdAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  const info = handle.sqlite
    .prepare(
      `INSERT INTO nodes (space_id, label, type, content, emotional_weight, created_at)
       VALUES (?, ?, 'knowledge', ?, ?, ?)`,
    )
    .run(spaceId, label, label, emotionalWeight ?? null, createdAt);
  return Number(info.lastInsertRowid);
}

describe("buildCommunicationContext — reads existing Soumaya identity/behavior inputs", () => {
  it("reads this space's soul override when one is set", () => {
    setSpaceSoul(handle.sqlite, "s1", "Custom test soul for this brain.");
    const comm = buildCommunicationContext(handle, "s1");
    expect(comm.soul).toBe("Custom test soul for this brain.");
  });

  it("falls back to the shared soul when no override is set (never throws, never empty-crashes)", () => {
    const comm = buildCommunicationContext(handle, "s1");
    expect(typeof comm.soul).toBe("string");
  });

  it("returns empty behaviorGuidance when there isn't enough history, without throwing", () => {
    const comm = buildCommunicationContext(handle, "s1");
    expect(comm.behaviorGuidance).toBe("");
  });

  it("returns non-empty behaviorGuidance once there's enough recent history to read a pattern", () => {
    for (let i = 0; i < 8; i++) makeMemory("s1", `memory ${i}`, i, -0.6); // heavy recent stretch
    for (let i = 0; i < 8; i++) makeMemory("s1", `older memory ${i}`, 20 + i, 0.5); // brighter prior month
    const comm = buildCommunicationContext(handle, "s1");
    expect(comm.behaviorGuidance.length).toBeGreaterThan(0);
  });
});

describe("buildCommunicationContext — interaction preferences", () => {
  it("returns an empty array (not null, not a throw) when no preference has been learned", () => {
    const comm = buildCommunicationContext(handle, "s1");
    expect(comm.preferences).toEqual([]);
  });

  it("surfaces only preferences that have already cleared the existing evidence bar", () => {
    const repo = new InteractionPreferencesRepo(handle, "s1");
    repo.upsert("verbosity", "concise", 0.3, 1, new Date().toISOString()); // below the bar
    repo.upsert("directness", "very direct", 0.55, 2, new Date().toISOString()); // clears it
    const comm = buildCommunicationContext(handle, "s1");
    expect(comm.preferences.map((p) => p.signal)).toEqual(["directness"]);
  });

  it("does not mutate the preference table — reading twice returns the same rows", () => {
    const repo = new InteractionPreferencesRepo(handle, "s1");
    repo.upsert("directness", "very direct", 0.55, 2, new Date().toISOString());
    const first = buildCommunicationContext(handle, "s1");
    const second = buildCommunicationContext(handle, "s1");
    expect(second.preferences).toEqual(first.preferences);
    expect(repo.list()).toHaveLength(1); // still exactly the one row created above
  });
});

describe("buildCommunicationContext — emotional pattern context is opt-in and bounded", () => {
  it("returns null when neither relevantNodeIds nor includeFullSpaceEmotionalTrajectory is set — zero cost by default", () => {
    for (let i = 0; i < 10; i++) makeMemory("s1", `heavy ${i}`, i, -0.6);
    const comm = buildCommunicationContext(handle, "s1");
    expect(comm.emotionalPatterns).toBeNull();
  });

  it("returns detected patterns when includeFullSpaceEmotionalTrajectory is explicitly requested", () => {
    for (let i = 0; i < 10; i++) makeMemory("s1", `heavy ${i}`, i, -0.6);
    const comm = buildCommunicationContext(handle, "s1", { includeFullSpaceEmotionalTrajectory: true });
    expect(comm.emotionalPatterns).not.toBeNull();
    expect(comm.emotionalPatterns!.length).toBeGreaterThan(0);
  });

  it("scopes to relevantNodeIds when provided, matching chat's own bounded contract", () => {
    const id = makeMemory("s1", "isolated heavy memory", 0, -0.9);
    for (let i = 0; i < 10; i++) makeMemory("s1", `unrelated heavy ${i}`, i, -0.6);
    const comm = buildCommunicationContext(handle, "s1", { relevantNodeIds: [id] });
    // A single memory can never form a pattern (patterns require repeats) — proves the bound
    // is real: the full-space heavy stretch above is NOT what's being read here.
    expect(comm.emotionalPatterns).toBeNull();
  });
});

describe("buildCommunicationContext — space isolation", () => {
  it("never leaks another space's soul, preferences, behavior, or emotional context", () => {
    setSpaceSoul(handle.sqlite, "alice", "Alice's private soul override.");
    new InteractionPreferencesRepo(handle, "alice").upsert("directness", "very direct", 0.6, 3, new Date().toISOString());
    for (let i = 0; i < 10; i++) makeMemory("alice", `alice heavy ${i}`, i, -0.7);

    const bob = buildCommunicationContext(handle, "bob", { includeFullSpaceEmotionalTrajectory: true });
    expect(bob.soul).not.toContain("Alice's private soul");
    expect(bob.preferences).toEqual([]);
    expect(bob.behaviorGuidance).toBe("");
    expect(bob.emotionalPatterns).toBeNull();
  });
});

describe("buildCommunicationContext — no LLM dependency", () => {
  it("builds a full context using only a DbHandle and a spaceId — no llm/embeddings argument exists in its signature", () => {
    // If this function ever needed an LLM, it would need to accept one — it structurally
    // cannot make an LLM call with the two arguments it actually takes.
    const comm = buildCommunicationContext(handle, "s1", { includeFullSpaceEmotionalTrajectory: true });
    expect(comm.spaceId).toBe("s1");
  });
});

describe("recentActionCount — generic, reusable repetition-awareness signal", () => {
  it("counts zero when nothing has fired", () => {
    expect(recentActionCount(handle, "s1", "tool:bill_risk", 7)).toBe(0);
  });

  it("counts fires within the window and excludes ones outside it", () => {
    const now = new Date("2026-01-10T00:00:00.000Z");
    handle.sqlite
      .prepare(`INSERT INTO agent_logs (space_id, action, description, targets, created_at) VALUES (?, ?, ?, '[]', ?)`)
      .run("s1", "tool:bill_risk", "recent one", "2026-01-08T00:00:00.000Z");
    handle.sqlite
      .prepare(`INSERT INTO agent_logs (space_id, action, description, targets, created_at) VALUES (?, ?, ?, '[]', ?)`)
      .run("s1", "tool:bill_risk", "old one", "2025-12-01T00:00:00.000Z");
    expect(recentActionCount(handle, "s1", "tool:bill_risk", 7, now)).toBe(1);
  });

  it("is space-scoped", () => {
    handle.sqlite
      .prepare(`INSERT INTO agent_logs (space_id, action, description, targets, created_at) VALUES (?, ?, ?, '[]', ?)`)
      .run("alice", "tool:bill_risk", "alice's own nudge", new Date().toISOString());
    expect(recentActionCount(handle, "bob", "tool:bill_risk", 7)).toBe(0);
  });
});
