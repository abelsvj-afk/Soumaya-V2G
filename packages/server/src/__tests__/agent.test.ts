import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { AppContext } from "../context.js";
import { GraphService } from "../graph/service.js";
import { UsageTracker } from "../usage.js";
import { ingest } from "../ingestion/pipeline.js";
import { EconomyRepo } from "../economy.js";
import { selectJob, executeJob, researchEnabled } from "../maintenance/agent.js";
import { settings } from "../db/schema.js";

let handle: DbHandle;
let ctx: AppContext;

beforeEach(() => {
  handle = createDb(":memory:");
  ctx = {
    handle,
    embeddings: new HashEmbeddingProvider(EMBED_DIM),
    llm: new HeuristicProvider(),
    graph: new GraphService(handle),
    usage: new UsageTracker(handle),
  };
});
afterEach(() => handle.sqlite.close());

const setResearch = (on: boolean) =>
  handle.db.insert(settings).values({ key: "research_enabled", value: String(on) }).run();

describe("maintenance agent (server-side autonomy core)", () => {
  it("with Research Mode OFF, only ever selects FREE jobs (never LLM-backed)", async () => {
    await ingest(handle, { embeddings: ctx.embeddings, llm: ctx.llm }, "a thought about the ocean");
    await ingest(handle, { embeddings: ctx.embeddings, llm: ctx.llm }, "a thought about the deep sea");
    setResearch(false);
    const llmTypes = new Set(["synthesis", "merging", "research", "sector_vibe", "daily_log"]);
    for (let i = 0; i < 8; i++) {
      const job = selectJob(ctx, "legacy");
      expect(job).not.toBeNull();
      expect(llmTypes.has(job!.type)).toBe(false);
    }
  });

  it("researchEnabled reflects the global setting", () => {
    expect(researchEnabled(ctx)).toBe(false);
    setResearch(true);
    expect(researchEnabled(ctx)).toBe(true);
  });

  it("executeJob: synthesis is free, research burns fuel (same gating as the route)", async () => {
    const a = (await ingest(handle, { embeddings: ctx.embeddings, llm: ctx.llm }, "fuel alpha memory")).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings: ctx.embeddings, llm: ctx.llm }, "fuel beta memory")).nodes[0]!.id;
    const econ = new EconomyRepo(handle, "legacy");

    const f0 = econ.get();
    const synDetail = await executeJob(ctx, "legacy", { type: "synthesis", targets: [a, b], description: "" });
    expect(synDetail).toBeTruthy();
    expect(econ.get()).toBe(f0); // core duty — no fuel spent

    const resDetail = await executeJob(ctx, "legacy", { type: "research", targets: [a], description: "" });
    expect(resDetail).toBeTruthy();
    expect(econ.get()).toBeLessThan(f0); // expansion — fuel spent
  });

  it("executeJob returns null (no-op) for a missing target instead of throwing", async () => {
    const detail = await executeJob(ctx, "legacy", { type: "synthesis", targets: [9991, 9992], description: "" });
    expect(detail).toBeNull();
  });

  it("selectJob returns null for an empty brain", () => {
    expect(selectJob(ctx, "legacy")).toBeNull();
  });

  it("claims a job so concurrent pollers don't double-run it (idempotency)", async () => {
    const a = (await ingest(handle, { embeddings: ctx.embeddings, llm: ctx.llm }, "claim alpha", "claimspace")).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings: ctx.embeddings, llm: ctx.llm }, "claim beta", "claimspace")).nodes[0]!.id;
    // A weak edge makes "pruning" the deterministic free job (no Research Mode needed).
    handle.sqlite
      .prepare(`INSERT INTO edges (space_id, source, target, relationship, weight) VALUES ('claimspace', ?, ?, 'relates_to', 0.1)`)
      .run(a, b);
    const first = selectJob(ctx, "claimspace");
    expect(first!.type).toBe("pruning");
    // A second poll within the claim window gets a harmless patrol, not the same job.
    const second = selectJob(ctx, "claimspace");
    expect(second!.type).toBe("patrol");
  });

  it("attaches an explainable rationale to every job and persists it to the log", async () => {
    const a = (await ingest(handle, { embeddings: ctx.embeddings, llm: ctx.llm }, "rationale alpha")).nodes[0]!.id;

    const job = selectJob(ctx, "legacy"); // research OFF → a free job, still explained
    expect(job).not.toBeNull();
    expect(job!.rationale?.objective).toBeTruthy();
    expect(job!.rationale?.why).toBeTruthy();
    expect(job!.rationale?.benefit).toBeTruthy();

    await executeJob(ctx, "legacy", { type: "patrol", targets: [a] });
    const log = handle.sqlite
      .prepare(`SELECT result FROM agent_logs WHERE space_id = ? ORDER BY id DESC LIMIT 1`)
      .get("legacy") as { result: string | null };
    expect(log?.result).toBeTruthy();
    const parsed = JSON.parse(log!.result!);
    expect(parsed.objective).toBeTruthy();
    expect(parsed.benefit).toBeTruthy();
  });
});
