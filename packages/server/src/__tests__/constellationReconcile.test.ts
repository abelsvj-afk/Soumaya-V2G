import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { reconcileConstellations } from "../analysis/constellationReconcile.js";
import { EMBED_DIM } from "../db/vec.js";

let handle: DbHandle;
beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

function vec(seed: number): Float32Array {
  const v = new Float32Array(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) v[i] = Math.sin((i + 1) * seed);
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < EMBED_DIM; i++) v[i] = (v[i] ?? 0) / n;
  return v;
}

describe("constellation re-evaluation over time", () => {
  it("pulls a drifted-in memory into a constellation as a visible member", () => {
    const nodes = new NodesRepo(handle, "legacy");
    const edges = new EdgesRepo(handle, "legacy");
    const topic = vec(5);
    const hub = nodes.create({ label: "Money", type: "moc", kind: "moc", content: "money", importance: 0.7 }, topic);
    const orphan = nodes.create({ label: "New debt worry", type: "daily", content: "worried about debt" }, topic);
    // Not a member yet.
    expect(edges.exists(hub.id, orphan.id)).toBe(false);

    const added = reconcileConstellations(handle, "legacy");
    expect(added).toBeGreaterThan(0);
    expect(edges.exists(hub.id, orphan.id)).toBe(true);

    // Idempotent: a second pass doesn't re-add the same membership.
    expect(reconcileConstellations(handle, "legacy")).toBe(0);
  });

  it("does nothing when there are no constellations", () => {
    const nodes = new NodesRepo(handle, "legacy");
    nodes.create({ label: "lonely", type: "daily", content: "x" }, vec(9));
    expect(reconcileConstellations(handle, "legacy")).toBe(0);
  });
});
