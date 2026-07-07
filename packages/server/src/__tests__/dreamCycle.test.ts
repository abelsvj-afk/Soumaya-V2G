import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { runDreamCycle } from "../analysis/dreamCycle.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

/** Build a hub memory wired to `n` neighbors — a consolidatable cluster. */
async function makeCluster(spaceId: string, n: number): Promise<number> {
  const repo = new NodesRepo(handle, spaceId);
  const edges = new EdgesRepo(handle, spaceId);
  const hub = repo.create(
    { label: "money worry", type: "daily", content: "always anxious about money" } as never,
    await embeddings.embed("money anxiety debt"),
  );
  for (let i = 0; i < n; i++) {
    const m = repo.create(
      { label: `bill ${i}`, type: "daily", content: `stressed about bill ${i}`, emotionalWeight: -0.6 } as never,
      await embeddings.embed(`bill money stress ${i}`),
    );
    edges.create({ source: hub.id, target: m.id, relationship: "relates_to", weight: 0.7 });
  }
  return hub.id;
}

describe("dream cycle (consolidation → beliefs)", () => {
  it("consolidates a dense cluster into a belief node with summarizes edges", async () => {
    const hub = await makeCluster("legacy", 5);
    const beliefId = await runDreamCycle(ctx, "legacy", false); // offline template path
    expect(beliefId).not.toBeNull();

    const belief = new NodesRepo(handle, "legacy").getById(beliefId!);
    expect(belief?.kind).toBe("belief");
    expect(belief?.content.length).toBeGreaterThan(0);
    // It summarizes its evidence, including the hub.
    const evidence = handle.sqlite
      .prepare(`SELECT target FROM edges WHERE source = ? AND relationship = 'summarizes'`)
      .all(beliefId) as { target: number }[];
    expect(evidence.length).toBeGreaterThanOrEqual(5);
    expect(evidence.some((e) => e.target === hub)).toBe(true);
  });

  it("returns null when no cluster is dense enough", async () => {
    const repo = new NodesRepo(handle, "legacy");
    repo.create({ label: "lonely note", type: "daily", content: "a single thought" } as never, await embeddings.embed("lonely"));
    expect(await runDreamCycle(ctx, "legacy", false)).toBeNull();
  });

  it("revises the SAME belief node instead of duplicating (add-only)", async () => {
    await makeCluster("legacy", 5);
    const first = await runDreamCycle(ctx, "legacy", false);
    // Backdate the belief so the 3-day freshness guard lets it revise.
    handle.sqlite.prepare(`UPDATE nodes SET last_tended_at = datetime('now','-5 days') WHERE id = ?`).run(first);
    const second = await runDreamCycle(ctx, "legacy", false);
    expect(second).toBe(first); // same node, revised — not a duplicate
    const beliefCount = (handle.sqlite.prepare(`SELECT COUNT(*) c FROM nodes WHERE kind = 'belief'`).get() as { c: number }).c;
    expect(beliefCount).toBe(1);
    // The prior belief text was appended as a lore chapter (versioned history).
    const versions = (handle.sqlite.prepare(`SELECT COUNT(*) c FROM lore WHERE subject_id = ?`).get(String(first)) as { c: number }).c;
    expect(versions).toBeGreaterThanOrEqual(2);
  });

  it("beliefs never cool (entropy exempt like hubs)", async () => {
    await makeCluster("legacy", 5);
    const id = await runDreamCycle(ctx, "legacy", false);
    handle.sqlite.prepare(`UPDATE nodes SET last_tended_at = datetime('now','-60 days') WHERE id = ?`).run(id);
    const { GraphService } = await import("../graph/service.js");
    const node = new GraphService(handle, "legacy").getNode(id!);
    expect(node?.entropy ?? 1).toBe(0);
  });
});
