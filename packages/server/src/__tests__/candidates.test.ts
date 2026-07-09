import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import {
  recordCandidate,
  listCandidates,
  countCandidates,
  acceptCandidate,
  dismissCandidate,
  manualLink,
  pruneWeakLinks,
} from "../analysis/candidates.js";
import { createCognitive } from "../analysis/cognitive.js";
import { isRejected } from "../analysis/rejections.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

async function mem(label: string) {
  return new NodesRepo(handle, "legacy").create({ label, type: "daily", content: label } as never, await embeddings.embed(label));
}

describe("candidate connections (the review queue)", () => {
  it("records a pending candidate and lists it with both labels", async () => {
    const a = await mem("apple");
    const b = await mem("banana");
    recordCandidate(handle, "legacy", a.id, b.id, "possible link", 0.7);
    const list = listCandidates(handle, "legacy");
    expect(list.length).toBe(1);
    expect(countCandidates(handle, "legacy")).toBe(1);
    expect([list[0]!.aLabel, list[0]!.bLabel].sort()).toEqual(["apple", "banana"]);
  });

  it("is idempotent per pair and canonical (a<b regardless of order)", async () => {
    const a = await mem("x");
    const b = await mem("y");
    recordCandidate(handle, "legacy", a.id, b.id, "r", 0.5);
    recordCandidate(handle, "legacy", b.id, a.id, "r", 0.9); // same pair, reversed
    expect(countCandidates(handle, "legacy")).toBe(1);
  });

  it("skips pairs that are already linked", async () => {
    const a = await mem("m1");
    const b = await mem("m2");
    new EdgesRepo(handle, "legacy").create({ source: a.id, target: b.id, relationship: "relates_to", weight: 0.6 });
    recordCandidate(handle, "legacy", a.id, b.id, "r", 0.8);
    expect(countCandidates(handle, "legacy")).toBe(0);
  });

  it("accept creates the real edge and clears it from the queue", async () => {
    const a = await mem("m1");
    const b = await mem("m2");
    recordCandidate(handle, "legacy", a.id, b.id, "r", 0.8);
    const id = listCandidates(handle, "legacy")[0]!.id;
    const pair = acceptCandidate(handle, "legacy", id);
    expect(pair).not.toBeNull();
    const edges = new EdgesRepo(handle, "legacy");
    expect(edges.exists(a.id, b.id) || edges.exists(b.id, a.id)).toBe(true);
    expect(countCandidates(handle, "legacy")).toBe(0);
  });

  it("dismiss records a rejection so the pair never returns", async () => {
    const a = await mem("m1");
    const b = await mem("m2");
    recordCandidate(handle, "legacy", a.id, b.id, "r", 0.8);
    const id = listCandidates(handle, "legacy")[0]!.id;
    expect(dismissCandidate(handle, "legacy", id)).toBe(true);
    expect(countCandidates(handle, "legacy")).toBe(0);
    expect(isRejected(ctx, "legacy", a.id, b.id)).toBe(true);
    // A rejected pair can't be re-suggested.
    recordCandidate(handle, "legacy", a.id, b.id, "r", 0.9);
    expect(countCandidates(handle, "legacy")).toBe(0);
  });

  it("manualLink connects two memories directly (deduped)", async () => {
    const a = await mem("m1");
    const b = await mem("m2");
    expect(manualLink(handle, "legacy", a.id, b.id)).not.toBeNull();
    expect(manualLink(handle, "legacy", a.id, a.id)).toBeNull(); // self-link refused
    const edges = new EdgesRepo(handle, "legacy");
    expect(edges.all().filter((e) => (e.source === a.id && e.target === b.id) || (e.source === b.id && e.target === a.id)).length).toBe(1);
  });

  it("declutter never destroys a link the user MADE (weight above the prune floor)", async () => {
    const a = await mem("m1");
    const b = await mem("m2");
    manualLink(handle, "legacy", a.id, b.id); // weight 0.85 > 0.75 floor
    const { pruned } = pruneWeakLinks(handle, "legacy", { maxWeight: 0.75 });
    expect(pruned).toBe(0);
    const edges = new EdgesRepo(handle, "legacy");
    expect(edges.exists(a.id, b.id) || edges.exists(b.id, a.id)).toBe(true);
  });

  it("declutter's weak-link prune ignores anchor links (memory↔goal), only memory↔memory", async () => {
    const m = await mem("m1");
    const goal = await createCognitive(ctx, "legacy", "goal", "Ship the app", "");
    const edges = new EdgesRepo(handle, "legacy");
    edges.create({ source: m.id, target: goal, relationship: "relates_to", weight: 0.3 });
    const { pruned } = pruneWeakLinks(handle, "legacy", { maxWeight: 0.75 });
    expect(pruned).toBe(0); // the weak edge touches an anchor → left alone
    expect(edges.exists(m.id, goal)).toBe(true);
  });

  it("pruneWeakLinks moves weak relates_to edges into the queue, keeping structural ones", async () => {
    const a = await mem("m1");
    const b = await mem("m2");
    const c = await mem("m3");
    const edges = new EdgesRepo(handle, "legacy");
    edges.create({ source: a.id, target: b.id, relationship: "relates_to", weight: 0.3 }); // weak → prune
    edges.create({ source: a.id, target: c.id, relationship: "supports", weight: 0.3 }); // structural → keep
    const { pruned } = pruneWeakLinks(handle, "legacy", { maxWeight: 0.55 });
    expect(pruned).toBe(1);
    expect(edges.exists(a.id, b.id)).toBe(false); // removed from the graph
    expect(edges.exists(a.id, c.id)).toBe(true); // structural untouched
    expect(countCandidates(handle, "legacy")).toBe(1); // and waiting to be restored
    expect(listCandidates(handle, "legacy")[0]!.origin).toBe("pruned");
  });
});
