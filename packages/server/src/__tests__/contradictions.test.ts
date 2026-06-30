import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { ingest } from "../ingestion/pipeline.js";
import { InsightsRepo } from "../repositories/insights.repo.js";
import { runContradictionScan } from "../synthesis/contradictions.js";

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

describe("contradiction detection (#3)", () => {
  it("heuristic flags an explicit reversal as a conflict, and aligned memories as not", async () => {
    const conflict = await llm.detectContradiction(
      { label: "career", content: "I want to quit my job and leave the company." },
      { label: "career", content: "I will stay at my job, I do not want to quit." },
      0.9,
    );
    expect(conflict.conflict).toBe(true);
    expect(conflict.text.length).toBeGreaterThan(0);
    expect(conflict.score).toBeGreaterThan(0);

    const aligned = await llm.detectContradiction(
      { label: "career", content: "I enjoy my job and my team." },
      { label: "career", content: "My job has been rewarding lately." },
      0.9,
    );
    expect(aligned.conflict).toBe(false);
    expect(aligned.text).toBe("");
    expect(aligned.score).toBe(0);
  });

  it("runContradictionScan persists a kind:'contradiction' insight for a conflicting pair", async () => {
    await ingest(handle, { embeddings, llm }, "I want to quit my job and start my own business.");
    await ingest(handle, { embeddings, llm }, "I will not quit my job; I want to stay and grow here.");

    // Low threshold so the same-topic pair is definitely a candidate regardless of
    // hash-embedding cosine; the contradiction verdict is what we're testing.
    const created = await runContradictionScan(
      handle,
      llm,
      { threshold: 0.05, k: 6, maxCandidates: 10 },
      "legacy",
    );
    expect(created.length).toBeGreaterThan(0);
    expect(created[0]!.kind).toBe("contradiction");

    // It surfaces in the digest with its kind tag.
    const recent = new InsightsRepo(handle, "legacy").recent();
    expect(recent.some((i) => i.kind === "contradiction")).toBe(true);
  });

  it("a second scan does not duplicate the same contradiction", async () => {
    await ingest(handle, { embeddings, llm }, "I love living in this city and never want to leave.");
    await ingest(handle, { embeddings, llm }, "I hate this city now and want to leave as soon as I can.");
    const opts = { threshold: 0.05, k: 6, maxCandidates: 10 };
    const first = await runContradictionScan(handle, llm, opts, "legacy");
    expect(first.length).toBeGreaterThan(0);
    const second = await runContradictionScan(handle, llm, opts, "legacy");
    expect(second.length).toBe(0); // already recorded → deduped
  });

  it("synthesis and contradiction insights can coexist for the same pair", () => {
    const repo = new InsightsRepo(handle, "legacy");
    handle.sqlite.prepare(`INSERT INTO nodes (space_id, label, type, content) VALUES ('legacy','A','other','a')`).run();
    handle.sqlite.prepare(`INSERT INTO nodes (space_id, label, type, content) VALUES ('legacy','B','other','b')`).run();
    repo.create(1, 2, "they connect", 0.7, "synthesis");
    expect(repo.existsPair(1, 2, "synthesis")).toBe(true);
    expect(repo.existsPair(1, 2, "contradiction")).toBe(false);
    repo.create(1, 2, "they conflict", 0.8, "contradiction");
    expect(repo.existsPair(1, 2, "contradiction")).toBe(true);
  });
});
