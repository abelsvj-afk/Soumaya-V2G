import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { UsageTracker } from "../usage.js";
import type { ToolContext } from "../agent/tools/types.js";
import { financeFreshnessTool } from "../agent/tools/financeFreshness.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { FinAssetRepo } from "../repositories/finAsset.repo.js";
import { FinAssetSnapshotRepo } from "../repositories/finAssetSnapshot.repo.js";

/** docs/specs/income-net-worth-trend.md Decision #4 — the weekly manual-data-freshness nudge. */

let handle: DbHandle;
let ctx: AppContext;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const NOW = Date.parse("2026-03-15T00:00:00Z");

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = { handle, embeddings, llm: new HeuristicProvider(), usage: new UsageTracker(handle) } as AppContext;
});
afterEach(() => handle.sqlite.close());

const tc = (now = NOW): ToolContext => ({ ctx, spaceId: "s1", now, notify: async () => {} });

describe("finance_freshness detect()", () => {
  it("stays quiet with no income and no assets ever recorded (not applicable, not stale)", () => {
    expect(financeFreshnessTool.detect(tc())).toHaveLength(0);
  });

  it("stays quiet when income was logged recently and there are no assets", () => {
    new FinIncomeRepo(handle, "s1").create({ date: "2026-03-10", netCents: 1000 }); // 5 days ago
    expect(financeFreshnessTool.detect(tc())).toHaveLength(0);
  });

  it("nudges when income hasn't been logged in over 20 days", () => {
    new FinIncomeRepo(handle, "s1").create({ date: "2026-02-01", netCents: 1000 }); // 42 days ago
    const inv = financeFreshnessTool.detect(tc());
    expect(inv).toHaveLength(1);
    expect(inv[0]!.args.incomeStale).toBe(true);
    expect(inv[0]!.args.assetStale).toBe(false);
  });

  it("nudges when an asset exists but has never had a snapshot logged", () => {
    new FinAssetRepo(handle, "s1").create({ kind: "savings", label: "New account" });
    const inv = financeFreshnessTool.detect(tc());
    expect(inv).toHaveLength(1);
    expect(inv[0]!.args.assetStale).toBe(true);
  });

  it("nudges when an asset's snapshot is over 30 days old", () => {
    const asset = new FinAssetRepo(handle, "s1").create({ kind: "savings", label: "Emergency fund" });
    new FinAssetSnapshotRepo(handle, "s1").create({ assetId: asset.id, amountCents: 100_000, asOf: "2026-01-01" }); // 73 days ago
    const inv = financeFreshnessTool.detect(tc());
    expect(inv[0]!.args.assetStale).toBe(true);
  });

  it("stays quiet when an asset's snapshot is recent", () => {
    const asset = new FinAssetRepo(handle, "s1").create({ kind: "savings", label: "Emergency fund" });
    new FinAssetSnapshotRepo(handle, "s1").create({ assetId: asset.id, amountCents: 100_000, asOf: "2026-03-05" }); // 10 days ago
    expect(financeFreshnessTool.detect(tc())).toHaveLength(0);
  });

  it("fires exactly ONE combined invocation when both income and assets are stale", () => {
    new FinIncomeRepo(handle, "s1").create({ date: "2026-01-01", netCents: 1000 });
    const asset = new FinAssetRepo(handle, "s1").create({ kind: "savings", label: "A" });
    new FinAssetSnapshotRepo(handle, "s1").create({ assetId: asset.id, amountCents: 100, asOf: "2026-01-01" });
    const inv = financeFreshnessTool.detect(tc());
    expect(inv).toHaveLength(1);
    expect(inv[0]!.args.incomeStale).toBe(true);
    expect(inv[0]!.args.assetStale).toBe(true);
  });

  it("fires at most once per 7 days (respects the agent_logs guard)", () => {
    new FinIncomeRepo(handle, "s1").create({ date: "2026-01-01", netCents: 1000 });
    expect(financeFreshnessTool.detect(tc())).toHaveLength(1);
    handle.sqlite
      .prepare(`INSERT INTO agent_logs (space_id, action, description, targets, created_at) VALUES ('s1', 'tool:finance_freshness', 'x', '[]', '2026-03-14 00:00:00')`)
      .run();
    expect(financeFreshnessTool.detect(tc())).toHaveLength(0);
  });

  it("run() delivers a message and mirrors it into the returned `message` field", async () => {
    let sent = "";
    const res = await financeFreshnessTool.run(
      { ctx, spaceId: "s1", now: NOW, notify: async (t) => void (sent = t) },
      { incomeStale: true, assetStale: false, incomeDays: 25, assetDays: 0 },
    );
    expect(res.ok).toBe(true);
    expect(sent).toMatch(/25 days/);
    expect(res.message).toBe(sent);
  });
});
