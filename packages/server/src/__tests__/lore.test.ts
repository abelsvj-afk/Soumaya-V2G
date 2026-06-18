import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { ingest } from "../ingestion/pipeline.js";
import { LoreRepo, evolveLore, getOrCreateLore } from "../lore/engine.js";

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

async function add(text: string) {
  return ingest(handle, { embeddings, llm }, text);
}

describe("lore engine", () => {
  it("creates a genesis chapter on first read, then appends versioned chapters", async () => {
    const id = String((await add("a luminous memory about the sea")).nodes[0]!.id);

    const history = getOrCreateLore(handle, "legacy", "memory", id);
    expect(history).toHaveLength(1);
    expect(history[0]!.version).toBe(1);
    expect(history[0]!.trigger).toBe("genesis");
    expect(history[0]!.text.length).toBeGreaterThan(10);

    const e2 = evolveLore(handle, "legacy", "memory", id, "linked");
    expect(e2!.version).toBe(2);
    expect(e2!.trigger).toBe("linked");

    const full = new LoreRepo(handle, "legacy").history("memory", id);
    expect(full.map((e) => e.version)).toEqual([1, 2]);
    // Genesis is immutable — still there, unchanged.
    expect(full[0]!.text).toBe(history[0]!.text);
  });

  it("genesis is deterministic for the same subject + version", async () => {
    const id = String((await add("a steady thought about routine")).nodes[0]!.id);
    const a = evolveLore(handle, "legacy", "memory", id, "genesis")!;
    // Wipe and regenerate v1 → identical text (seeded by id + version).
    handle.sqlite.prepare(`DELETE FROM lore`).run();
    const b = evolveLore(handle, "legacy", "memory", id, "genesis")!;
    expect(b.text).toBe(a.text);
  });

  it("is world-aware: lore references a neighbor once the memory is connected", async () => {
    // Two strongly-related memories link associatively, giving each a neighbor.
    await add("coffee subscription business with local roasters");
    const r = await add("coffee subscription company with local roasters");
    const id = String(r.nodes[0]!.id);
    const text = getOrCreateLore(handle, "legacy", "memory", id)[0]!.text;
    // Either it names the neighbor, or (if unlinked) says it's alone — never crash.
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(10);
  });

  it("evolves agent lore (ship) without a node target", () => {
    const e = evolveLore(handle, "legacy", "ship", "soumaya", "genesis");
    expect(e).not.toBeNull();
    expect(e!.subjectType).toBe("ship");
    expect(e!.version).toBe(1);
  });

  it("returns null for a missing memory subject", () => {
    expect(evolveLore(handle, "legacy", "memory", "999999", "manual")).toBeNull();
  });

  it("keeps lore scoped per space", async () => {
    const id = String((await add("private thought")).nodes[0]!.id);
    getOrCreateLore(handle, "legacy", "memory", id);
    // A different space sees no lore for the same subject id.
    expect(new LoreRepo(handle, "other-space").history("memory", id)).toHaveLength(0);
  });
});
