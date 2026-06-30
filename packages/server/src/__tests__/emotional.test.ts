import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { buildEmotionalTrajectory } from "../analysis/emotional.js";

let handle: DbHandle;

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

/** Insert a memory with a given valence + event date directly (no LLM needed). */
function seed(label: string, valence: number, occurredAt: string, tags?: string[]) {
  handle.sqlite
    .prepare(
      `INSERT INTO nodes (space_id, label, type, content, emotional_weight, occurred_at, tags)
       VALUES ('legacy', ?, 'daily', ?, ?, ?, ?)`,
    )
    .run(label, label, valence, occurredAt, tags ? JSON.stringify(tags) : null);
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
