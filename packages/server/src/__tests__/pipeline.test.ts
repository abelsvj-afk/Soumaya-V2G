import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ExtractionResult } from "@brain/shared";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { createEmbeddingProvider } from "../embeddings/adapter.js";
import { EMBED_DIM } from "../db/vec.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import type { ContextNode, LinkCandidate, LinkValidation, LlmProvider } from "../llm/adapter.js";
import { ingest } from "../ingestion/pipeline.js";
import { NodesRepo } from "../repositories/nodes.repo.js";

/** Deterministic LLM stand-in. */
class FakeLlm implements LlmProvider {
  readonly available = true;
  readonly model = "fake";
  constructor(private readonly extraction?: ExtractionResult) {}
  async extract(text: string, _ctx: ContextNode[]): Promise<ExtractionResult> {
    return (
      this.extraction ?? {
        nodes: [{ label: text.slice(0, 24), type: "daily", content: text }],
        edges: [],
      }
    );
  }
  async validateLink(
    _s: LinkCandidate,
    _t: LinkCandidate,
    similarity: number,
  ): Promise<LinkValidation> {
    return { linked: true, relationship: "relates_to", weight: similarity };
  }
  async synthesize(
    a: LinkCandidate,
    b: LinkCandidate,
    similarity: number,
  ): Promise<{ text: string; score: number }> {
    return { text: `${a.label} ~ ${b.label}`, score: similarity };
  }
  async detectContradiction(
    _a: LinkCandidate,
    _b: LinkCandidate,
    _similarity: number,
  ): Promise<{ conflict: boolean; text: string; score: number }> {
    return { conflict: false, text: "", score: 0 };
  }
  async answer(
    _question: string,
    context: ContextNode[],
  ): Promise<{ answer: string; citations: number[] }> {
    return { answer: "ok", citations: context.map((c) => c.id) };
  }
  async research(node: LinkCandidate): Promise<{ label: string; content: string }> {
    return { label: node.label, content: node.content };
  }
  async summarizeSector(_nodes: LinkCandidate[]): Promise<string> {
    return "calm";
  }
  async generateDailyLog(_n: LinkCandidate[], _a: string[]): Promise<string> {
    return "log";
  }
}

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => {
  handle.sqlite.close();
});

describe("ingestion pipeline", () => {
  it("extracts, embeds, and stores a node (with retrievable embedding)", async () => {
    const res = await ingest(
      handle,
      { embeddings, llm: new FakeLlm() },
      "A fleeting idea about morning routines",
    );
    expect(res.nodes).toHaveLength(1);
    const stored = new NodesRepo(handle).getById(res.nodes[0]!.id);
    expect(stored?.content).toContain("morning routines");
    const vecCount = handle.sqlite.prepare(`SELECT COUNT(*) AS c FROM vec_nodes`).get() as {
      c: number;
    };
    expect(vecCount.c).toBe(1);
  });

  it("stamps user temporal metadata (occurredAt, remindAt, tags) onto created nodes", async () => {
    const occurredAt = "2026-06-12T14:30:00.000Z";
    const remindAt = "2026-07-01T09:00:00.000Z";
    const res = await ingest(
      handle,
      { embeddings, llm: new FakeLlm() },
      "Closed the Acme deal",
      undefined,
      { occurredAt, remindAt, tags: ["Work", "Excited"] },
    );
    const stored = new NodesRepo(handle).getById(res.nodes[0]!.id)!;
    expect(stored.occurredAt).toBe(occurredAt);
    expect(stored.remindAt).toBe(remindAt);
    expect(stored.tags).toEqual(["Work", "Excited"]);
    // Round-trips through the JSON column (no metadata = undefined, not empty array).
    const plain = await ingest(handle, { embeddings, llm: new FakeLlm() }, "no tags here");
    expect(new NodesRepo(handle).getById(plain.nodes[0]!.id)!.tags).toBeUndefined();
  });

  it("persists LLM-extracted edges between nodes in the same input", async () => {
    const extraction: ExtractionResult = {
      nodes: [
        { label: "Coffee subscription", type: "project", content: "monthly coffee delivery" },
        { label: "Roaster partnership", type: "project", content: "partner with local roasters" },
      ],
      edges: [{ sourceLabel: "Coffee subscription", targetLabel: "Roaster partnership", relationship: "builds_on" }],
    };
    const res = await ingest(handle, { embeddings, llm: new FakeLlm(extraction) }, "raw");
    expect(res.nodes).toHaveLength(2);
    expect(res.extractedEdges).toHaveLength(1);
    expect(res.extractedEdges[0]!.relationship).toBe("builds_on");
    expect(res.extractedEdges[0]!.source).toBe(res.nodes[0]!.id);
    expect(res.extractedEdges[0]!.target).toBe(res.nodes[1]!.id);
  });

  it("auto-discovers an associative link to a semantically similar older memory", async () => {
    const deps = { embeddings, llm: new FakeLlm(), linkOptions: { threshold: 0.6, k: 10 } };
    const first = await ingest(handle, deps, "I want to start a coffee subscription business");
    const second = await ingest(handle, deps, "I want to start a coffee subscription company");

    expect(second.associativeEdges.length).toBeGreaterThanOrEqual(1);
    const edge = second.associativeEdges[0]!;
    expect(edge.source).toBe(second.nodes[0]!.id);
    expect(edge.target).toBe(first.nodes[0]!.id);
    expect(edge.weight).toBeGreaterThanOrEqual(0.6);
  });

  it("does not link unrelated thoughts below the similarity threshold", async () => {
    const deps = { embeddings, llm: new FakeLlm(), linkOptions: { threshold: 0.85, k: 10 } };
    await ingest(handle, deps, "quantum chromodynamics lattice gauge theory");
    const second = await ingest(handle, deps, "my grandmother's apple pie recipe");
    expect(second.associativeEdges).toHaveLength(0);
  });

  it("works with the no-key heuristic provider (guesses node type)", async () => {
    const res = await ingest(
      handle,
      { embeddings, llm: new HeuristicProvider() },
      "I have a startup idea for a SaaS product targeting the coffee market",
    );
    expect(res.nodes).toHaveLength(1);
    expect(res.nodes[0]!.type).toBe("project");
  });

  it("heuristic classifies into the Wire-the-Brain taxonomy", async () => {
    const llm = new HeuristicProvider();
    const kindOf = async (text: string) =>
      (await ingest(handle, { embeddings, llm }, text)).nodes[0]!.type;
    expect(await kindOf("Met with Sara this morning to sync on the launch")).toBe("meeting");
    expect(await kindOf("I decided to delay the launch — too risky right now")).toBe("decision");
    expect(await kindOf("Acme Inc is our biggest vendor this quarter")).toBe("company");
    expect(await kindOf("My sister called, our relationship feels lighter lately")).toBe("person");
    expect(await kindOf("New product idea: a SaaS roadmap tool")).toBe("project");
    expect(await kindOf("The definition of compound interest, for reference")).toBe("knowledge");
    expect(await kindOf("Slept okay, walked the dog, quiet day")).toBe("daily");
  });
});

describe("embedding provider factory", () => {
  it("builds a hash provider with the correct dimension", async () => {
    const provider = await createEmbeddingProvider("hash");
    expect(provider.dim).toBe(EMBED_DIM);
    const v = await provider.embed("hello world");
    expect(v).toHaveLength(EMBED_DIM);
    // L2-normalized.
    let norm = 0;
    for (const x of v) norm += x * x;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 5);
  });
});
