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
import {
  createCognitive,
  listCognitive,
  setCognitiveProgress,
  applyCognitiveGravity,
} from "../analysis/cognitive.js";
import { COGNITIVE_META } from "@brain/shared";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

describe("cognitive layer (goals/ideas/skills/… as first-class bodies)", () => {
  it("creates a cognitive object with meta-derived colour/importance/progress", async () => {
    const id = await createCognitive(ctx, "legacy", "goal", "Ship Soumaya", "Get the second brain live");
    const node = new GraphService(handle, "legacy").getNode(id);
    expect(node?.kind).toBe("goal");
    expect(node?.type).toBe("concept");
    expect(node?.color).toBe(COGNITIVE_META.goal.color);
    expect(node?.importance).toBeCloseTo(COGNITIVE_META.goal.importance);
    // Goals carry progress; it starts at 0.
    expect(node?.progress).toBe(0);
  });

  it("leaves progress null for kinds that don't track it", async () => {
    const id = await createCognitive(ctx, "legacy", "identity", "A builder", "");
    const node = new GraphService(handle, "legacy").getNode(id);
    expect(node?.kind).toBe("identity");
    expect(node?.progress ?? null).toBeNull();
  });

  it("lists cognitive objects (all, or filtered by kind) with degree", async () => {
    await createCognitive(ctx, "legacy", "goal", "Goal A", "");
    await createCognitive(ctx, "legacy", "skill", "Skill A", "");
    const all = listCognitive(ctx, "legacy");
    expect(all.length).toBe(2);
    const goals = listCognitive(ctx, "legacy", "goal");
    expect(goals.length).toBe(1);
    const first = goals[0]!;
    expect(first.label).toBe("Goal A");
    expect(first.degree).toBe(0);
  });

  it("clamps progress to 0..1 and returns false for a missing id", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Guitar", "");
    expect(setCognitiveProgress(ctx, "legacy", id, 1.5)).toBe(true);
    expect(new GraphService(handle, "legacy").getNode(id)?.progress).toBe(1);
    expect(setCognitiveProgress(ctx, "legacy", id, -3)).toBe(true);
    expect(new GraphService(handle, "legacy").getNode(id)?.progress).toBe(0);
    expect(setCognitiveProgress(ctx, "legacy", 999999, 0.5)).toBe(false);
  });

  it("gravity forms supports edges from similar memories to a goal, capped per anchor", async () => {
    const repo = new NodesRepo(handle, "legacy");
    // Five near-identical memories about the same theme → all strongly similar.
    for (let i = 0; i < 5; i++) {
      repo.create(
        { label: `guitar practice ${i}`, type: "daily", content: "practiced guitar scales today" } as never,
        await embeddings.embed("practiced guitar scales today"),
      );
    }
    const goalId = await createCognitive(ctx, "legacy", "goal", "Master guitar", "practiced guitar scales today");

    const formed = applyCognitiveGravity(ctx, "legacy");
    // Capped at MAX_PER_ANCHOR (3) even though 5 memories match.
    expect(formed).toBe(3);

    const edges = new EdgesRepo(handle, "legacy");
    const supports = handle.sqlite
      .prepare(`SELECT COUNT(*) AS c FROM edges WHERE space_id = 'legacy' AND relationship = 'supports' AND target = ?`)
      .get(goalId) as { c: number };
    expect(supports.c).toBe(3);
    // Re-running is idempotent-ish: it won't exceed the cap on the same anchor+memories.
    void edges;
  });

  it("gravity never links a cognitive anchor to another anchor (only real memories)", async () => {
    await createCognitive(ctx, "legacy", "goal", "Goal one", "shared theme text");
    await createCognitive(ctx, "legacy", "goal", "Goal two", "shared theme text");
    const formed = applyCognitiveGravity(ctx, "legacy");
    expect(formed).toBe(0); // no real memories to pull; anchors don't pull each other
  });

  it("durable cognitive kinds are entropy-exempt (mass doesn't cool)", async () => {
    const id = await createCognitive(ctx, "legacy", "goal", "Enduring goal", "");
    // Backdate it far into the past — a normal memory would have cooled.
    handle.sqlite.prepare(`UPDATE nodes SET last_tended_at = datetime('now','-400 days') WHERE id = ?`).run(id);
    const node = new GraphService(handle, "legacy").getNode(id);
    // entropy 0 → the celestial enrichment keeps full importance-driven mass.
    expect(node?.celestial).toBeTruthy();
    expect(node?.entropy ?? 0).toBe(0);
  });
});
