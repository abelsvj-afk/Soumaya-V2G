import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { createCognitive } from "../analysis/cognitive.js";
import { personProfile, mergeDuplicatePeople, suggestPeople } from "../analysis/people.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

async function mem(label: string, content: string, emotion?: number) {
  const repo = new NodesRepo(handle, "legacy");
  const n = repo.create({ label, type: "daily", content, emotionalWeight: emotion } as never, await embeddings.embed(content));
  return n;
}

describe("people as entities (Cognitive Layer Phase 6)", () => {
  it("builds a CRM profile: interactions, recency, and warm tone", async () => {
    const id = await createCognitive(ctx, "legacy", "person_entity", "Maya", "");
    const edges = new EdgesRepo(handle, "legacy");
    const a = await mem("m1", "great coffee with Maya", 0.6);
    const b = await mem("m2", "Maya cheered me up", 0.5);
    edges.create({ source: a.id, target: id, relationship: "supports", weight: 0.7 });
    edges.create({ source: b.id, target: id, relationship: "supports", weight: 0.7 });

    const profile = personProfile(ctx, "legacy", id)!;
    expect(profile.count).toBe(2);
    expect(profile.tone).toBe("warm");
    expect(profile.interactions.map((i) => i.id)).toContain(a.id);
    // A non-person returns null.
    const goal = await createCognitive(ctx, "legacy", "goal", "Ship it", "");
    expect(personProfile(ctx, "legacy", goal)).toBeNull();
  });

  it("reports a mixed tone when interactions are both warm and heavy", async () => {
    const id = await createCognitive(ctx, "legacy", "person_entity", "Sam", "");
    const edges = new EdgesRepo(handle, "legacy");
    const a = await mem("m1", "fun day with Sam", 0.7);
    const b = await mem("m2", "a hard argument with Sam", -0.7);
    edges.create({ source: a.id, target: id, relationship: "supports", weight: 0.7 });
    edges.create({ source: b.id, target: id, relationship: "supports", weight: 0.7 });
    expect(personProfile(ctx, "legacy", id)!.tone).toBe("mixed");
  });

  it("merges duplicate person entities, folding their interactions onto one", async () => {
    const keep = await createCognitive(ctx, "legacy", "person_entity", "Danny", "");
    const dup = await createCognitive(ctx, "legacy", "person_entity", "Danny", "");
    const edges = new EdgesRepo(handle, "legacy");
    const a = await mem("m1", "hung out", 0.4);
    const b = await mem("m2", "called them", 0.4);
    edges.create({ source: a.id, target: keep, relationship: "supports", weight: 0.7 });
    edges.create({ source: b.id, target: dup, relationship: "supports", weight: 0.7 });

    expect(mergeDuplicatePeople(ctx, "legacy")).toBe(1);
    const remaining = handle.sqlite
      .prepare(`SELECT id FROM nodes WHERE space_id = 'legacy' AND kind = 'person_entity' AND deleted_at IS NULL`)
      .all() as { id: number }[];
    expect(remaining.length).toBe(1);
    // The survivor carries both interactions.
    expect(personProfile(ctx, "legacy", remaining[0]!.id)!.count).toBe(2);
  });

  it("suggests recurring names you mention but haven't added, ignoring noise + existing", async () => {
    await mem("m1", "lunch with Priya downtown");
    await mem("m2", "Priya sent me the notes");
    await mem("m3", "Priya and I planned the trip");
    await mem("m4", "solo walk on Monday morning"); // Monday = stopword, single mention
    // Already-added people are never suggested.
    await createCognitive(ctx, "legacy", "person_entity", "Carlos", "");
    await mem("m5", "Carlos joined too");
    await mem("m6", "Carlos again");

    const sugg = suggestPeople(ctx, "legacy");
    const names = sugg.map((s) => s.name);
    expect(names).toContain("Priya");
    expect(names).not.toContain("Monday");
    expect(names).not.toContain("Carlos"); // already an entity
  });
});
