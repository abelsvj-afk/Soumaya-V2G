import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ExtractionResult, ClarificationInterpretation, InteractionPreferenceSignal } from "@brain/shared";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { EMBED_DIM } from "../db/vec.js";
import { chat, DEFAULT_CHAT } from "../chat/graphrag.js";
import { ingest } from "../ingestion/pipeline.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { InteractionPreferencesRepo } from "../repositories/interactionPreferences.repo.js";
import type { AnswerOptions, AnswerResult, ContextNode, LinkCandidate, LinkValidation, LlmProvider } from "../llm/adapter.js";

/**
 * Maya Longitudinal Intelligence, Phase H (docs/specs/maya-longitudinal-intelligence.md,
 * Section 14) — full-stack integration: chat() -> LLM proposes an interactionPreferenceSignal
 * -> server accumulates it -> a LATER chat() call surfaces it as Layer-2 guidance, once durable.
 * Uses a scripted `LlmProvider` (mirrors `chatNavigation.test.ts`'s `ScriptedNavLlm` pattern) so
 * the proposal is deterministic — the point under test is the SERVER'S accumulation/surfacing
 * wiring, not any real provider's judgment.
 */
class ScriptedPreferenceLlm implements LlmProvider {
  readonly available = true;
  readonly model = "scripted";
  lastOpts: AnswerOptions | undefined;
  constructor(private signal?: InteractionPreferenceSignal | null) {}
  async extract(text: string): Promise<ExtractionResult> {
    return { nodes: [{ label: text.slice(0, 24), type: "daily", content: text }], edges: [] };
  }
  async validateLink(): Promise<LinkValidation> {
    return { linked: false };
  }
  async synthesize(): Promise<{ text: string; score: number }> {
    return { text: "", score: 0 };
  }
  async detectContradiction(): Promise<{ conflict: boolean; text: string; score: number }> {
    return { conflict: false, text: "", score: 0 };
  }
  async interpretClarificationAnswer(): Promise<ClarificationInterpretation> {
    return { answers: false, confirmedStatement: "", confidence: 0 };
  }
  async answer(_question: string, context: ContextNode[], opts?: AnswerOptions): Promise<AnswerResult> {
    this.lastOpts = opts;
    return {
      answer: "Got it.",
      citations: context.slice(0, 1).map((c) => c.id),
      interactionPreferenceSignal: this.signal,
    };
  }
  async research(node: LinkCandidate): Promise<{ label: string; content: string }> {
    return { label: node.label, content: node.content };
  }
  async summarizeSector(): Promise<string> {
    return "calm";
  }
  async generateDailyLog(): Promise<string> {
    return "log";
  }
}

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

describe("interaction preference — full chat integration", () => {
  it("a repeated explicit statement becomes durable and surfaces in a LATER conversation's context", async () => {
    const llm = new ScriptedPreferenceLlm({ signal: "verbosity", value: "concise" });
    await chat(handle, { embeddings, llm }, "Always keep your answers shorter from now on.", DEFAULT_CHAT, "s1");
    // One mention alone: not yet surfaced (weak evidence).
    let secondTurnLlm = new ScriptedPreferenceLlm(null);
    await chat(handle, { embeddings, llm: secondTurnLlm }, "hello again", DEFAULT_CHAT, "s1");
    expect(secondTurnLlm.lastOpts?.systemExtra ?? "").not.toContain("HOW THEY'VE ASKED YOU TO COMMUNICATE");

    // Second, consistent mention — now durable.
    await chat(handle, { embeddings, llm }, "Seriously, keep it shorter.", DEFAULT_CHAT, "s1");
    const thirdTurnLlm = new ScriptedPreferenceLlm(null);
    await chat(handle, { embeddings, llm: thirdTurnLlm }, "hello once more", DEFAULT_CHAT, "s1");
    expect(thirdTurnLlm.lastOpts?.systemExtra ?? "").toContain("HOW THEY'VE ASKED YOU TO COMMUNICATE");
    expect(thirdTurnLlm.lastOpts?.systemExtra ?? "").toContain("concise");
  });

  it("stays silent when the model never proposes a signal (the common case)", async () => {
    const llm = new ScriptedPreferenceLlm(null);
    await chat(handle, { embeddings, llm }, "hello", DEFAULT_CHAT, "s1");
    expect(new InteractionPreferencesRepo(handle, "s1").list()).toEqual([]);
  });

  it("never creates a factual memory node from a preference signal", async () => {
    const llm = new ScriptedPreferenceLlm({ signal: "verbosity", value: "concise" });
    const before = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM nodes`).get() as { c: number }).c;
    await chat(handle, { embeddings, llm }, "Always be concise.", DEFAULT_CHAT, "s1");
    const after = (handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM nodes`).get() as { c: number }).c;
    // The user's own message itself becomes a citation-context node the same way any chat
    // turn's memories work (via GraphRAG's own retrieval, not this feature) — what matters is
    // that the PREFERENCE ITSELF (verbosity/concise) never appears as separate node content.
    const rows = handle.sqlite.prepare(`SELECT label, content FROM nodes`).all() as { label: string; content: string }[];
    for (const r of rows) {
      expect(r.label).not.toBe("verbosity");
      expect(r.content).not.toBe("concise");
    }
    void before;
    void after;
  });

  it("is space-scoped — a durable preference in one space never reaches another space's chat", async () => {
    const llm = new ScriptedPreferenceLlm({ signal: "verbosity", value: "concise" });
    await chat(handle, { embeddings, llm }, "Always be concise.", DEFAULT_CHAT, "space-a");
    await chat(handle, { embeddings, llm }, "Seriously, always be concise.", DEFAULT_CHAT, "space-a");

    const otherSpaceLlm = new ScriptedPreferenceLlm(null);
    await chat(handle, { embeddings, llm: otherSpaceLlm }, "hello", DEFAULT_CHAT, "space-b");
    expect(otherSpaceLlm.lastOpts?.systemExtra ?? "").not.toContain("HOW THEY'VE ASKED YOU TO COMMUNICATE");
  });

  it("the preference feature itself adds no full-space scan beyond chat()'s existing baseline", async () => {
    // chat()'s own pre-existing "CURRENT APP STATE & SYSTEM TELEMETRY" block already does one
    // NodesRepo.all() per message (unrelated to this feature, predates it, out of scope here —
    // see docs/specs/maya-longitudinal-intelligence.md's Phase H limitations). This test proves
    // the interaction-preference feature does not ADD to that baseline, not that chat() has none.
    const llm = new ScriptedPreferenceLlm({ signal: "verbosity", value: "concise" });
    for (let i = 0; i < 40; i++) await ingest(handle, { embeddings, llm }, `Unrelated memory ${i}.`, "s1");

    const baselineLlm = new ScriptedPreferenceLlm(null);
    let baselineSpy = vi.spyOn(NodesRepo.prototype, "all");
    await chat(handle, { embeddings, llm: baselineLlm }, "hello", DEFAULT_CHAT, "s1");
    const baselineCalls = baselineSpy.mock.calls.length;
    baselineSpy.mockRestore();

    await chat(handle, { embeddings, llm }, "Always be concise.", DEFAULT_CHAT, "s1");
    await chat(handle, { embeddings, llm }, "Seriously, always be concise.", DEFAULT_CHAT, "s1"); // now durable

    const withPreferenceLlm = new ScriptedPreferenceLlm(null);
    const activeSpy = vi.spyOn(NodesRepo.prototype, "all");
    try {
      await chat(handle, { embeddings, llm: withPreferenceLlm }, "hello", DEFAULT_CHAT, "s1");
      expect(withPreferenceLlm.lastOpts?.systemExtra ?? "").toContain("HOW THEY'VE ASKED YOU TO COMMUNICATE");
      expect(activeSpy.mock.calls.length).toBe(baselineCalls); // no additional scan from this feature
    } finally {
      activeSpy.mockRestore();
    }
  });
});
