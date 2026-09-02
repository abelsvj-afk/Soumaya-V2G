import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { JourneysRepo } from "../repositories/journeys.repo.js";

/** Vision 2.0 — Journeys core: create/list/link/unlink, link-count enrichment, space scoping. */

let handle: DbHandle;
beforeEach(() => { handle = createDb(":memory:"); });
afterEach(() => { handle.sqlite.close(); });

// link() validates that a ref actually exists in-space before linking (see
// JourneysRepo.refExists) — these insert a minimal real row so link() sees a real target
// instead of the old tests' fabricated ids (42, 7, 100, 1), which link() now correctly
// refuses to attach.
function makeNode(spaceId: string): number {
  return Number(
    handle.sqlite
      .prepare(`INSERT INTO nodes (space_id, label, type, content) VALUES (?, 'n', 'knowledge', 'c')`)
      .run(spaceId).lastInsertRowid,
  );
}
function makeExpense(spaceId: string): number {
  return Number(
    handle.sqlite
      .prepare(`INSERT INTO fin_expense (space_id, date, amount_cents) VALUES (?, '2026-01-01', 500)`)
      .run(spaceId).lastInsertRowid,
  );
}
function makeGoal(spaceId: string): number {
  const bucketId = Number(
    handle.sqlite.prepare(`INSERT INTO fin_bucket (space_id, name) VALUES (?, 'Trucking')`).run(spaceId).lastInsertRowid,
  );
  return Number(
    handle.sqlite
      .prepare(`INSERT INTO fin_goal (space_id, bucket_id, name, target_cents) VALUES (?, ?, 'First Truck', 100000)`)
      .run(spaceId, bucketId).lastInsertRowid,
  );
}

describe("JourneysRepo", () => {
  it("creates + lists journeys, active first, with a link count", () => {
    const repo = new JourneysRepo(handle, "s1");
    const rn = repo.create({ title: "Become an RN", icon: "🩺" });
    const done = repo.create({ title: "Old goal", status: "done" });
    repo.link(rn.id, "node", makeNode("s1"));
    repo.link(rn.id, "expense", makeExpense("s1"));

    const list = repo.list();
    expect(list[0]!.title).toBe("Become an RN"); // active before done
    expect(list.find((j) => j.id === rn.id)!.linkCount).toBe(2);
    expect(list.find((j) => j.id === done.id)!.status).toBe("done");
  });

  it("validates a 'goal' link against a real fin_goal row, and rejects a fabricated id (docs/specs/wealth-goals-allocation.md §10)", () => {
    const repo = new JourneysRepo(handle, "s1");
    const j = repo.create({ title: "Become an Owner-Operator" });
    const goalId = makeGoal("s1");
    expect(repo.link(j.id, "goal", goalId)).not.toBeNull();
    expect(repo.link(j.id, "goal", 999999)).toBeNull(); // no such fin_goal row
  });

  it("links are unique (no double-count) and unlinkable", () => {
    const repo = new JourneysRepo(handle, "s1");
    const j = repo.create({ title: "Recover Financially" });
    const expenseId = makeExpense("s1");
    repo.link(j.id, "expense", expenseId);
    repo.link(j.id, "expense", expenseId); // duplicate → ignored
    expect(repo.links(j.id)).toHaveLength(1);
    expect(repo.unlink(j.id, "expense", expenseId)).toBe(true);
    expect(repo.links(j.id)).toHaveLength(0);
  });

  it("journeysFor returns every journey an object belongs to", () => {
    const repo = new JourneysRepo(handle, "s1");
    const a = repo.create({ title: "Health" });
    const b = repo.create({ title: "Family" });
    const nodeId = makeNode("s1");
    repo.link(a.id, "node", nodeId);
    repo.link(b.id, "node", nodeId);
    const forNode = repo.journeysFor("node", nodeId);
    expect(forNode.map((j) => j.title).sort()).toEqual(["Family", "Health"]);
  });

  it("update sets progress (clamped) and delete removes links too", () => {
    const repo = new JourneysRepo(handle, "s1");
    const j = repo.create({ title: "Learn Japanese" });
    repo.link(j.id, "node", makeNode("s1"));
    expect(repo.update(j.id, { progress: 1.5 })!.progress).toBe(1); // clamped
    expect(repo.remove(j.id)).toBe(true);
    expect(repo.get(j.id)).toBeNull();
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM journey_link WHERE journey_id = ?`).get(j.id) as any).toEqual({ c: 0 });
  });

  it("is space-scoped", () => {
    new JourneysRepo(handle, "alice").create({ title: "Alice journey" });
    expect(new JourneysRepo(handle, "alice").list()).toHaveLength(1);
    expect(new JourneysRepo(handle, "bob").list()).toHaveLength(0);
    // A link can't attach to another space's journey.
    expect(new JourneysRepo(handle, "bob").link(1, "node", 1)).toBeNull();
  });
});
