import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { stepUndertaking, activeUndertaking } from "../analysis/undertakings.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

async function seedCold(n: number) {
  const repo = new NodesRepo(handle, "legacy");
  for (let i = 0; i < n; i++) {
    const m = repo.create({ label: `note ${i}`, type: "daily", content: `content ${i}` } as never, await embeddings.embed(`note ${i}`));
    handle.sqlite.prepare(`UPDATE nodes SET last_tended_at = datetime('now','-30 days') WHERE id = ?`).run(m.id);
  }
}

describe("undertakings (multi-day autonomy arcs)", () => {
  it("starts an arc when there's enough to work, and it's a 5-day arc", async () => {
    await seedCold(8);
    const event = stepUndertaking(ctx, "legacy");
    expect(event).toMatch(/Began a new undertaking/);
    const arc = activeUndertaking(ctx, "legacy");
    expect(arc?.status).toBe("active");
    expect(arc?.total).toBe(5);
    expect(arc?.done).toBe(1); // day 1 on start
  });

  it("does not advance twice in the same day (idempotent ticks)", async () => {
    await seedCold(8);
    stepUndertaking(ctx, "legacy"); // start → done 1
    const e2 = stepUndertaking(ctx, "legacy"); // same day → no progress
    expect(e2).toBeNull();
    expect(activeUndertaking(ctx, "legacy")?.done).toBe(1);
  });

  it("advances by ELAPSED days and completes at the finale", async () => {
    await seedCold(8);
    stepUndertaking(ctx, "legacy");
    // Backdate the start 5 days → the arc should complete on the next step.
    handle.sqlite.prepare(`UPDATE undertakings SET started_at = datetime('now','-5 days') WHERE space_id = 'legacy'`).run();
    const event = stepUndertaking(ctx, "legacy");
    expect(event).toMatch(/Completed her undertaking/);
    expect(activeUndertaking(ctx, "legacy")).toBeNull(); // no longer active
  });

  it("returns null when the brain is too sparse for an arc", () => {
    expect(stepUndertaking(ctx, "legacy")).toBeNull();
  });
});
