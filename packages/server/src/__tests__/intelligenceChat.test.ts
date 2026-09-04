import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { ingest } from "../ingestion/pipeline.js";
import { InsightsRepo } from "../repositories/insights.repo.js";
import { chat, DEFAULT_CHAT } from "../chat/graphrag.js";
import type { AnswerOptions, ContextNode } from "../llm/adapter.js";

/** Maya Intelligence chat integration (docs/specs/maya-intelligence-architecture.md) — same
 *  "is it injected into chat's systemExtra" pattern already proven for the other four
 *  snapshots in people.test.ts / temporalChat.test.ts. */

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
beforeEach(() => { handle = createDb(":memory:"); });
afterEach(() => handle.sqlite.close());

class CapturingLlm extends HeuristicProvider {
  lastOpts: AnswerOptions | undefined;
  async answer(question: string, context: ContextNode[], opts?: AnswerOptions) {
    this.lastOpts = opts;
    return super.answer(question, context, opts);
  }
}

describe("intelligence notes are injected into chat's systemExtra, same as the other four snapshots", () => {
  it("includes the INTELLIGENCE NOTES block when an open contradiction exists", async () => {
    const llm = new CapturingLlm();
    const a = (await ingest(handle, { embeddings, llm }, "I have one vehicle.", "legacy")).nodes[0]!.id;
    const b = (await ingest(handle, { embeddings, llm }, "Vehicle accident happened yesterday.", "legacy")).nodes[0]!.id;
    new InsightsRepo(handle, "legacy").create(a, b, "The accident may affect vehicle availability.", 0.8, "contradiction");

    await chat(handle, { embeddings, llm }, "how am I doing", DEFAULT_CHAT, "legacy");
    expect(llm.lastOpts?.systemExtra ?? "").toContain("INTELLIGENCE NOTES");
    expect(llm.lastOpts?.systemExtra ?? "").toContain("NOT settled facts");
  });

  it("stays silent (adds nothing) for a space with no contradictions or persisting themes", async () => {
    const llm = new CapturingLlm();
    await chat(handle, { embeddings, llm }, "hello", DEFAULT_CHAT, "legacy");
    expect(llm.lastOpts?.systemExtra ?? "").not.toContain("INTELLIGENCE NOTES");
  });
});
