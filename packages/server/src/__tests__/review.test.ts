import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { dueForReview, gradeReview, memoryStrength } from "../analysis/review.js";
import { runToolRouter } from "../agent/tools/router.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
function mem(label: string, createdAt: string, importance = 0.5): number {
  const info = handle.sqlite
    .prepare(`INSERT INTO nodes (space_id, label, type, content, importance, created_at) VALUES ('legacy', ?, 'daily', ?, ?, ?)`)
    .run(label, label, importance, createdAt);
  return Number(info.lastInsertRowid);
}

describe("Spaced repetition — schedule + strength + grading", () => {
  it("a settled memory becomes due for review; a fresh one does not", () => {
    const now = Date.UTC(2026, 3, 1, 12, 0, 0);
    const old = mem("settled thought", iso(now - 5 * DAY));
    mem("just now", iso(now - 3600_000));
    const due = dueForReview(ctx, "legacy", now).map((d) => d.id);
    expect(due).toContain(old);
    expect(due).toHaveLength(1);
  });

  it("strength decays from full toward the review point", () => {
    const now = Date.UTC(2026, 3, 1, 12, 0, 0);
    const fresh = { created_at: iso(now - 0.1 * DAY), last_reviewed_at: null, review_interval_days: 2 };
    const stale = { created_at: iso(now - 2 * DAY), last_reviewed_at: null, review_interval_days: 2 };
    expect(memoryStrength(fresh, now)).toBeGreaterThan(0.8);
    expect(memoryStrength(stale, now)).toBeLessThan(0.2);
  });

  it("remembering pushes the next review out; forgetting pulls it back to a day", () => {
    const now = Date.UTC(2026, 3, 1, 12, 0, 0);
    const id = mem("recall me", iso(now - 5 * DAY));
    // First good recall → 1-day interval.
    gradeReview(ctx, "legacy", id, true, now);
    let row = handle.sqlite.prepare(`SELECT review_interval_days AS i, review_count AS c FROM nodes WHERE id=?`).get(id) as { i: number; c: number };
    expect(row.c).toBe(1);
    // Second good recall → 6-day step.
    gradeReview(ctx, "legacy", id, true, now + DAY);
    row = handle.sqlite.prepare(`SELECT review_interval_days AS i, review_count AS c FROM nodes WHERE id=?`).get(id) as { i: number; c: number };
    expect(row.i).toBe(6);
    // A lapse resets the interval to 1 day and the streak to 0.
    gradeReview(ctx, "legacy", id, false, now + 2 * DAY);
    row = handle.sqlite.prepare(`SELECT review_interval_days AS i, review_count AS c FROM nodes WHERE id=?`).get(id) as { i: number; c: number };
    expect(row.i).toBe(1);
    expect(row.c).toBe(0);
  });

  it("a graded memory drops out of the due list until its next date", () => {
    const now = Date.UTC(2026, 3, 1, 12, 0, 0);
    const id = mem("done for now", iso(now - 5 * DAY));
    gradeReview(ctx, "legacy", id, true, now); // next review in 1 day
    expect(dueForReview(ctx, "legacy", now).map((d) => d.id)).not.toContain(id);
    expect(dueForReview(ctx, "legacy", now + 2 * DAY).map((d) => d.id)).toContain(id);
  });
});

describe("Review-nudge tool", () => {
  it("nudges one due memory per day and snoozes it so it doesn't re-ask tomorrow", async () => {
    const now = Date.UTC(2026, 3, 1, 12, 0, 0);
    mem("what did I mean here", iso(now - 5 * DAY), 0.8);
    const sent: string[] = [];
    await runToolRouter(ctx, "legacy", { now, notify: async (_s, t) => void sent.push(t) });
    expect(sent.some((t) => t.includes("remember"))).toBe(true);

    // Same day → no second nudge.
    const before = sent.length;
    await runToolRouter(ctx, "legacy", { now: now + 120_000, notify: async (_s, t) => void sent.push(t) });
    expect(sent.length).toBe(before);
  });
});
