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
import { createCognitive, setCognitiveProgress } from "../analysis/cognitive.js";
import { stepSkills } from "../analysis/skills.js";
import { COGNITIVE_META, skillTier } from "@brain/shared";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

/** Log N practice memories supporting a skill. */
async function practice(skillId: number, n: number) {
  const repo = new NodesRepo(handle, "legacy");
  const edges = new EdgesRepo(handle, "legacy");
  for (let i = 0; i < n; i++) {
    const m = repo.create({ label: `p${i}`, type: "daily", content: `practice ${i}` } as never, await embeddings.embed(`practice ${i}`));
    edges.create({ source: m.id, target: skillId, relationship: "supports", weight: 0.7 });
  }
}
const nodeOf = (id: number) => new GraphService(handle, "legacy").getNode(id);

describe("skills leveling (Cognitive Layer Phase 4)", () => {
  it("raises progress + brightness as practice accrues, and reports level-ups", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Guitar", "");
    expect(nodeOf(id)?.progress).toBe(0);
    await practice(id, 6); // 6/10 → progress 0.6 → "Skilled"
    const ups = stepSkills(ctx, "legacy");
    const node = nodeOf(id);
    expect(node?.progress).toBeCloseTo(0.6);
    expect(skillTier(node?.progress ?? 0)).toBe("Skilled");
    // Brighter than a fresh skill.
    expect(node?.importance ?? 0).toBeGreaterThan(COGNITIVE_META.skill.importance);
    // The tier crossing is reported for a nudge.
    expect(ups.map((u) => u.id)).toContain(id);
    expect(ups.find((u) => u.id === id)?.tier).toBe("Skilled");
  });

  it("caps progress at mastery (Expert)", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Chess", "");
    await practice(id, 20); // well past the target of 10
    stepSkills(ctx, "legacy");
    const node = nodeOf(id);
    expect(node?.progress).toBe(1);
    expect(skillTier(node?.progress ?? 0)).toBe("Expert");
  });

  it("only ratchets up — never lowers a manually-set level", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Spanish", "");
    setCognitiveProgress(ctx, "legacy", id, 0.9); // hand-set Advanced
    await practice(id, 2); // practice-derived would be 0.2 — must NOT lower it
    stepSkills(ctx, "legacy");
    expect(nodeOf(id)?.progress).toBeCloseTo(0.9);
  });

  it("is a no-op the second run (no phantom level-ups)", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Running", "");
    await practice(id, 3);
    expect(stepSkills(ctx, "legacy").length).toBe(1); // Novice → Beginner
    expect(stepSkills(ctx, "legacy").length).toBe(0); // nothing new
  });
});
