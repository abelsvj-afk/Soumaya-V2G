import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { lifeAreaOf, buildLifeAreaCounts } from "../analysis/lifeAreas.js";
import { buildSelfReview } from "../analysis/selfReview.js";
import type { GraphNode } from "@brain/shared";

let handle: DbHandle;
beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

const node = (over: Partial<GraphNode>): GraphNode => ({
  id: 1,
  label: "x",
  type: "other",
  content: "",
  tags: undefined,
  createdAt: "2026-01-01",
  ...over,
});

function seed(label: string, type: string, content: string, opts: { importance?: number; tended?: string } = {}) {
  handle.sqlite
    .prepare(
      `INSERT INTO nodes (space_id, label, type, content, importance, last_tended_at) VALUES ('legacy', ?, ?, ?, ?, ?)`,
    )
    .run(label, type, content, opts.importance ?? 0.5, opts.tended ?? null);
}

describe("life-area lens (#6)", () => {
  it("classifies by type, tag, and language", () => {
    expect(lifeAreaOf(node({ type: "person" }))).toBe("Relationships");
    expect(lifeAreaOf(node({ type: "project" }))).toBe("Work & Projects");
    expect(lifeAreaOf(node({ tags: ["Money"] }))).toBe("Money");
    expect(lifeAreaOf(node({ content: "trying to improve my sleep and exercise" }))).toBe("Health");
    expect(lifeAreaOf(node({ content: "a goal to learn and grow this year" }))).toBe("Identity & Growth");
    expect(lifeAreaOf(node({ content: "nondescript note" }))).toBe("Other");
  });

  it("counts the distribution and omits empty areas", () => {
    seed("p", "person", "a friend");
    seed("w", "project", "a work project");
    seed("w2", "project", "another project");
    const counts = buildLifeAreaCounts(handle, "legacy");
    const map = new Map(counts.map((c) => [c.area, c.count]));
    expect(map.get("Work & Projects")).toBe(2);
    expect(map.get("Relationships")).toBe(1);
    expect(map.has("Money")).toBe(false); // empty areas omitted
  });
});

describe("coverage self-check (#12)", () => {
  it("reports drifting + important blind-spot memories", () => {
    seed("lonely", "other", "an unlinked thought", { importance: 0.4 });
    seed("blind", "project", "important but undocumented", { importance: 0.8 });
    const items = buildSelfReview(handle, "legacy");
    const titles = items.map((i) => i.title);
    expect(titles).toContain("Drifting memories");
    expect(titles).toContain("Important blind spots");
    for (const it of items) expect(it.count).toBeGreaterThan(0);
  });

  it("is empty for a brain with nothing to flag", () => {
    expect(buildSelfReview(handle, "legacy")).toEqual([]);
  });
});
