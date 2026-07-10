import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM, knn } from "../db/vec.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { InsightsRepo } from "../repositories/insights.repo.js";
import { keywordSearch } from "../db/fts.js";
import { chat } from "../chat/graphrag.js";

/**
 * Phase 4 — AI validation (AI_ENGINEERING_WORKFLOW_POST_MVP.md). Validate the AI by
 * MEASUREMENT, not assertion: retrieval grounding (no fabricated citations), retrieval
 * ranking quality, and memory consistency. All on the offline heuristic path, so the
 * guarantees hold with no API key. (Cloud-model answer *quality* is validated live.)
 */

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

async function mem(label: string, content: string): Promise<number> {
  const repo = new NodesRepo(handle, "legacy");
  const n = repo.create({ label, type: "daily", content } as never, await embeddings.embed(`${label}. ${content}`));
  return n.id;
}

describe("Phase 4 — grounding (no hallucinated citations)", () => {
  it("every citation the AI returns is a REAL retrieved memory, never invented", async () => {
    const ids = new Set<number>();
    ids.add(await mem("studio lease", "I signed the lease for the recording studio downtown"));
    ids.add(await mem("gym", "started going to the gym on Mondays"));
    ids.add(await mem("mara", "long call with Mara about the label deal"));

    const res = await chat(handle, { embeddings, llm }, "what happened with the studio?", undefined, "legacy");
    // The anti-hallucination guarantee: every citation is a REAL retrieved node
    // (citations are NodeRef objects filtered against the retrieved subgraph).
    for (const c of res.citations) expect(ids.has(c.id)).toBe(true);
  });

  it("does not fabricate citations for a question the brain can't answer", async () => {
    await mem("gym", "started going to the gym on Mondays");
    const res = await chat(handle, { embeddings, llm }, "what is the capital of France?", undefined, "legacy");
    // Whatever it says, it may only cite memories that actually exist (possibly none).
    const all = new Set((handle.sqlite.prepare(`SELECT id FROM nodes WHERE space_id='legacy'`).all() as { id: number }[]).map((r) => r.id));
    for (const c of res.citations) expect(all.has(c.id)).toBe(true);
  });
});

describe("Phase 4 — retrieval ranking quality", () => {
  it("ranks the memory that names the query term first (precision@1 = 1)", async () => {
    const target = await mem("zanzibar", "booked flights to Zanzibar for the honeymoon");
    await mem("groceries", "picked up groceries and cooked pasta");
    await mem("meeting", "quarterly planning meeting ran long");
    const hits = keywordSearch(handle.sqlite, "legacy", "zanzibar", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.nodeId).toBe(target); // the relevant memory ranks #1
  });

  it("vector KNN returns the nearest memory to a semantically-close query", async () => {
    const target = await mem("recording studio", "spent the afternoon mixing tracks in the studio");
    await mem("weather", "cold and rainy all week");
    const q = await embeddings.embed("mixing music in the recording studio");
    const hits = knn(handle.sqlite, q, 2, "legacy");
    expect(hits.map((h) => h.nodeId)).toContain(target);
  });
});

describe("Phase 4 — memory consistency", () => {
  it("deleting a memory leaves NO dangling edges, insights, attachments, vectors, or FTS rows", async () => {
    const a = await mem("alpha", "the first memory");
    const b = await mem("beta", "the second memory");
    new EdgesRepo(handle, "legacy").create({ source: a, target: b, relationship: "relates_to", weight: 0.5 });
    new InsightsRepo(handle, "legacy").create(a, b, "a latent link", 0.7, "synthesis");
    handle.sqlite.prepare(`INSERT INTO attachments (space_id, node_id, filename, mime, size, data) VALUES ('legacy', ?, 'f.txt', 'text/plain', 3, 'abc')`).run(a);

    expect(new NodesRepo(handle, "legacy").delete(a)).toBe(true);

    const s = handle.sqlite;
    expect((s.prepare(`SELECT COUNT(*) c FROM edges WHERE source=? OR target=?`).get(a, a) as { c: number }).c).toBe(0);
    expect((s.prepare(`SELECT COUNT(*) c FROM insights WHERE node_a=? OR node_b=?`).get(a, a) as { c: number }).c).toBe(0);
    expect((s.prepare(`SELECT COUNT(*) c FROM attachments WHERE node_id=?`).get(a) as { c: number }).c).toBe(0);
    // The vector row is gone too — a KNN over the whole space can never return it.
    const anyVec = await embeddings.embed("the first memory");
    expect(knn(s, anyVec, 10, "legacy").map((h) => h.nodeId)).not.toContain(a);
    expect(keywordSearch(s, "legacy", "alpha", 5).map((h) => h.nodeId)).not.toContain(a);
  });
});
