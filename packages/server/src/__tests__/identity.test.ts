import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { GraphService } from "../graph/service.js";
import { createCognitive } from "../analysis/cognitive.js";
import { stepIdentities, cognitiveEvidence } from "../analysis/identity.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

async function mem(label: string, content: string) {
  return new NodesRepo(handle, "legacy").create(
    { label, type: "daily", content } as never,
    await embeddings.embed(content),
  );
}
const nodeOf = (id: number) => new GraphService(handle, "legacy").getNode(id);

describe("identity core (Cognitive Layer Phase 5)", () => {
  it("classifies mentions as affirming vs contesting and brightens/dims accordingly", async () => {
    await mem("a", "spent all day as a builder on the site");
    await mem("b", "proud to be a builder, made real progress");
    await mem("c", "honestly I'm not a builder anymore, I quit that");
    const id = await createCognitive(ctx, "legacy", "identity", "builder", "");

    stepIdentities(ctx, "legacy");
    const ev = cognitiveEvidence(ctx, "legacy", id)!;
    expect(ev.for.length).toBe(2);
    expect(ev.against.length).toBe(1);
    expect(ev.confidence).toBeCloseTo(2 / 3);
  });

  it("a heavily-contested identity dims below a strongly-affirmed one", async () => {
    const affirmed = await createCognitive(ctx, "legacy", "identity", "runner", "");
    await mem("r1", "runner through and through, ran a marathon");
    await mem("r2", "as a runner I feel unstoppable");
    const contested = await createCognitive(ctx, "legacy", "identity", "painter", "");
    await mem("p1", "I'm not a painter, I gave up painting");
    await mem("p2", "no longer a painter these days");

    stepIdentities(ctx, "legacy");
    expect(nodeOf(affirmed)?.importance ?? 0).toBeGreaterThan(nodeOf(contested)?.importance ?? 1);
  });

  it("flipping the evidence moves an affirming memory to contesting (no stale supports)", async () => {
    const m = await mem("x", "I am a writer, wrote every morning");
    const id = await createCognitive(ctx, "legacy", "identity", "writer", "");
    stepIdentities(ctx, "legacy");
    expect(cognitiveEvidence(ctx, "legacy", id)!.for.map((n) => n.id)).toContain(m.id);

    // The memory changes: now it negates the identity.
    handle.sqlite.prepare(`UPDATE nodes SET content = ? WHERE id = ?`).run("I'm not a writer, I stopped writing", m.id);
    stepIdentities(ctx, "legacy");
    const ev = cognitiveEvidence(ctx, "legacy", id)!;
    expect(ev.for.length).toBe(0);
    expect(ev.against.map((n) => n.id)).toContain(m.id);
  });

  it("only counts a negation as contesting when it's NEAR the identity mention", async () => {
    // "not" is far from "builder" here → this is AFFIRMING, not contesting.
    const m = await mem("x", "not everything went well today, but I'm still a builder at heart");
    const id = await createCognitive(ctx, "legacy", "identity", "builder", "");
    stepIdentities(ctx, "legacy");
    const ev = cognitiveEvidence(ctx, "legacy", id)!;
    expect(ev.against.length).toBe(0);
    expect(ev.for.map((n) => n.id)).toContain(m.id);
  });

  it("evidence for a non-identity anchor reports supporters as 'for' only", async () => {
    await mem("g", "sailing lesson number three");
    const goal = await createCognitive(ctx, "legacy", "goal", "sailing", "");
    const ev = cognitiveEvidence(ctx, "legacy", goal)!;
    expect(ev.against.length).toBe(0);
    expect(ev.for.length).toBeGreaterThanOrEqual(1);
  });
});
