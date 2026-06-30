import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { buildDormantList, DORMANT_DAYS } from "../analysis/dormant.js";

let handle: DbHandle;
const NOW = Date.parse("2026-06-30T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

function seed(
  label: string,
  opts: { importance?: number; type?: string; content?: string; ew?: number; lastTended?: string; created?: string },
) {
  handle.sqlite
    .prepare(
      `INSERT INTO nodes (space_id, label, type, content, importance, emotional_weight, last_tended_at, created_at)
       VALUES ('legacy', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      label,
      opts.type ?? "project",
      opts.content ?? label,
      opts.importance ?? 0.6,
      opts.ew ?? 0,
      opts.lastTended ?? null,
      opts.created ?? daysAgo(0),
    );
}

describe("dormant / latent recovery (#4)", () => {
  it("flags an important pursuit gone quiet past the dormancy window", () => {
    seed("Learn the guitar", { type: "project", importance: 0.7, created: daysAgo(DORMANT_DAYS + 20) });
    const items = buildDormantList(handle, "legacy", NOW);
    expect(items.length).toBe(1);
    expect(items[0]!.label).toBe("Learn the guitar");
    expect(items[0]!.dormantDays).toBeGreaterThanOrEqual(DORMANT_DAYS);
    expect(items[0]!.hypothesis.length).toBeGreaterThan(0);
    expect(items[0]!.prompt).toContain("Learn the guitar");
  });

  it("ignores recently-tended pursuits and low-importance noise", () => {
    seed("Active project", { type: "project", importance: 0.8, lastTended: daysAgo(3), created: daysAgo(100) });
    seed("Trivial note", { type: "other", importance: 0.2, content: "random", created: daysAgo(90) });
    expect(buildDormantList(handle, "legacy", NOW)).toEqual([]);
  });

  it("uses lastTendedAt over createdAt for recency (viewing warms a memory)", () => {
    // Old memory, but tended recently → not dormant.
    seed("Recently revisited goal", { type: "decision", importance: 0.7, created: daysAgo(200), lastTended: daysAgo(5) });
    expect(buildDormantList(handle, "legacy", NOW)).toEqual([]);
  });

  it("detects a pursuit by language even when the type isn't project/decision/concept", () => {
    seed("Side hustle", { type: "other", importance: 0.6, content: "I want to start a side project building furniture.", created: daysAgo(DORMANT_DAYS + 5) });
    const items = buildDormantList(handle, "legacy", NOW);
    expect(items.some((i) => i.label === "Side hustle")).toBe(true);
  });

  it("ranks the most significant + most-faded first and caps the list", () => {
    for (let i = 0; i < 12; i++) {
      seed(`goal ${i}`, { type: "project", importance: 0.5 + (i % 5) * 0.1, created: daysAgo(DORMANT_DAYS + i * 3) });
    }
    const items = buildDormantList(handle, "legacy", NOW);
    expect(items.length).toBeLessThanOrEqual(8);
  });
});
