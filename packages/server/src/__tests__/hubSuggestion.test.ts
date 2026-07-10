import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { suggestHub, promoteConstellation } from "../analysis/constellations.js";
import { generateInquiry, listInquiries, dismissInquiry } from "../analysis/inquiry.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

/** A deterministic unit vector so we can force a tight (cohesion ~1) cluster. */
function vec(seed: number): Float32Array {
  const v = new Float32Array(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) v[i] = Math.sin((i + 1) * seed);
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < EMBED_DIM; i++) v[i] = (v[i] ?? 0) / n;
  return v;
}

/** Six memories on one shared topic vector → a single dense, un-hubbed cluster. */
function seedCluster() {
  const nodes = new NodesRepo(handle, "legacy");
  const topic = vec(1);
  const contents = [
    "bouldering at the crag this morning",
    "another bouldering session went well",
    "signed up for a bouldering competition",
    "bought new bouldering shoes",
    "bouldering with friends after work",
    "a hard bouldering project finally sent",
  ];
  return contents.map((c, i) =>
    nodes.create({ label: `climb ${i}`, type: "daily", content: c } as never, topic),
  );
}

describe("hub suggestion (feature #5c)", () => {
  it("suggestHub surfaces a dense, un-hubbed cluster with a name", () => {
    seedCluster();
    const hub = suggestHub(ctx, "legacy");
    expect(hub).not.toBeNull();
    expect(hub!.memberIds.length).toBeGreaterThanOrEqual(5);
    expect(hub!.name.trim().length).toBeGreaterThan(0);
  });

  it("promoteConstellation creates a moc hub that summarizes its members", async () => {
    const members = seedCluster();
    const ids = members.map((m) => m.id);
    const hub = await promoteConstellation(ctx, "legacy", "Bouldering", ids);
    expect(hub).not.toBeNull();
    expect(hub!.kind).toBe("moc");

    // Every member is linked from the hub with a 'summarizes' edge.
    const edges = new EdgesRepo(handle, "legacy");
    for (const id of ids) expect(edges.exists(hub!.id, id)).toBe(true);
  });

  it("stops suggesting the cluster once it has been promoted to a hub", async () => {
    const members = seedCluster();
    await promoteConstellation(ctx, "legacy", "Bouldering", members.map((m) => m.id));
    // The whole cluster is now under a moc → no fresh suggestion.
    expect(suggestHub(ctx, "legacy")).toBeNull();
  });

  it("generateInquiry raises a hub_suggestion the user can confirm", () => {
    seedCluster();
    // A shared-keyword theme noticing fires first; drain the lighter noticings
    // (dismissing so their signatures are remembered) and the hub proposal surfaces.
    let hub = listInquiries(ctx, "legacy").find((q) => q.kind === "hub_suggestion");
    for (let i = 0; i < 6 && !hub; i++) {
      const id = generateInquiry(ctx, "legacy");
      if (id === null) break;
      const open = listInquiries(ctx, "legacy");
      hub = open.find((q) => q.kind === "hub_suggestion");
      if (!hub) for (const q of open) dismissInquiry(ctx, "legacy", q.id);
    }
    expect(hub).toBeTruthy();
    // The suggested name rides in the question so /confirm can reuse it.
    expect(hub!.question).toMatch(/"[^"]+"/);
  });
});
