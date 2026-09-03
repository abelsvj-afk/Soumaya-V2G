import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { buildAwayDigest, markSeen, getLastSeen } from "../analysis/awayDigest.js";

let handle: DbHandle;
const NOW = Date.parse("2026-06-30T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

describe("while-you-were-away digest (#keystone)", () => {
  it("is empty on the first ever visit (no last_seen)", () => {
    const d = buildAwayDigest(handle, "legacy", NOW);
    expect(d.since).toBeNull();
    expect(d.isEmpty).toBe(true);
  });

  it("markSeen sets the window and getLastSeen reads it back", () => {
    markSeen(handle, "legacy", ago(120));
    expect(getLastSeen(handle, "legacy")).toBe(ago(120));
  });

  it("groups Soumaya's autonomous work since the last visit into human lines", () => {
    markSeen(handle, "legacy", ago(120)); // last visit 2h ago
    // Two syntheses + one research logged AFTER the visit; one routine patrol (omitted).
    const log = (action: string, whenMin: number) =>
      handle.sqlite
        .prepare(`INSERT INTO agent_logs (space_id, action, description, targets, created_at) VALUES ('legacy', ?, 'x', '[]', ?)`)
        .run(action, new Date(NOW - whenMin * 60_000).toISOString());
    log("synthesis", 90);
    log("synthesis", 60);
    log("research", 30);
    log("patrol", 20); // routine — must NOT appear
    log("synthesis", 300); // BEFORE the visit — must NOT count

    const d = buildAwayDigest(handle, "legacy", NOW);
    expect(d.isEmpty).toBe(false);
    const syn = d.agentActions.find((a) => a.type === "synthesis");
    expect(syn?.count).toBe(2);
    expect(syn?.label).toContain("connected 2");
    expect(d.agentActions.find((a) => a.type === "research")?.count).toBe(1);
    expect(d.agentActions.find((a) => a.type === "patrol")).toBeUndefined();
    expect(d.awayMs).toBeGreaterThan(60 * 60 * 1000); // ~2h
  });

  it("matches agent_logs written with SQLite CURRENT_TIMESTAMP (production format)", () => {
    // Regression: last_seen_at is ISO but created_at is 'YYYY-MM-DD HH:MM:SS' — a raw
    // string compare misses everything. Insert with the DEFAULT (real prod format).
    markSeen(handle, "legacy", ago(120));
    handle.sqlite
      .prepare(`INSERT INTO agent_logs (space_id, action, description, targets) VALUES ('legacy','synthesis','x','[]')`)
      .run(); // created_at = CURRENT_TIMESTAMP (now, after the 2h-ago window)
    const d = buildAwayDigest(handle, "legacy", NOW);
    // NOW is fixed in the past relative to CURRENT_TIMESTAMP(=real now), so the row is
    // even newer than NOW — still > since. It must be counted.
    expect(d.agentActions.find((a) => a.type === "synthesis")?.count).toBe(1);
  });

  it("counts contradictions + reminders that came due while away", () => {
    markSeen(handle, "legacy", ago(180));
    handle.sqlite.prepare(`INSERT INTO nodes (space_id, label, type, content) VALUES ('legacy','A','other','a')`).run();
    handle.sqlite.prepare(`INSERT INTO nodes (space_id, label, type, content) VALUES ('legacy','B','other','b')`).run();
    handle.sqlite
      .prepare(`INSERT INTO insights (space_id, node_a, node_b, text, score, kind, created_at) VALUES ('legacy',1,2,'conflict',0.8,'contradiction',?)`)
      .run(ago(60));
    // A reminder that fell due 30 min ago (between the visit and now).
    handle.sqlite
      .prepare(`INSERT INTO nodes (space_id, label, type, content, remind_at) VALUES ('legacy','Call Mom','daily','x',?)`)
      .run(ago(30));

    const d = buildAwayDigest(handle, "legacy", NOW);
    expect(d.newContradictions).toBe(1);
    expect(d.dueReminders.map((r) => r.label)).toContain("Call Mom");
  });

  // Life Vision (docs/specs/life-vision.md, C2.1/C3.2-locked): a Vision's target date
  // must never appear in the away-digest's due-reminders list.
  it("excludes a life_vision node's target date from dueReminders", () => {
    markSeen(handle, "legacy", ago(180));
    handle.sqlite
      .prepare(`INSERT INTO nodes (space_id, label, type, content, kind, remind_at) VALUES ('legacy','Our first house','concept','x','life_vision',?)`)
      .run(ago(30));

    const d = buildAwayDigest(handle, "legacy", NOW);
    expect(d.dueReminders.map((r) => r.label)).not.toContain("Our first house");
  });
});
