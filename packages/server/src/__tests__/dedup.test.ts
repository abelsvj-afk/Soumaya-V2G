import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { AttachmentsRepo } from "../repositories/attachments.repo.js";
import { mergeMemories, combineContent, sweepDuplicates } from "../analysis/dedup.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

async function mem(label: string, content = label) {
  return new NodesRepo(handle, "legacy").create({ label, type: "daily", content } as never, await embeddings.embed(content));
}
const live = () =>
  handle.sqlite.prepare(`SELECT id FROM nodes WHERE space_id='legacy' AND deleted_at IS NULL AND (kind IS NULL OR kind='memory')`).all() as { id: number }[];

describe("memory de-duplication (true merge)", () => {
  it("combineContent is lossless (keeps superset or merges unique lines)", () => {
    expect(combineContent("a big note", "big")).toBe("a big note"); // superset kept
    expect(combineContent("line one", "line two")).toBe("line one\nline two"); // both kept
  });

  it("mergeMemories keeps content, PHOTOS, and edges — nothing is lost", async () => {
    const keep = await mem("morning run", "ran 5k this morning");
    const drop = await mem("run", "did a 5k run, felt good");
    const other = await mem("shoes", "bought new running shoes");
    const edges = new EdgesRepo(handle, "legacy");
    edges.create({ source: other.id, target: drop.id, relationship: "relates_to", weight: 0.6 }); // a link only the dropped one had
    const atts = new AttachmentsRepo(handle, "legacy");
    atts.create(drop.id, "run.jpg", "image/jpeg", 1000, "base64data"); // a photo on the dropped one

    const ok = await mergeMemories(ctx, "legacy", keep.id, drop.id, combineContent(keep.content, drop.content));
    expect(ok).toBe(true);
    // The duplicate is gone; the survivor (and the unrelated "shoes") remain.
    const liveIds = live().map((r) => r.id);
    expect(liveIds).toContain(keep.id);
    expect(liveIds).not.toContain(drop.id);
    // The photo followed the survivor.
    expect(atts.listByNode(keep.id).length).toBe(1);
    expect(atts.listByNode(drop.id).length).toBe(0);
    // The dropped memory's edge now points at the survivor.
    expect(edges.exists(other.id, keep.id)).toBe(true);
    // Both original texts are preserved in the merged content.
    const survivor = new NodesRepo(handle, "legacy").getById(keep.id)!;
    expect(survivor.content).toContain("ran 5k this morning");
    expect(survivor.content).toContain("felt good");
  });

  it("sweepDuplicates finds and merges near-identical memories, keeping the oldest", async () => {
    const a = await mem("note", "the exact same thought written twice");
    const b = await mem("note copy", "the exact same thought written twice"); // identical → sim 1.0
    await mem("unrelated", "a totally different subject about gardening");
    const n = await sweepDuplicates(ctx, "legacy", { threshold: 0.92 });
    expect(n).toBe(1);
    const ids = live().map((r) => r.id);
    expect(ids).toContain(a.id); // the older one survives
    expect(ids).not.toContain(b.id);
  });
});
