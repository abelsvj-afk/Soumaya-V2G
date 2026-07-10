import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { generateInquiry, listInquiries, answerInquiry } from "../analysis/inquiry.js";
import { seedWelcomeStar } from "../analysis/welcome.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

/** A deterministic unit vector — different seeds are far apart in cosine space. */
function vec(seed: number): Float32Array {
  const v = new Float32Array(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) v[i] = Math.sin((i + 1) * seed) + Math.cos((i + 3) * seed * 0.5);
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < EMBED_DIM; i++) v[i] = (v[i] ?? 0) / n;
  return v;
}

describe("associative depth (feature #1)", () => {
  it("1a: proposes connecting two distant stars, and answering forges the link", async () => {
    const nodes = new NodesRepo(handle, "legacy");
    // Six memories on widely-separated topic vectors (no edges between any of them),
    // each meaningful (importance high) so the distant-link heuristic considers them.
    const made = [] as { id: number }[];
    for (let i = 0; i < 6; i++) {
      made.push(
        nodes.create(
          { label: `topic ${i}`, type: "daily", content: `an isolated thought number ${i}`, importance: 0.6 } as never,
          vec(10 + i * 7),
        ),
      );
    }

    // Drain the lighter noticings until the distant-link prompt surfaces.
    let q = listInquiries(ctx, "legacy").find((x) => x.kind === "distant_link");
    for (let i = 0; i < 8 && !q; i++) {
      const id = generateInquiry(ctx, "legacy");
      if (id === null) break;
      const open = listInquiries(ctx, "legacy");
      q = open.find((x) => x.kind === "distant_link");
      if (!q) for (const o of open) handle.sqlite.prepare(`UPDATE inquiries SET status='dismissed' WHERE id=?`).run(o.id);
    }
    expect(q).toBeTruthy();
    expect(q!.nodes.length).toBe(2);

    // Answering it ties the reply to both distant stars (the generation effect).
    const res = await answerInquiry(ctx, "legacy", q!.id, "Both are really about learning to slow down.");
    expect(res).not.toBeNull();
    const edges = new EdgesRepo(handle, "legacy");
    const newId = res!.nodeIds[0]!;
    for (const n of q!.nodes) expect(edges.exists(newId, n.id) || edges.exists(n.id, newId)).toBe(true);
  });

  it("1a: never proposes a distant link between two ALREADY-connected stars", () => {
    const nodes = new NodesRepo(handle, "legacy");
    const edges = new EdgesRepo(handle, "legacy");
    const made = Array.from({ length: 6 }, (_, i) =>
      nodes.create({ label: `t${i}`, type: "daily", content: `note ${i}`, importance: 0.6 } as never, vec(20 + i * 9)),
    );
    // Wire every pair together so no un-linked distant pair remains.
    for (let i = 0; i < made.length; i++)
      for (let j = i + 1; j < made.length; j++)
        edges.create({ source: made[i]!.id, target: made[j]!.id, relationship: "relates_to", weight: 0.5 });

    for (let i = 0; i < 6; i++) generateInquiry(ctx, "legacy");
    expect(listInquiries(ctx, "legacy").some((x) => x.kind === "distant_link")).toBe(false);
  });

  it("1c: seeds a welcome star on an empty brain, and never on a brain that has memories", async () => {
    expect(await seedWelcomeStar(ctx, "legacy", "Nova")).toBe(true);
    const first = new NodesRepo(handle, "legacy").all();
    expect(first.length).toBe(1);
    expect(first[0]!.content).toContain("Nova");
    // Idempotent: a second call is a no-op because the brain now has a star.
    expect(await seedWelcomeStar(ctx, "legacy", "Nova")).toBe(false);
    expect(new NodesRepo(handle, "legacy").all().length).toBe(1);
  });
});
