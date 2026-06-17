import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { ingest } from "../ingestion/pipeline.js";
import { findCandidates, runSynthesis } from "../synthesis/engine.js";
import { buildDailyDigest } from "../synthesis/dailyDigest.js";
import { findConstellations } from "../ml/cluster.js";
import { chat } from "../chat/graphrag.js";

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => {
  handle.sqlite.close();
});

// Ingest without associative linking so pairs stay graph-distant for synthesis.
async function add(text: string) {
  return ingest(handle, { embeddings, llm, linkOptions: { threshold: 1.01, k: 0 } }, text);
}

describe("synthesis engine", () => {
  it("finds latent (semantically near, graph-distant) pairs and writes insights", async () => {
    await add("coffee subscription business with local roasters");
    await add("coffee subscription company with local roasters");
    await add("unrelated thoughts about lunar geology and rocks");

    const candidates = findCandidates(handle, {
      threshold: 0.6,
      k: 8,
      minHops: 3,
      maxCandidates: 12,
    });
    expect(candidates.length).toBeGreaterThanOrEqual(1);

    const insights = await runSynthesis(handle, llm, {
      threshold: 0.6,
      k: 8,
      minHops: 3,
      maxCandidates: 12,
    });
    expect(insights.length).toBeGreaterThanOrEqual(1);
    expect(insights[0]!.nodes.length).toBe(2);
    expect(insights[0]!.text.length).toBeGreaterThan(0);
  });

  it("does not duplicate insights for the same pair on a second run", async () => {
    await add("morning meditation routine and breathing");
    await add("daily breathing meditation in the morning");
    const opts = { threshold: 0.5, k: 8, minHops: 3, maxCandidates: 12 };
    const first = await runSynthesis(handle, llm, opts);
    const second = await runSynthesis(handle, llm, opts);
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(second.length).toBe(0);
  });
});

describe("chat (GraphRAG)", () => {
  it("retrieves relevant memories and returns cited answer", async () => {
    await add("I want to start a coffee subscription business");
    await add("my budget for the coffee startup is tight");

    const res = await chat(handle, { embeddings, llm }, "coffee subscription budget");
    expect(res.contextIds.length).toBeGreaterThanOrEqual(1);
    expect(res.answer.length).toBeGreaterThan(0);
    // Heuristic cites the retrieved context nodes; all citations are valid ids.
    expect(res.citations.length).toBeGreaterThanOrEqual(1);
    expect(res.citations.every((c) => res.contextIds.includes(c.id))).toBe(true);
  });

  it("handles an empty brain gracefully", async () => {
    const res = await chat(handle, { embeddings, llm }, "anything?");
    expect(res.contextIds).toHaveLength(0);
    expect(res.citations).toHaveLength(0);
  });
});

describe("daily digest (free, no LLM)", () => {
  it("summarizes memories logged today with a link + Soumaya's take", async () => {
    await add("Launching my coffee subscription startup");
    await add("Budget runway for the startup is tight and stressful");

    const d = buildDailyDigest(handle);
    expect(d.fresh.length).toBeGreaterThanOrEqual(2);
    expect(d.greeting.length).toBeGreaterThan(0);
    expect(d.closing.length).toBeGreaterThan(0);
    // Each entry carries a focusable node ref, a snippet, and an in-character take.
    for (const e of d.fresh) {
      expect(typeof e.node.id).toBe("number");
      expect(e.snippet.length).toBeGreaterThan(0);
      expect(e.take.length).toBeGreaterThan(0);
    }
  });

  it("is empty-but-valid for a fresh brain", () => {
    const d = buildDailyDigest(handle);
    expect(d.fresh).toHaveLength(0);
    expect(d.expiredActions).toHaveLength(0);
    expect(d.greeting.length).toBeGreaterThan(0);
  });
});

describe("constellations (ML / k-means, no LLM)", () => {
  it("groups every embedded memory into a named constellation", async () => {
    const texts = [
      "Launching my coffee subscription startup",
      "Partnering with local coffee roasters",
      "Pricing the coffee subscription tiers",
      "My mother's birthday is in October",
      "A hard conversation with my father",
      "Calling an old friend I miss",
    ];
    for (const t of texts) await add(t);

    const cs = findConstellations(handle);
    expect(cs.length).toBeGreaterThanOrEqual(2);
    // Every memory lands in exactly one constellation; names + cohesion are valid.
    const total = cs.reduce((n, c) => n + c.nodes.length, 0);
    expect(total).toBe(texts.length);
    for (const c of cs) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.cohesion).toBeGreaterThanOrEqual(0);
      expect(c.cohesion).toBeLessThanOrEqual(1);
    }
  });

  it("returns nothing for a brain too small to cluster", async () => {
    await add("only one thought");
    expect(findConstellations(handle)).toHaveLength(0);
  });
});

describe("heuristic link validation (offline, no LLM)", () => {
  it("links thoughts that share real topical vocabulary", async () => {
    const r = await llm.validateLink(
      { label: "Coffee startup", content: "launching a coffee subscription company" },
      { label: "Coffee budget", content: "the coffee startup budget is tight" },
      0.7,
    );
    expect(r.linked).toBe(true);
    expect(r.weight ?? 0).toBeGreaterThan(0);
  });

  it("refuses to link unrelated thoughts at moderate similarity", async () => {
    const r = await llm.validateLink(
      { label: "Quantum lattice", content: "quantum chromodynamics gauge theory" },
      { label: "Apple pie", content: "grandmother's apple pie recipe" },
      0.7,
    );
    expect(r.linked).toBe(false);
  });

  it("still links on an unambiguous (very high) cosine match", async () => {
    const r = await llm.validateLink(
      { label: "Totally distinct A", content: "alpha bravo charlie" },
      { label: "Totally distinct B", content: "delta echo foxtrot" },
      0.95,
    );
    expect(r.linked).toBe(true);
  });
});
