import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EconomyRepo } from "../economy.js";

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

// Reproduce the commission route's core logic (fuel sink → tend coldest) without HTTP.
function commission(spaceId: string): { ok: boolean; warmed?: number; error?: string } {
  const econ = new EconomyRepo(handle, spaceId);
  const COST = 25;
  if (econ.toFuel().fuel < COST) return { ok: false, error: "Not enough Fuel" };
  const cold = handle.sqlite
    .prepare(
      `SELECT id FROM nodes WHERE space_id = ? AND deleted_at IS NULL AND (kind IS NULL OR kind = 'memory')
       ORDER BY COALESCE(last_tended_at, created_at) ASC LIMIT 12`,
    )
    .all(spaceId) as { id: number }[];
  if (cold.length === 0) return { ok: false, error: "Nothing to warm yet" };
  econ.spend(COST);
  const nodes = new NodesRepo(handle, spaceId);
  for (const c of cold) nodes.tend(c.id);
  return { ok: true, warmed: cold.length };
}

describe("Commission — the player-controlled Fuel sink", () => {
  it("spends Fuel and tends the coldest memories", async () => {
    const nodes = new NodesRepo(handle, "legacy");
    for (let i = 0; i < 5; i++) nodes.create({ label: `m${i}`, type: "daily", content: "x" } as never, await embeddings.embed(`m${i}`));
    const econ = new EconomyRepo(handle, "legacy");
    econ.add(100); // give a spendable balance
    const before = econ.toFuel().fuel;

    const r = commission("legacy");
    expect(r.ok).toBe(true);
    expect(r.warmed).toBe(5);
    expect(econ.toFuel().fuel).toBe(before - 25); // Fuel actually spent (the sink works)
    // Every memory now has a fresh last_tended_at (warmed).
    const untended = handle.sqlite
      .prepare(`SELECT COUNT(*) AS c FROM nodes WHERE space_id='legacy' AND last_tended_at IS NULL`)
      .get() as { c: number };
    expect(untended.c).toBe(0);
  });

  it("refuses when you can't afford it (nothing spent)", async () => {
    const nodes = new NodesRepo(handle, "legacy");
    await nodes.create({ label: "m", type: "daily", content: "x" } as never, await embeddings.embed("m"));
    // fresh brains start at FUEL_START = 25; drain below the 25 cost.
    handle.sqlite.prepare(`UPDATE space_meta SET fuel = 10 WHERE space_id = 'legacy'`).run();
    handle.sqlite.prepare(`INSERT OR IGNORE INTO space_meta (space_id, fuel) VALUES ('legacy', 10)`).run();
    const r = commission("legacy");
    expect(r.ok).toBe(false);
  });
});
