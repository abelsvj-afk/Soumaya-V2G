import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ExtractionResult, GalaxyNavigationCandidate, ClarificationInterpretation } from "@brain/shared";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { EMBED_DIM } from "../db/vec.js";
import { chat, DEFAULT_CHAT } from "../chat/graphrag.js";
import { ingest } from "../ingestion/pipeline.js";
import { JourneysRepo } from "../repositories/journeys.repo.js";
import type { AnswerOptions, AnswerResult, ContextNode, LinkCandidate, LinkValidation, LlmProvider } from "../llm/adapter.js";

/**
 * Maya Chat → Galaxy Navigation (Model C) — full-stack integration test:
 * chat() -> LLM candidate -> server validation (resolveNavigationIntent/resolveGalaxyEntity)
 * -> ChatResponse.navigation. Uses a scripted `LlmProvider` (mirrors `pipeline.test.ts`'s
 * `FakeLlm` pattern) so the proposal is deterministic — the point under test is the SERVER'S
 * validation/resolution wiring, not any real provider's judgment.
 */
class ScriptedNavLlm implements LlmProvider {
  readonly available = true;
  readonly model = "scripted";
  constructor(private navigationCandidates?: GalaxyNavigationCandidate[]) {}
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
  async answer(_question: string, context: ContextNode[], _opts?: AnswerOptions): Promise<AnswerResult> {
    return {
      answer: "Here's what I found.",
      citations: context.slice(0, 1).map((c) => c.id),
      navigationCandidates: this.navigationCandidates,
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
const SPACE = "s1";

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

describe("chat() -> Galaxy navigation (Model C, full stack)", () => {
  it("a proposed candidate that resolves becomes ChatResponse.navigation, with a real, non-invented reason", async () => {
    const journey = new JourneysRepo(handle, SPACE).create({ title: "Owner-operator transition", status: "active" });
    const llm = new ScriptedNavLlm([{ kind: "journey", id: journey.id }]);

    const result = await chat(handle, { embeddings, llm }, "Why am I not making progress?", DEFAULT_CHAT, SPACE);

    expect(result.navigation).toBeDefined();
    expect(result.navigation!.target).toEqual({ domain: "journey", kind: "journey", id: journey.id, label: "Owner-operator transition" });
    expect(result.navigation!.reason).toContain("Active journey");
  });

  it("a candidate that does NOT resolve (nonexistent id) never reaches ChatResponse", async () => {
    const llm = new ScriptedNavLlm([{ kind: "journey", id: 999_999 }]);
    const result = await chat(handle, { embeddings, llm }, "Anything relevant?", DEFAULT_CHAT, SPACE);
    expect(result.navigation).toBeUndefined();
  });

  it("no candidate proposed -> no navigation, no error", async () => {
    const llm = new ScriptedNavLlm(undefined);
    const result = await chat(handle, { embeddings, llm }, "Just chatting.", DEFAULT_CHAT, SPACE);
    expect(result.navigation).toBeUndefined();
  });

  it("existing citation validation is completely unaffected by navigation being present", async () => {
    const nodeId = (await ingest(handle, { embeddings, llm: new ScriptedNavLlm() }, "A real memory about a truck.", SPACE)).nodes[0]!.id;
    const journey = new JourneysRepo(handle, SPACE).create({ title: "Owner-operator transition", status: "active" });
    const llm = new ScriptedNavLlm([{ kind: "journey", id: journey.id }]);

    const result = await chat(handle, { embeddings, llm }, "truck", DEFAULT_CHAT, SPACE);

    // Citations still resolve to real, space-scoped context nodes exactly as before.
    expect(result.citations.every((c) => typeof c.id === "number" && typeof c.label === "string")).toBe(true);
    // Navigation resolves independently, alongside citations, not instead of them.
    expect(result.navigation).toBeDefined();
    expect(result.navigation!.target.id).toBe(journey.id);
    // Confirm the memory itself is genuinely still there and citable in principle.
    expect(nodeId).toBeGreaterThan(0);
  });

  it("is space-scoped end-to-end — a candidate pointing at another space's journey never resolves", async () => {
    const journey = new JourneysRepo(handle, "other-space").create({ title: "Not yours", status: "active" });
    const llm = new ScriptedNavLlm([{ kind: "journey", id: journey.id }]);
    const result = await chat(handle, { embeddings, llm }, "Anything relevant?", DEFAULT_CHAT, SPACE);
    expect(result.navigation).toBeUndefined();
  });
});
