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
import {
  generateInquiry,
  listInquiries,
  dismissInquiry,
  answerInquiry,
  rejectInquiry,
  confirmInquiry,
} from "../analysis/inquiry.js";
import { isRejected } from "../analysis/rejections.js";

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

describe("inquiry engine (proactive intelligence)", () => {
  it("raises a BRIDGE question when a memory ties two unconnected anchors", async () => {
    // Two people who are not linked to each other...
    const a = await createCognitive(ctx, "legacy", "person_entity", "Alena", "");
    const b = await createCognitive(ctx, "legacy", "person_entity", "Marcus", "");
    // ...and a memory linked to both.
    const m = await mem("dinner", "the evening out");
    const edges = new EdgesRepo(handle, "legacy");
    edges.create({ source: m.id, target: a, relationship: "relates_to", weight: 0.6 });
    edges.create({ source: m.id, target: b, relationship: "relates_to", weight: 0.6 });

    const id = generateInquiry(ctx, "legacy");
    expect(id).not.toBeNull();
    const open = listInquiries(ctx, "legacy");
    expect(open[0]!.kind).toBe("bridge");
    // The question is about both people.
    const labels = open[0]!.nodes.map((n) => n.label);
    expect(labels).toContain("Alena");
    expect(labels).toContain("Marcus");
  });

  it("raises a THEME question when recent memories share a keyword with no hub", async () => {
    // No anchors/hubs → bridge + anchor produce nothing; a repeated keyword remains.
    await mem("m1", "spent the morning bouldering at the gym");
    await mem("m2", "bouldering session went really well");
    await mem("m3", "signed up for a bouldering competition");
    const id = generateInquiry(ctx, "legacy");
    expect(id).not.toBeNull();
    const open = listInquiries(ctx, "legacy");
    expect(open[0]!.kind).toBe("theme");
    expect(open[0]!.question.toLowerCase()).toContain("bouldering");
  });

  it("never re-asks a dismissed inquiry (dedupe by signature)", async () => {
    await mem("m1", "cooking a new pasta recipe tonight");
    await mem("m2", "another pasta recipe experiment");
    await mem("m3", "pasta recipe from grandma finally worked");
    const id = generateInquiry(ctx, "legacy")!;
    expect(dismissInquiry(ctx, "legacy", id)).toBe(true);
    // Same situation → no new inquiry (its signature is remembered).
    expect(generateInquiry(ctx, "legacy")).toBeNull();
    expect(listInquiries(ctx, "legacy").length).toBe(0);
  });

  it("caps the number of open inquiries", async () => {
    // Enough distinct themes to exceed the cap; only MAX_OPEN (3) should hold open.
    const themes = ["guitar", "running", "spanish", "chess", "baking"];
    for (const t of themes) {
      await mem(`${t} a`, `worked on ${t} today`);
      await mem(`${t} b`, `more ${t} practice`);
      await mem(`${t} c`, `${t} is coming along`);
    }
    for (let i = 0; i < 8; i++) generateInquiry(ctx, "legacy");
    expect(listInquiries(ctx, "legacy").length).toBeLessThanOrEqual(3);
  });

  it("answering ingests the reply, links it to the bodies asked about, and closes it", async () => {
    const a = await createCognitive(ctx, "legacy", "person_entity", "Alena", "");
    const b = await createCognitive(ctx, "legacy", "person_entity", "Marcus", "");
    const m = await mem("dinner", "the evening out");
    const edges = new EdgesRepo(handle, "legacy");
    edges.create({ source: m.id, target: a, relationship: "relates_to", weight: 0.6 });
    edges.create({ source: m.id, target: b, relationship: "relates_to", weight: 0.6 });
    const id = generateInquiry(ctx, "legacy")!;

    const res = await answerInquiry(ctx, "legacy", id, "They're old friends who introduced me to each other.");
    expect(res).not.toBeNull();
    const newId = res!.nodeIds[0]!;
    // The answer is linked to both people she asked about.
    expect(edges.exists(newId, a) || edges.exists(a, newId)).toBe(true);
    expect(edges.exists(newId, b) || edges.exists(b, newId)).toBe(true);
    // And the inquiry is no longer open.
    expect(listInquiries(ctx, "legacy").length).toBe(0);
    // Answering a missing/closed inquiry is a no-op.
    expect(await answerInquiry(ctx, "legacy", id, "again")).toBeNull();
  });

  it("'these don't relate' severs the edges, records the rejection, and never re-asks", async () => {
    const a = await createCognitive(ctx, "legacy", "person_entity", "Alena", "");
    const b = await createCognitive(ctx, "legacy", "person_entity", "Marcus", "");
    const m = await mem("dinner", "the evening out");
    const edges = new EdgesRepo(handle, "legacy");
    edges.create({ source: m.id, target: a, relationship: "relates_to", weight: 0.6 });
    edges.create({ source: m.id, target: b, relationship: "relates_to", weight: 0.6 });
    const id = generateInquiry(ctx, "legacy")!;

    expect(rejectInquiry(ctx, "legacy", id)).toBe(true);
    // The pair is remembered as unrelated...
    expect(isRejected(ctx, "legacy", a, b)).toBe(true);
    // ...the edges she drew between them are gone...
    expect(edges.exists(a, b) || edges.exists(b, a)).toBe(false);
    // ...the inquiry is closed, and the same situation won't be re-raised.
    expect(listInquiries(ctx, "legacy").length).toBe(0);
    expect(generateInquiry(ctx, "legacy")).toBeNull();
  });

  it("'yes, connect' draws the edge between the bodies she surfaced (bridge)", async () => {
    const a = await createCognitive(ctx, "legacy", "person_entity", "Alena", "");
    const b = await createCognitive(ctx, "legacy", "person_entity", "Marcus", "");
    const m = await mem("dinner", "the evening out");
    const edges = new EdgesRepo(handle, "legacy");
    edges.create({ source: m.id, target: a, relationship: "relates_to", weight: 0.6 });
    edges.create({ source: m.id, target: b, relationship: "relates_to", weight: 0.6 });
    const id = generateInquiry(ctx, "legacy")!;

    expect(confirmInquiry(ctx, "legacy", id)).toBe(true);
    expect(edges.exists(a, b) || edges.exists(b, a)).toBe(true); // now connected
    expect(listInquiries(ctx, "legacy").length).toBe(0);
  });

  it("stays quiet when there's nothing worth asking", async () => {
    await mem("solo", "a single unrelated note about the weather");
    expect(generateInquiry(ctx, "legacy")).toBeNull();
  });
});
