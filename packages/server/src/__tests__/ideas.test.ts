import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { GraphService } from "../graph/service.js";
import { createCognitive } from "../analysis/cognitive.js";
import { stepIdeas, promoteIdeaToGoal, ripeIdeaIds } from "../analysis/ideas.js";
import { COGNITIVE_META } from "@brain/shared";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

/** Attach N supporting memories to a cognitive object. */
async function support(anchorId: number, n: number, theme = "supporting note") {
  const repo = new NodesRepo(handle, "legacy");
  const edges = new EdgesRepo(handle, "legacy");
  for (let i = 0; i < n; i++) {
    const m = repo.create({ label: `s${i}`, type: "daily", content: `${theme} ${i}` } as never, await embeddings.embed(`${theme} ${i}`));
    edges.create({ source: m.id, target: anchorId, relationship: "supports", weight: 0.7 });
  }
}
const importanceOf = (id: number) => new GraphService(handle, "legacy").getNode(id)?.importance ?? 0;

describe("ideas lifecycle (Cognitive Layer Phase 3)", () => {
  it("grows an idea's importance as memories come to support it", async () => {
    const id = await createCognitive(ctx, "legacy", "idea", "A weekend maker fair", "");
    const base = importanceOf(id);
    await support(id, 3, "weekend maker fair prep");
    stepIdeas(ctx, "legacy");
    expect(importanceOf(id)).toBeGreaterThan(base);
  });

  it("dims a stale idea and archives one that is fully ignored + unsupported", async () => {
    const id = await createCognitive(ctx, "legacy", "idea", "A fleeting notion", "");
    // Backdate it well past the archive window with zero support.
    handle.sqlite.prepare(`UPDATE nodes SET last_tended_at = datetime('now','-45 days') WHERE id = ?`).run(id);
    const res = stepIdeas(ctx, "legacy");
    expect(res.faded).toBeGreaterThanOrEqual(1);
    // It has faded out of the galaxy entirely.
    expect(new GraphService(handle, "legacy").getNode(id)).toBeUndefined();
  });

  it("merges two near-identical ideas into one, preserving support", async () => {
    const a = await createCognitive(ctx, "legacy", "idea", "Start a podcast", "a show about space");
    const b = await createCognitive(ctx, "legacy", "idea", "Start a podcast", "a show about space");
    await support(a, 2, "podcast idea");
    await support(b, 1, "podcast idea other");
    const res = stepIdeas(ctx, "legacy");
    expect(res.merged).toBe(1);
    // Exactly one idea remains...
    const ideas = handle.sqlite
      .prepare(`SELECT id FROM nodes WHERE space_id = 'legacy' AND kind = 'idea' AND deleted_at IS NULL`)
      .all() as { id: number }[];
    expect(ideas.length).toBe(1);
    // ...and it carries all three supporting memories.
    const survivor = ideas[0]!.id;
    const sup = handle.sqlite
      .prepare(`SELECT COUNT(*) AS c FROM edges WHERE space_id = 'legacy' AND target = ? AND relationship = 'supports'`)
      .get(survivor) as { c: number };
    expect(sup.c).toBe(3);
  });

  it("flags ripe ideas and promotes one into a goal", async () => {
    const id = await createCognitive(ctx, "legacy", "idea", "Learn to sail", "");
    await support(id, 4, "sailing lessons");
    expect(ripeIdeaIds(ctx, "legacy")).toContain(id);

    expect(promoteIdeaToGoal(ctx, "legacy", id)).toBe(true);
    const node = new GraphService(handle, "legacy").getNode(id);
    expect(node?.kind).toBe("goal");
    expect(node?.importance).toBeCloseTo(COGNITIVE_META.goal.importance);
    expect(node?.progress).toBe(0); // goals carry progress
    // Promoting a non-idea is a no-op.
    expect(promoteIdeaToGoal(ctx, "legacy", id)).toBe(false);
  });
});
