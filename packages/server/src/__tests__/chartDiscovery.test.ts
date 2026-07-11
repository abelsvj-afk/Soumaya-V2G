import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { CodexDiscoveriesRepo } from "../repositories/codexDiscoveries.repo.js";
import { runToolRouter } from "../agent/tools/router.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

async function mem(label: string, over: Record<string, unknown> = {}) {
  return new NodesRepo(handle, "legacy").create(
    { label, type: "daily", content: label, importance: 0.5, ...over } as never,
    await embeddings.embed(label),
  );
}

describe("chart_discovery tool (Soumaya charts the Codex)", () => {
  it("charts a landmark sector once it crosses 25 memories, and never twice", async () => {
    const now = Date.UTC(2026, 4, 1, 12, 0, 0);
    for (let i = 0; i < 26; i++) await mem(`note ${i}`);
    const sent: string[] = [];
    const r = await runToolRouter(ctx, "legacy", { now, notify: async (_s, t) => void sent.push(t) });
    expect(r.some((x) => x.ok && x.summary.includes("Sector Comes of Age"))).toBe(true);
    expect(sent.some((t) => t.includes("Codex entry"))).toBe(true);

    const disc = new CodexDiscoveriesRepo(handle, "legacy").list();
    expect(disc.some((d) => d.key.startsWith("sector:daily:25"))).toBe(true);

    // Same day → rate-limited (nothing new); next day → the sector note is already charted.
    expect((await runToolRouter(ctx, "legacy", { now: now + 3600_000 })).some((x) => x.summary.includes("Sector"))).toBe(false);
    const before = new CodexDiscoveriesRepo(handle, "legacy").list().length;
    await runToolRouter(ctx, "legacy", { now: now + 86_400_000 * 2 });
    expect(new CodexDiscoveriesRepo(handle, "legacy").list().filter((d) => d.key === disc[0]!.key).length).toBe(1);
    expect(new CodexDiscoveriesRepo(handle, "legacy").list().length).toBeGreaterThanOrEqual(before);
  });

  it("charts a dense constellation as a landmark", async () => {
    const now = Date.UTC(2026, 4, 10, 9, 0, 0);
    const nodes = new NodesRepo(handle, "legacy");
    const edges = new EdgesRepo(handle, "legacy");
    const hub = nodes.create({ label: "Deep Work", type: "moc", kind: "moc", content: "x", importance: 0.7 } as never, await embeddings.embed("hub"));
    for (let i = 0; i < 9; i++) {
      const m = await mem(`m${i}`);
      edges.create({ source: hub.id, target: m.id, relationship: "summarizes", weight: 0.9 });
    }
    await runToolRouter(ctx, "legacy", { now });
    const disc = new CodexDiscoveriesRepo(handle, "legacy").list();
    expect(disc.some((d) => d.key === `hub:${hub.id}` && d.title.includes("Deep Work"))).toBe(true);
  });
});
