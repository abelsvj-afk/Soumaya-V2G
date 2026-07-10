import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { EMBED_DIM, knn } from "../db/vec.js";
import { keywordSearch } from "../db/fts.js";
import { NodesRepo } from "../repositories/nodes.repo.js";

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

async function mem(label: string, content: string): Promise<number> {
  const repo = new NodesRepo(handle, "legacy");
  const n = repo.create({ label, type: "daily", content } as never, await embeddings.embed(`${label}. ${content}`));
  return n.id;
}

describe("node lifecycle status (active / archived)", () => {
  it("archiving removes a memory from the galaxy + retrieval, but keeps it (restorable)", async () => {
    const repo = new NodesRepo(handle, "legacy");
    const keep = await mem("live one", "the ongoing project zanzibar");
    const rest = await mem("old one", "an old zanzibar note I'm done with");

    // Both start active — both in the galaxy + keyword retrieval.
    expect(repo.all().map((n) => n.id).sort()).toEqual([keep, rest].sort());
    expect(keywordSearch(handle.sqlite, "legacy", "zanzibar", 5).map((h) => h.nodeId)).toContain(rest);

    // Archive one.
    expect(repo.setStatus(rest, "archived")).toBe(true);

    // Gone from the galaxy, retrieval (vector + keyword), but present in the archived lens.
    expect(repo.all().map((n) => n.id)).toEqual([keep]);
    expect(repo.archived().map((n) => n.id)).toEqual([rest]);
    expect(keywordSearch(handle.sqlite, "legacy", "zanzibar", 5).map((h) => h.nodeId)).not.toContain(rest);
    const q = await embeddings.embed("zanzibar note");
    expect(knn(handle.sqlite, q, 10, "legacy").map((h) => h.nodeId)).not.toContain(rest);

    // Restore — back in the galaxy.
    expect(repo.setStatus(rest, "active")).toBe(true);
    expect(repo.all().map((n) => n.id).sort()).toEqual([keep, rest].sort());
  });
});
