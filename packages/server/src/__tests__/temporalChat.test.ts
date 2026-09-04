import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { chat, DEFAULT_CHAT } from "../chat/graphrag.js";
import type { AnswerOptions, ContextNode } from "../llm/adapter.js";

/** Temporal/Contextual Reasoning chat integration (docs/specs/temporal-contextual-reasoning.md)
 *  — same "is it injected into chat's systemExtra" pattern already proven for Finance/People/
 *  Cognitive in people.test.ts, applied to the new fourth snapshot. */

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

describe("temporal context is injected into chat's systemExtra, same as finance/people/cognitive", () => {
  it("includes the TEMPORAL CONTEXT block when there's something notable", async () => {
    const staleDate = new Date(Date.now() - 25 * 86_400_000).toISOString().slice(0, 10);
    new FinIncomeRepo(handle, "legacy").create({ date: staleDate, netCents: 50_000 });

    const llm = new CapturingLlm();
    await chat(handle, { embeddings, llm }, "how am I doing", DEFAULT_CHAT, "legacy");
    expect(llm.lastOpts?.systemExtra ?? "").toContain("TEMPORAL CONTEXT");
    expect(llm.lastOpts?.systemExtra ?? "").toMatch(/Stale/);
  });

  it("stays silent about temporal context (adds nothing) for a brand-new, empty space", async () => {
    const llm = new CapturingLlm();
    await chat(handle, { embeddings, llm }, "hello", DEFAULT_CHAT, "legacy");
    expect(llm.lastOpts?.systemExtra ?? "").not.toContain("TEMPORAL CONTEXT");
  });
});
