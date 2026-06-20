import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ExtractionResult } from "@brain/shared";
import type { ContextNode, LinkValidation, LlmProvider } from "../llm/adapter.js";
import { ResilientLlmProvider } from "../llm/resilient.js";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { ingest } from "../ingestion/pipeline.js";
import { GraphService } from "../graph/service.js";

/** A cloud provider that's run out of credit — every call throws a quota error. */
class BrokeProvider implements LlmProvider {
  readonly available = true;
  readonly model = "cloud-fake";
  async extract(): Promise<ExtractionResult> {
    throw new Error("429 insufficient_quota: you exceeded your current quota");
  }
  async validateLink(): Promise<LinkValidation> {
    throw new Error("429 insufficient_quota");
  }
  async synthesize(): Promise<{ text: string; score: number }> {
    throw new Error("429 insufficient_quota");
  }
  async answer(): Promise<{ answer: string; citations: number[] }> {
    throw new Error("429 insufficient_quota");
  }
  async research(): Promise<{ label: string; content: string }> {
    throw new Error("429 insufficient_quota");
  }
  async summarizeSector(): Promise<string> {
    throw new Error("429 insufficient_quota");
  }
  async generateDailyLog(): Promise<string> {
    throw new Error("429 insufficient_quota");
  }
}

describe("resilient LLM provider", () => {
  it("falls back to the heuristic and trips degraded mode on a credit error", async () => {
    const p = new ResilientLlmProvider(new BrokeProvider());
    const ctx: ContextNode[] = [];

    const result = await p.extract("a serious reflection on death and family", ctx);
    expect(result.nodes.length).toBe(1); // heuristic still produced a node
    expect(result.nodes[0]!.importance).toBeGreaterThan(0); // with a weight

    expect(p.degraded).toBe(true); // quota error tripped the cooldown
    expect(p.available).toBe(false); // so we're now in offline mode

    // Subsequent calls short-circuit straight to the heuristic.
    const ans = await p.answer("anything?", ctx);
    expect(typeof ans.answer).toBe("string");
  });
});

describe("manual weight override", () => {
  let handle: DbHandle;
  const embeddings = new HashEmbeddingProvider(EMBED_DIM);
  const llm = new HeuristicProvider();

  beforeEach(() => {
    handle = createDb(":memory:");
  });
  afterEach(() => {
    handle.sqlite.close();
  });

  it("sets importance manually and resets to the auto rating", async () => {
    const { nodes } = await ingest(handle, { embeddings, llm }, "a quick note about socks");
    const id = nodes[0]!.id;
    const graph = new GraphService(handle);

    const heavy = graph.setImportance(id, 0.95)!;
    expect(heavy.importance).toBeCloseTo(0.95);
    expect(heavy.mass!).toBeGreaterThan(0.45);

    // null -> recompute offline from content (a trivial note stays light).
    const reset = graph.setImportance(id, null)!;
    expect(reset.importance).toBeLessThan(0.6);
    expect(reset.celestial).toBe("moon");
  });
});
