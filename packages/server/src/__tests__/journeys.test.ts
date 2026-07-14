import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { JourneysRepo } from "../repositories/journeys.repo.js";

/** Vision 2.0 — Journeys core: create/list/link/unlink, link-count enrichment, space scoping. */

let handle: DbHandle;
beforeEach(() => { handle = createDb(":memory:"); });
afterEach(() => { handle.sqlite.close(); });

describe("JourneysRepo", () => {
  it("creates + lists journeys, active first, with a link count", () => {
    const repo = new JourneysRepo(handle, "s1");
    const rn = repo.create({ title: "Become an RN", icon: "🩺" });
    const done = repo.create({ title: "Old goal", status: "done" });
    repo.link(rn.id, "node", 42);
    repo.link(rn.id, "expense", 7);

    const list = repo.list();
    expect(list[0]!.title).toBe("Become an RN"); // active before done
    expect(list.find((j) => j.id === rn.id)!.linkCount).toBe(2);
    expect(list.find((j) => j.id === done.id)!.status).toBe("done");
  });

  it("links are unique (no double-count) and unlinkable", () => {
    const repo = new JourneysRepo(handle, "s1");
    const j = repo.create({ title: "Recover Financially" });
    repo.link(j.id, "expense", 7);
    repo.link(j.id, "expense", 7); // duplicate → ignored
    expect(repo.links(j.id)).toHaveLength(1);
    expect(repo.unlink(j.id, "expense", 7)).toBe(true);
    expect(repo.links(j.id)).toHaveLength(0);
  });

  it("journeysFor returns every journey an object belongs to", () => {
    const repo = new JourneysRepo(handle, "s1");
    const a = repo.create({ title: "Health" });
    const b = repo.create({ title: "Family" });
    repo.link(a.id, "node", 100);
    repo.link(b.id, "node", 100);
    const forNode = repo.journeysFor("node", 100);
    expect(forNode.map((j) => j.title).sort()).toEqual(["Family", "Health"]);
  });

  it("update sets progress (clamped) and delete removes links too", () => {
    const repo = new JourneysRepo(handle, "s1");
    const j = repo.create({ title: "Learn Japanese" });
    repo.link(j.id, "node", 1);
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
