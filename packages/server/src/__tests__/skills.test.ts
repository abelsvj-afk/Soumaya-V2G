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
    await practice(id, 12); // exactly at MAX_ANCHOR_LINKS → 12/60 → 0.2 → "Beginner"
    const ups = stepSkills(ctx, "legacy");
    const node = nodeOf(id);
    expect(node?.progress).toBeCloseTo(0.2);
    expect(skillTier(node?.progress ?? 0)).toBe("Beginner");
    // Brighter than a fresh skill.
    expect(node?.importance ?? 0).toBeGreaterThan(COGNITIVE_META.skill.importance);
    // The tier crossing is reported for a nudge.
    expect(ups.map((u) => u.id)).toContain(id);
  });

  // Regression test for the actual bug report: a skill that accumulated way more
  // supporting memories than linkCognitiveAnchor would ever add on its own (from
  // before MAX_ANCHOR_LINKS existed, or any other bypass) used to keep reading its
  // full inflated count FOREVER — stepSkills now self-heals it by trimming down to
  // the cap on every run, not just clamping the resulting percentage.
  it("self-heals an over-linked skill: TRIMS its edges down to the cap, not just the math", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Chess", "");
    await practice(id, 100); // absurd pile-on, bypassing the normal linking cap entirely
    const before = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM edges WHERE space_id = 'legacy' AND target = ? AND relationship = 'supports'`).get(id) as { c: number }).c;
    expect(before).toBe(100);

    stepSkills(ctx, "legacy");

    const after = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM edges WHERE space_id = 'legacy' AND target = ? AND relationship = 'supports'`).get(id) as { c: number }).c;
    expect(after).toBe(12); // trimmed down to MAX_ANCHOR_LINKS, not left at 100
    const node = nodeOf(id);
    expect(node?.progress).toBeCloseTo(0.2); // reflects the TRIMMED count (12/60), not 100/60
    expect(skillTier(node?.progress ?? 0)).not.toBe("Expert");
  });

  it("only ratchets up — never lowers a manually-set mastery", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Spanish", "");
    setCognitiveProgress(ctx, "legacy", id, 0.9); // hand-set Advanced/Expert
    await practice(id, 6); // auto-derived 0.1 — must NOT lower deliberate mastery
    stepSkills(ctx, "legacy");
    expect(nodeOf(id)?.progress).toBeCloseTo(0.9);
  });

  it("a manual DOWN-adjust now sticks (auto can't ratchet it back to 100)", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Coding", "");
    await practice(id, 100); // piled on → trimmed to 12 → auto floor 0.2
    stepSkills(ctx, "legacy");
    setCognitiveProgress(ctx, "legacy", id, 0.1); // user says "I've barely started"
    stepSkills(ctx, "legacy"); // must not shoot back up
    expect(nodeOf(id)?.progress).toBeCloseTo(0.2); // settles at the auto floor, not higher
    expect(skillTier(nodeOf(id)?.progress ?? 0)).not.toBe("Expert");
  });

  it("is a no-op the second run (no phantom level-ups)", async () => {
    const id = await createCognitive(ctx, "legacy", "skill", "Running", "");
    await practice(id, 12);
    expect(stepSkills(ctx, "legacy").length).toBe(1); // crossed into a new tier once
    expect(stepSkills(ctx, "legacy").length).toBe(0); // nothing new
  });
});
