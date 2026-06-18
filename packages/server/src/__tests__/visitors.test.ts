import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { ingest } from "../ingestion/pipeline.js";
import { VisitorsRepo } from "../repositories/visitors.repo.js";

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

async function add(text: string, space = "legacy") {
  return (await ingest(handle, { embeddings, llm }, text, space)).nodes[0]!.id;
}

describe("visitor activity tracking", () => {
  it("aggregates visits per memory + type, ranks most-visited, dedupes types", async () => {
    const a = await add("a memory the aliens love");
    const b = await add("a quieter memory");
    const repo = new VisitorsRepo(handle, "legacy");

    repo.record([
      { nodeId: a, type: "Drifter" },
      { nodeId: a, type: "Drifter" },
      { nodeId: a, type: "Void Wanderer" },
      { nodeId: b, type: "Luminous Traveler" },
    ]);

    const top = repo.top(10);
    expect(top[0]!.nodeId).toBe(a);
    expect(top[0]!.visits).toBe(3);
    expect(top[0]!.visitorTypes.sort()).toEqual(["Drifter", "Void Wanderer"]);
    expect(top.find((t) => t.nodeId === b)!.visits).toBe(1);
  });

  it("keeps visitor stats private per space", async () => {
    const a = await add("space A memory", "spaceA");
    new VisitorsRepo(handle, "spaceA").record([{ nodeId: a, type: "Drifter" }]);
    expect(new VisitorsRepo(handle, "spaceA").top()).toHaveLength(1);
    expect(new VisitorsRepo(handle, "spaceB").top()).toHaveLength(0);
  });

  it("excludes deleted memories and ignores empty batches", async () => {
    const a = await add("doomed memory");
    const repo = new VisitorsRepo(handle, "legacy");
    repo.record([]); // no-op
    repo.record([{ nodeId: a, type: "Drifter" }]);
    expect(repo.top()).toHaveLength(1);
    handle.sqlite.prepare(`UPDATE nodes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).run(a);
    expect(repo.top()).toHaveLength(0);
  });
});
