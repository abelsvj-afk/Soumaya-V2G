import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { associativeLink } from "../ingestion/associativeLink.js";
import { EMBED_DIM } from "../db/vec.js";

let handle: DbHandle;
const llm = new HeuristicProvider();

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

/** A deterministic unit vector so we can control cosine similarity exactly. */
function vec(seed: number): Float32Array {
  const v = new Float32Array(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) v[i] = Math.sin((i + 1) * seed);
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < EMBED_DIM; i++) v[i] = (v[i] ?? 0) / n;
  return v;
}

describe("auto constellation membership + cross-time linking", () => {
  it("adds a new memory that matches a constellation hub as a 'summarizes' member", async () => {
    const nodes = new NodesRepo(handle, "legacy");
    const edges = new EdgesRepo(handle, "legacy");
    const topic = vec(1); // hub and the new memory share this embedding (cosine ~1)

    const hub = nodes.create(
      { label: "Financial fears", type: "moc", kind: "moc", content: "money worries", importance: 0.7 },
      topic,
    );
    const fresh = nodes.create(
      { label: "New fear of repossession", type: "daily", content: "worried about repossession again" },
      topic,
    );

    const created = await associativeLink(handle, { nodes, edges, llm }, fresh, topic, undefined, "legacy");

    // The new memory joined the constellation via a summarizes edge from the hub.
    expect(edges.exists(hub.id, fresh.id)).toBe(true);
    const membership = created.find((e) => e.relationship === "summarizes");
    expect(membership).toBeTruthy();
    expect(membership!.source).toBe(hub.id);
    expect(membership!.target).toBe(fresh.id);
  });

  it("links a new memory to a RELATED older one that shares its topic", async () => {
    const nodes = new NodesRepo(handle, "legacy");
    const edges = new EdgesRepo(handle, "legacy");
    const topic = vec(2);
    // Both memories share the meaningful word "repossession" (keyword-gate common ground)
    // and are near in embedding space — the kind of cross-time pair the lower threshold
    // now admits and the heuristic validateLink then confirms.
    const oldMem = nodes.create(
      { label: "Repossession 2019", type: "daily", content: "the repossession of my car happened in 2019" },
      topic,
    );
    const newMem = nodes.create(
      { label: "Repossession fear", type: "daily", content: "scared about another repossession happening again" },
      topic,
    );
    await associativeLink(handle, { nodes, edges, llm }, newMem, topic, undefined, "legacy");
    // The linker creates the edge from the new memory to the older one.
    expect(edges.exists(newMem.id, oldMem.id)).toBe(true);
  });
});
