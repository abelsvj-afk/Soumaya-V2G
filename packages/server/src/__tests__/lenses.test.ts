import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { LensesRepo } from "../repositories/lenses.repo.js";
import { evalLens } from "../analysis/lenses.js";
import { generateInquiry, listInquiries, confirmLensSuggestion, dismissInquiry } from "../analysis/inquiry.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

async function mem(space: string, label: string, over: Record<string, unknown> = {}) {
  return new NodesRepo(handle, space).create(
    { label, type: "daily", content: label, importance: 0.5, ...over } as never,
    await embeddings.embed(label),
  );
}

describe("Smart Lenses evaluator", () => {
  it("empty query returns all active (non-archived) bodies, importance-first", async () => {
    const a = await mem("legacy", "one", { importance: 0.9 });
    const b = await mem("legacy", "two", { importance: 0.2 });
    const ids = evalLens(ctx, "legacy", {});
    expect(ids).toEqual([a.id, b.id]); // 0.9 before 0.2
  });

  it("filters by minImportance and by emotion band", async () => {
    await mem("legacy", "low", { importance: 0.1, emotionalWeight: 0 });
    const heavy = await mem("legacy", "heavy", { importance: 0.8, emotionalWeight: -0.6 });
    const happy = await mem("legacy", "happy", { importance: 0.8, emotionalWeight: 0.6 });

    expect(evalLens(ctx, "legacy", { minImportance: 0.5 }).sort()).toEqual([heavy.id, happy.id].sort());
    expect(evalLens(ctx, "legacy", { emotion: "heavy" })).toEqual([heavy.id]);
    expect(evalLens(ctx, "legacy", { emotion: "positive" })).toEqual([happy.id]);
  });

  it("state:archived returns only archived; default excludes them", async () => {
    const live = await mem("legacy", "live");
    const rested = await mem("legacy", "rested");
    new NodesRepo(handle, "legacy").setStatus(rested.id, "archived");
    expect(evalLens(ctx, "legacy", {})).toEqual([live.id]);
    expect(evalLens(ctx, "legacy", { state: "archived" })).toEqual([rested.id]);
  });

  it("state:orphan returns only unlinked memories", async () => {
    const linkedA = await mem("legacy", "linkedA");
    const linkedB = await mem("legacy", "linkedB");
    const lonely = await mem("legacy", "lonely");
    new EdgesRepo(handle, "legacy").create({ source: linkedA.id, target: linkedB.id, relationship: "relates_to", weight: 0.5 });
    expect(evalLens(ctx, "legacy", { state: "orphan" })).toEqual([lonely.id]);
  });

  it("linkedTo returns only memories connected to the anchor", async () => {
    const anchor = await mem("legacy", "anchor");
    const near = await mem("legacy", "near");
    await mem("legacy", "far");
    new EdgesRepo(handle, "legacy").create({ source: anchor.id, target: near.id, relationship: "relates_to", weight: 0.5 });
    expect(evalLens(ctx, "legacy", { linkedTo: anchor.id })).toEqual([near.id]);
  });

  it("is space-scoped — a lens never returns another brain's nodes", async () => {
    const mine = await mem("space-a", "mine");
    await mem("space-b", "theirs");
    expect(evalLens(ctx, "space-a", {})).toEqual([mine.id]);
  });
});

describe("LensesRepo CRUD", () => {
  it("creates, lists, updates, and deletes — scoped to the space", () => {
    const repo = new LensesRepo(handle, "legacy");
    const l = repo.create("Heavy work", { emotion: "heavy", kinds: ["project"] }, true);
    expect(repo.list().map((x) => x.id)).toContain(l.id);
    expect(repo.get(l.id)!.query.emotion).toBe("heavy");

    const up = repo.update(l.id, { name: "Renamed", pinned: false });
    expect(up!.name).toBe("Renamed");
    expect(up!.pinned).toBe(false);

    // Another brain can't see or delete it.
    expect(new LensesRepo(handle, "other").get(l.id)).toBeNull();
    expect(new LensesRepo(handle, "other").remove(l.id)).toBe(false);

    expect(repo.remove(l.id)).toBe(true);
    expect(repo.get(l.id)).toBeNull();
  });
});

describe("Soumaya proposes a lens (lens_suggestion)", () => {
  it("offers an orphan lens when loose threads pile up, and confirming creates it (pinned)", async () => {
    // 9 unconnected memories → an orphan backlog over the threshold.
    for (let i = 0; i < 9; i++) await mem("legacy", `orphan ${i}`);

    // Drain lighter noticings until the lens suggestion surfaces.
    let q = listInquiries(ctx, "legacy").find((x) => x.kind === "lens_suggestion");
    for (let i = 0; i < 8 && !q; i++) {
      const id = generateInquiry(ctx, "legacy");
      if (id === null) break;
      const open = listInquiries(ctx, "legacy");
      q = open.find((x) => x.kind === "lens_suggestion");
      if (!q) for (const o of open) dismissInquiry(ctx, "legacy", o.id);
    }
    expect(q).toBeTruthy();
    expect(q!.question).toMatch(/Loose threads/);

    const lens = confirmLensSuggestion(ctx, "legacy", q!.id);
    expect(lens).not.toBeNull();
    expect(lens!.pinned).toBe(true);
    expect(lens!.query.state).toBe("orphan");
    // It's persisted, and evaluating it returns the orphan memories.
    expect(new LensesRepo(handle, "legacy").list().some((l) => l.id === lens!.id)).toBe(true);
    expect(evalLens(ctx, "legacy", lens!.query).length).toBeGreaterThanOrEqual(9);
  });

  it("does not re-offer a lens whose view already exists", async () => {
    for (let i = 0; i < 9; i++) await mem("legacy", `loose ${i}`);
    new LensesRepo(handle, "legacy").create("Already have it", { state: "orphan" }, true);
    // Generate several times; no orphan lens suggestion should appear.
    for (let i = 0; i < 6; i++) generateInquiry(ctx, "legacy");
    const sug = listInquiries(ctx, "legacy").filter((x) => x.kind === "lens_suggestion");
    expect(sug.every((s) => !/Loose threads/.test(s.question))).toBe(true);
  });
});
