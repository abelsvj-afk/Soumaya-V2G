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
  it("raises progress + brightness gently as practice accrues", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Guitar", "");
    expect(nodeOf(id)?.progress).toBe(0);
    await practice(id, 12); // 12/30 → 0.4 → "Practiced"
    const ups = stepSkills(ctx, "legacy");
    const node = nodeOf(id);
    expect(node?.progress).toBeCloseTo(0.4);
    expect(skillTier(node?.progress ?? 0)).toBe("Practiced");
    // Brighter than a fresh skill.
    expect(node?.importance ?? 0).toBeGreaterThan(COGNITIVE_META.skill.importance);
    // The tier crossing is reported for a nudge.
    expect(ups.map((u) => u.id)).toContain(id);
  });

  it("auto-practice NEVER reaches Expert — it caps at AUTO_CAP (0.5, 'Skilled')", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Chess", "");
    await practice(id, 100); // absurd pile-on can't crown you
    stepSkills(ctx, "legacy");
    const node = nodeOf(id);
    expect(node?.progress).toBeCloseTo(0.5);
    expect(skillTier(node?.progress ?? 0)).not.toBe("Expert");
  });

  it("only ratchets up — never lowers a manually-set mastery", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Spanish", "");
    setCognitiveProgress(ctx, "legacy", id, 0.9); // hand-set Advanced/Expert
    await practice(id, 6); // auto-derived 0.2 — must NOT lower deliberate mastery
    stepSkills(ctx, "legacy");
    expect(nodeOf(id)?.progress).toBeCloseTo(0.9);
  });

  it("a manual DOWN-adjust now sticks (auto can't ratchet it back to 100)", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Coding", "");
    await practice(id, 100); // piled on → auto floor 0.5
    stepSkills(ctx, "legacy");
    setCognitiveProgress(ctx, "legacy", id, 0.1); // user says "I've barely started"
    stepSkills(ctx, "legacy"); // must not shoot back to 100
    expect(nodeOf(id)?.progress).toBeCloseTo(0.5); // settles at the auto floor, not 1.0
    expect(skillTier(nodeOf(id)?.progress ?? 0)).not.toBe("Expert");
  });

  it("is a no-op the second run (no phantom level-ups)", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Running", "");
    await practice(id, 12);
    expect(stepSkills(ctx, "legacy").length).toBe(1); // crossed into a new tier once
    expect(stepSkills(ctx, "legacy").length).toBe(0); // nothing new
  });
});
