import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import type { AppContext } from "../context.js";
import { scoreCandidate, pickResearchTarget, RESEARCH_SCORE_FLOOR } from "../maintenance/researchPriority.js";

let handle: DbHandle;
const ctx = () => ({ handle }) as AppContext;

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

function seed(label: string, importance: number, content: string, ew: number | null, type = "other") {
  return (
    handle.sqlite
      .prepare(
        `INSERT INTO nodes (space_id, label, type, content, importance, emotional_weight)
         VALUES ('legacy', ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(label, type, content, importance, ew) as { id: number }
  ).id;
}

describe("scored research priority (#2)", () => {
  it("scoreCandidate rewards emotion + identity and punishes low-signal factual one-offs", () => {
    const empty = new Set<number>();
    const types = new Map<string, number>();

    const rich = scoreCandidate(
      { id: 1, importance: 0.7, content: "I am someone who can't give up on this dream.", type: "concept", emotionalWeight: -0.85, tags: null, deg: 1 },
      empty,
      types,
    );
    expect(rich.score).toBeGreaterThanOrEqual(5);
    expect(rich.factors).toContain("strong emotion");
    expect(rich.factors).toContain("identity-shaping");

    const noise = scoreCandidate(
      { id: 2, importance: 0.46, content: "Bought milk.", type: "other", emotionalWeight: 0.0, tags: null, deg: 0 },
      empty,
      types,
    );
    expect(noise.score).toBeLessThan(RESEARCH_SCORE_FLOOR);
    expect(noise.factors).toContain("low-signal factual");
  });

  it("a contradiction membership adds a strong signal", () => {
    const types = new Map<string, number>();
    const row = { id: 9, importance: 0.5, content: "neutral note", type: "other", emotionalWeight: 0.1, tags: null, deg: 1 };
    const without = scoreCandidate(row, new Set(), types).score;
    const withConflict = scoreCandidate(row, new Set([9]), types).score;
    expect(withConflict - without).toBe(3);
  });

  it("pickResearchTarget chooses the most research-worthy memory, not just the most important", () => {
    // Higher importance but bland vs. slightly-lower importance but emotionally charged + identity.
    const bland = seed("bland", 0.9, "A factual reference note about a topic with some length to it here.", 0.0, "knowledge");
    const charged = seed("charged", 0.7, "I am terrified I will never finish what I started.", -0.9, "concept");
    const pick = pickResearchTarget(ctx(), "legacy");
    expect(pick).not.toBeNull();
    expect(pick!.id).toBe(charged);
    expect(pick!.id).not.toBe(bland);
  });

  it("returns null (no research zone) when only low-signal noise exists", () => {
    seed("n1", 0.46, "Bought milk.", 0.0, "other");
    seed("n2", 0.47, "Paid bill.", 0.05, "other");
    expect(pickResearchTarget(ctx(), "legacy")).toBeNull();
  });
});
