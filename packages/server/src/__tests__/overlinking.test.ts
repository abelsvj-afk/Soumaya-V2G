import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { GraphService } from "../graph/service.js";
import { createCognitive, applyCognitiveGravity, pruneAnchorLinks, trimAnchorLinks } from "../analysis/cognitive.js";
import { suggestPeople } from "../analysis/people.js";

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
const degreeOf = (id: number) => new GraphService(handle, "legacy").getNode(id)?.degree ?? 0;

describe("anchor over-linking fixes", () => {
  it("a common-word name ('Will') does NOT link to every memory using that word", async () => {
    await mem("plan", "I will call the bank tomorrow");
    await mem("chore", "will finish the laundry");
    await mem("note", "she will visit next week");
    const willId = await createCognitive(ctx, "legacy", "person_entity", "Will", "");
    applyCognitiveGravity(ctx, "legacy");
    expect(degreeOf(willId)).toBe(0); // "will" is filtered as a common word
  });

  it("a distinctive name still connects the memories that name it", async () => {
    await mem("dinner", "had dinner with Marcus downtown");
    await mem("call", "Marcus called about the project");
    await mem("unrelated", "watered the plants this morning");
    const marcus = await createCognitive(ctx, "legacy", "person_entity", "Marcus", "");
    applyCognitiveGravity(ctx, "legacy");
    expect(degreeOf(marcus)).toBe(2); // the two that name him, not the plant one
  });

  it("caps how many memories an anchor auto-gathers (no runaway hubs)", async () => {
    for (let i = 0; i < 25; i++) await mem(`m${i}`, `note about Marcus item ${i}`);
    const marcus = await createCognitive(ctx, "legacy", "person_entity", "Marcus", "");
    applyCognitiveGravity(ctx, "legacy");
    applyCognitiveGravity(ctx, "legacy"); // runs again — must not keep accreting past the cap
    expect(degreeOf(marcus)).toBeLessThanOrEqual(12);
  });

  it("suggestPeople ignores common capitalised words and over-frequent terms", async () => {
    // "Research"/"Deep" appear capitalised in many memories — NOT people.
    for (let i = 0; i < 15; i++) await mem(`r${i}`, `Deep Research session number ${i} today`);
    await mem("real1", "met Alena for coffee");
    await mem("real2", "Alena sent the files");
    const names = suggestPeople(ctx, "legacy").map((p) => p.name.toLowerCase());
    expect(names).not.toContain("research");
    expect(names).not.toContain("deep");
    expect(names).toContain("alena");
  });

  it("trimAnchorLinks thins a runaway hub down to the cap, keeping the strongest", async () => {
    const goal = await createCognitive(ctx, "legacy", "goal", "Ship the app", "");
    const edges = new (await import("../repositories/edges.repo.js")).EdgesRepo(handle, "legacy");
    const ids: number[] = [];
    for (let i = 0; i < 20; i++) { const m = await mem(`g${i}`); ids.push(m.id); edges.create({ source: m.id, target: goal, relationship: "supports", weight: 0.5 + i * 0.02 }); }
    const removed = trimAnchorLinks(ctx, "legacy", goal, 12);
    expect(removed).toBe(8);
    expect(degreeOf(goal)).toBe(12);
  });
});
