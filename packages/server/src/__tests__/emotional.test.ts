import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { buildEmotionalTrajectory, buildEmotionalTrajectoryAmong, emotionalSnapshotText } from "../analysis/emotional.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EMBED_DIM } from "../db/vec.js";

let handle: DbHandle;

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

/** Insert a memory with a given valence + event date directly (no LLM needed). */
function seed(label: string, valence: number, occurredAt: string, tags?: string[], spaceId = "legacy") {
  handle.sqlite
    .prepare(
      `INSERT INTO nodes (space_id, label, type, content, emotional_weight, occurred_at, tags)
       VALUES (?, ?, 'daily', ?, ?, ?, ?)`,
    )
    .run(spaceId, label, label, valence, occurredAt, tags ? JSON.stringify(tags) : null);
}

/** Same as `seed()` but returns the new row's id, for tests that need to build a bounded
 *  `relevantIds`/`contextNodeIds` list (Phase E's bounded entry points key on real ids, not a
 *  full-space scan). */
function seedId(label: string, valence: number, occurredAt: string, tags?: string[], spaceId = "legacy"): number {
  const info = handle.sqlite
    .prepare(
      `INSERT INTO nodes (space_id, label, type, content, emotional_weight, occurred_at, tags)
       VALUES (?, ?, 'daily', ?, ?, ?, ?)`,
    )
    .run(spaceId, label, label, valence, occurredAt, tags ? JSON.stringify(tags) : null);
  return Number(info.lastInsertRowid);
}

describe("emotional trajectory (#5)", () => {
  it("returns an empty trajectory for a brain with no emotional data", () => {
    const t = buildEmotionalTrajectory(handle, "legacy");
    expect(t.sampleSize).toBe(0);
    expect(t.points).toEqual([]);
    expect(t.patterns).toEqual([]);
  });

  it("buckets by day, averages valence, and reports the sample size", () => {
    seed("a", 0.6, "2026-01-01T09:00:00");
    seed("b", 0.2, "2026-01-01T18:00:00"); // same day → averaged with a
    seed("c", -0.4, "2026-01-02T10:00:00");
    const t = buildEmotionalTrajectory(handle, "legacy");
    expect(t.sampleSize).toBe(3);
    expect(t.points.length).toBe(2); // two distinct days
    expect(t.points[0]!.valence).toBeCloseTo(0.4, 5); // (0.6 + 0.2) / 2
    expect(t.points[0]!.count).toBe(2);
  });

  it("detects a rising trend as an upswing", () => {
    const days = ["2026-02-01", "2026-02-02", "2026-02-03", "2026-02-04", "2026-02-05"];
    days.forEach((d, i) => seed(`m${i}`, -0.5 + i * 0.25, `${d}T12:00:00`));
    const t = buildEmotionalTrajectory(handle, "legacy");
    expect(t.trend).toBe("rising");
    expect(t.patterns.some((p) => p.type === "Upswing")).toBe(true);
  });

  it("detects a recurring stress cycle and names the dominant trigger", () => {
    // Repeated heavy dips, all tagged "work" → stress cycle with trigger "work".
    seed("ok", 0.3, "2026-03-01T12:00:00", ["life"]);
    seed("bad1", -0.6, "2026-03-02T12:00:00", ["work"]);
    seed("ok2", 0.2, "2026-03-03T12:00:00", ["life"]);
    seed("bad2", -0.7, "2026-03-04T12:00:00", ["work"]);
    seed("bad3", -0.5, "2026-03-05T12:00:00", ["work"]);
    const t = buildEmotionalTrajectory(handle, "legacy");
    const stress = t.patterns.find((p) => p.type === "Stress cycle");
    expect(stress).toBeTruthy();
    expect(stress!.repeats).toBeGreaterThanOrEqual(2);
    expect(stress!.trigger).toBe("work");
  });

  it("flags a burnout shape (bright early → heavy recent)", () => {
    const series = [0.6, 0.5, 0.4, -0.3, -0.5, -0.6];
    series.forEach((v, i) => seed(`b${i}`, v, `2026-04-0${i + 1}T12:00:00`));
    const t = buildEmotionalTrajectory(handle, "legacy");
    expect(t.patterns.some((p) => p.type === "Burnout risk")).toBe(true);
  });
});

/**
 * Maya Longitudinal Intelligence, Phase E (docs/specs/maya-longitudinal-intelligence.md,
 * Section 11) — the bounded entry point + chat-facing renderer. Covers the task's full
 * enumerated matrix: recent/repeated/temporary-vs-recurring emotion, temporal window, context
 * relevance, durable-goal protection, epistemic safety, historical preservation, space
 * isolation, and bounds. Group 12 (chat integration) lives in `emotionalChat.test.ts`, mirroring
 * how `intelligenceChat.test.ts` is split from `intelligence.test.ts`.
 */
describe("buildEmotionalTrajectoryAmong — bounded entry point", () => {
  it("returns the same shape as the full scan when given exactly the relevant ids", () => {
    const a = seedId("bad1", -0.6, "2026-03-02T12:00:00", ["work"]);
    const b = seedId("bad2", -0.7, "2026-03-04T12:00:00", ["work"]);
    const full = buildEmotionalTrajectory(handle, "legacy");
    const bounded = buildEmotionalTrajectoryAmong(handle, "legacy", [a, b]);
    expect(bounded.patterns.find((p) => p.type === "Stress cycle")).toBeTruthy();
    expect(bounded.sampleSize).toBe(full.sampleSize); // only these two exist in the space anyway
  });

  it("returns the EMPTY trajectory for an empty id list — never falls back to a full scan", () => {
    seed("bad1", -0.6, "2026-03-02T12:00:00");
    expect(buildEmotionalTrajectoryAmong(handle, "legacy", [])).toEqual({
      points: [],
      trend: "steady",
      average: 0,
      volatility: 0,
      patterns: [],
      sampleSize: 0,
    });
  });

  it("a single emotional signal outside the bounded set never affects a different bounded query (temporal/context window)", () => {
    const heavy = seedId("very sad", -0.9, "2020-01-01T00:00:00"); // old, far outside typical context
    const other = seedId("unrelated", 0.1, "2026-06-01T00:00:00");
    const bounded = buildEmotionalTrajectoryAmong(handle, "legacy", [other]);
    expect(bounded.sampleSize).toBe(1);
    expect(bounded.average).toBeCloseTo(0.1, 5);
    void heavy; // exists in the space but was never included in this bounded query
  });

  it("instrumentation: never calls NodesRepo.all() — the bounded path does not perform a full-space scan", () => {
    for (let i = 0; i < 50; i++) seed(`n${i}`, i % 2 === 0 ? -0.6 : 0.6, `2026-05-${(i % 27) + 1}T12:00:00`);
    const a = seedId("bad1", -0.6, "2026-03-02T12:00:00");
    const allSpy = vi.spyOn(NodesRepo.prototype, "all");
    try {
      buildEmotionalTrajectoryAmong(handle, "legacy", [a]);
      expect(allSpy).not.toHaveBeenCalled();
    } finally {
      allSpy.mockRestore();
    }
  });

  it("is space-scoped — an id from another space returns nothing", () => {
    const a = seedId("bad1", -0.6, "2026-03-02T12:00:00", undefined, "space-a");
    expect(buildEmotionalTrajectoryAmong(handle, "space-b", [a])).toEqual(
      expect.objectContaining({ sampleSize: 0, patterns: [] }),
    );
  });
});

describe("emotionalSnapshotText — chat-facing renderer", () => {
  it("returns null for a single, temporary emotional signal — never narrates a raw one-off valence", () => {
    const a = seedId("bad day", -0.8, "2026-03-02T12:00:00");
    expect(emotionalSnapshotText(handle, "legacy", [a])).toBeNull();
  });

  it("narrates a genuinely detected, RECURRING pattern, hedged as a signal — not a fact", () => {
    const a = seedId("bad1", -0.6, "2026-03-02T12:00:00", ["work"]);
    const b = seedId("bad2", -0.7, "2026-03-04T12:00:00", ["work"]);
    const text = emotionalSnapshotText(handle, "legacy", [a, b]);
    expect(text).not.toBeNull();
    expect(text).toContain("EMOTIONAL CONTEXT");
    expect(text).toContain("Stress cycle");
    expect(text).toContain("recurring SIGNAL");
    expect(text).not.toMatch(/\bis a\b.*frustrated person/i); // never asserts an identity trait
  });

  it("recurring evidence produces a stronger (present) signal than a single isolated observation — same underlying data, different bounded context", () => {
    const a = seedId("bad1", -0.6, "2026-03-02T12:00:00", ["work"]);
    seedId("bad2", -0.7, "2026-03-04T12:00:00", ["work"]);
    const single = emotionalSnapshotText(handle, "legacy", [a]); // only the first, isolated
    // second call includes the pair — build ids fresh since seedId already ran above
    const both = handle.sqlite.prepare(`SELECT id FROM nodes ORDER BY id`).all() as { id: number }[];
    const paired = emotionalSnapshotText(handle, "legacy", both.map((r) => r.id));
    expect(single).toBeNull();
    expect(paired).not.toBeNull();
  });

  it("context relevance: the same underlying data produces different snapshots depending on which ids are currently in context", () => {
    const workA = seedId("work bad1", -0.6, "2026-03-02T12:00:00", ["work"]);
    const workB = seedId("work bad2", -0.7, "2026-03-04T12:00:00", ["work"]);
    const unrelated = seedId("unrelated note", 0.1, "2026-06-01T12:00:00", ["hobby"]);

    const whenWorkIsInContext = emotionalSnapshotText(handle, "legacy", [workA, workB]);
    const whenOnlyUnrelatedIsInContext = emotionalSnapshotText(handle, "legacy", [unrelated]);
    expect(whenWorkIsInContext).not.toBeNull();
    expect(whenOnlyUnrelatedIsInContext).toBeNull();
  });

  it("never mutates or mentions a durable Life Vision / goal node also present in the bounded context", () => {
    const nodesRepo = new NodesRepo(handle, "legacy");
    const vision = nodesRepo.create(
      { label: "Trucking vision", content: "Build a trucking company.", type: "other", kind: "life_vision" },
      new Float32Array(EMBED_DIM),
    );
    const a = seedId("bad1", -0.6, "2026-03-02T12:00:00", ["work"]);
    const b = seedId("bad2", -0.7, "2026-03-04T12:00:00", ["work"]);
    const before = handle.sqlite.prepare(`SELECT label, content, kind FROM nodes WHERE id = ?`).get(vision.id);

    const text = emotionalSnapshotText(handle, "legacy", [vision.id, a, b]);

    const after = handle.sqlite.prepare(`SELECT label, content, kind FROM nodes WHERE id = ?`).get(vision.id);
    expect(after).toEqual(before); // untouched
    expect(text ?? "").not.toContain("Trucking vision");
    expect(text ?? "").not.toContain("life_vision");
  });

  it("never creates a pending clarification or any epistemic claim — pure text, no side effects", () => {
    const a = seedId("bad1", -0.6, "2026-03-02T12:00:00", ["work"]);
    const b = seedId("bad2", -0.7, "2026-03-04T12:00:00", ["work"]);
    const before = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM intelligence_clarifications`).get() as { c: number }).c;
    emotionalSnapshotText(handle, "legacy", [a, b]);
    const after = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM intelligence_clarifications`).get() as { c: number }).c;
    expect(after).toBe(before);
  });

  it("never mutates the underlying memories' own content or occurred_at (historical preservation)", () => {
    const a = seedId("bad1", -0.6, "2026-03-02T12:00:00", ["work"]);
    const b = seedId("bad2", -0.7, "2026-03-04T12:00:00", ["work"]);
    const beforeA = handle.sqlite.prepare(`SELECT label, content, occurred_at FROM nodes WHERE id = ?`).get(a);
    emotionalSnapshotText(handle, "legacy", [a, b]);
    emotionalSnapshotText(handle, "legacy", [a, b]); // twice, for good measure
    const afterA = handle.sqlite.prepare(`SELECT label, content, occurred_at FROM nodes WHERE id = ?`).get(a);
    expect(afterA).toEqual(beforeA);
  });

  it("is space-scoped — ids from another space never enter this space's snapshot", () => {
    const a = seedId("bad1", -0.6, "2026-03-02T12:00:00", ["work"], "space-a");
    const b = seedId("bad2", -0.7, "2026-03-04T12:00:00", ["work"], "space-a");
    expect(emotionalSnapshotText(handle, "space-b", [a, b])).toBeNull();
  });

  it("returns null when no context ids are given — never reaches for the full-space scan as a fallback", () => {
    seed("bad1", -0.6, "2026-03-02T12:00:00", ["work"]);
    seed("bad2", -0.7, "2026-03-04T12:00:00", ["work"]);
    // A real Stress cycle exists in the full-space view (proven above) but this renderer must
    // not silently reach for it when called with no bounded context.
    expect(emotionalSnapshotText(handle, "legacy")).toBeNull();
    expect(emotionalSnapshotText(handle, "legacy", [])).toBeNull();
  });
});
