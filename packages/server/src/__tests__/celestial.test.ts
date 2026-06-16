import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { deriveMass, classify, CELESTIAL_CLASSES } from "@brain/shared";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { ingest } from "../ingestion/pipeline.js";
import { GraphService } from "../graph/service.js";

describe("celestial mass model", () => {
  it("ranks serious + connected + emotional memories heavier", () => {
    const trivial = deriveMass({ importance: 0.2, degree: 0, emotionalWeight: 0 });
    const serious = deriveMass({ importance: 0.9, degree: 0, emotionalWeight: 0 });
    const hub = deriveMass({ importance: 0.9, degree: 6, emotionalWeight: -0.8 });
    expect(serious).toBeGreaterThan(trivial);
    expect(hub).toBeGreaterThan(serious);
    expect(hub).toBeLessThanOrEqual(1);
  });

  it("classifies mass into six progressive tiers", () => {
    expect(classify(0.9)).toBe("supergiant");
    expect(classify(0.65)).toBe("star");
    expect(classify(0.5)).toBe("giant");
    expect(classify(0.35)).toBe("planet");
    expect(classify(0.18)).toBe("moon");
    expect(classify(0.05)).toBe("asteroid");
  });
});

describe("graph service enrichment", () => {
  let handle: DbHandle;
  const embeddings = new HashEmbeddingProvider(EMBED_DIM);
  const llm = new HeuristicProvider();

  beforeEach(() => {
    handle = createDb(":memory:");
  });
  afterEach(() => {
    handle.sqlite.close();
  });

  it("attaches degree, mass, and a celestial class to every node", async () => {
    await ingest(handle, { embeddings, llm }, "a fleeting note about socks");
    await ingest(
      handle,
      { embeddings, llm },
      "a serious reflection on death, family, faith, and my life purpose",
    );

    const graph = new GraphService(handle).overview();
    expect(graph.nodes.length).toBe(2);
    for (const n of graph.nodes) {
      expect(typeof n.degree).toBe("number");
      expect(n.mass).toBeGreaterThanOrEqual(0);
      expect(n.mass).toBeLessThanOrEqual(1);
      expect(CELESTIAL_CLASSES).toContain(n.celestial);
    }

    const serious = graph.nodes.find((n) => n.content.includes("death"))!;
    const trivial = graph.nodes.find((n) => n.content.includes("socks"))!;
    expect(serious.mass!).toBeGreaterThan(trivial.mass!);
  });
});
